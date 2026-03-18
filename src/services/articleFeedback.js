/**
 * Article Feedback Service
 *
 * Learns from user decisions on stories (liked, passed, omit) to build a
 * preference profile per project. The profile is used by articleProcessor
 * to bias future article scores toward what the user actually wants.
 *
 * The profile is stored in a simple JSON structure, recalculated on demand.
 */
const db = require('../lib/db')
const logger = require('../lib/logger')

const PROFILE_CACHE = new Map()
const CACHE_TTL_MS = 5 * 60 * 1000

/**
 * Get cached preference profile, or build fresh if stale.
 */
async function getPreferenceProfile(projectId) {
  const cached = PROFILE_CACHE.get(projectId)
  if (cached && Date.now() - cached.builtAt < CACHE_TTL_MS) {
    return cached.profile
  }
  const profile = await buildPreferenceProfile(projectId)
  PROFILE_CACHE.set(projectId, { profile, builtAt: Date.now() })
  return profile
}

/**
 * Force rebuild the preference profile (called after story stage changes).
 */
async function refreshPreferenceProfile(projectId) {
  const profile = await buildPreferenceProfile(projectId)
  PROFILE_CACHE.set(projectId, { profile, builtAt: Date.now() })
  return profile
}

/**
 * Build the preference profile from story decisions.
 *
 * Positive signals: stories in 'liked', 'scripting', 'filmed', 'publish', 'done'
 * Negative signals: stories in 'passed', 'omit'
 */
async function buildPreferenceProfile(projectId) {
  const stories = await db.story.findMany({
    where: {
      projectId,
      stage: { in: ['liked', 'scripting', 'filmed', 'publish', 'done', 'passed', 'omit'] },
      brief: { not: null },
    },
    select: { stage: true, brief: true },
    take: 500,
    orderBy: { updatedAt: 'desc' },
  })

  if (stories.length < 3) return null

  const tagCounts = { liked: {}, omit: {} }
  const typeCounts = { liked: {}, omit: {} }
  const regionCounts = { liked: {}, omit: {} }

  for (const story of stories) {
    const brief = story.brief && typeof story.brief === 'object' ? story.brief : {}
    const tags = Array.isArray(brief.tags) ? brief.tags : []
    const contentType = brief.contentType || null
    const region = brief.region || null

    const isPositive = ['liked', 'scripting', 'filmed', 'publish', 'done'].includes(story.stage)
    const isNegative = ['omit'].includes(story.stage)
    // 'passed' is weak negative — we count it but with lower weight
    const isPassed = story.stage === 'passed'

    const bucket = isPositive ? 'liked' : 'omit'

    if (isPositive || isNegative) {
      for (const tag of tags) {
        tagCounts[bucket][tag] = (tagCounts[bucket][tag] || 0) + 1
      }
      if (contentType) {
        typeCounts[bucket][contentType] = (typeCounts[bucket][contentType] || 0) + 1
      }
      if (region) {
        regionCounts[bucket][region] = (regionCounts[bucket][region] || 0) + 1
      }
    }

    if (isPassed) {
      for (const tag of tags) {
        tagCounts.omit[tag] = (tagCounts.omit[tag] || 0) + 0.3
      }
      if (contentType) {
        typeCounts.omit[contentType] = (typeCounts.omit[contentType] || 0) + 0.3
      }
    }
  }

  const likedTags = topKeys(tagCounts.liked, 30)
  const omitTags = topKeys(tagCounts.omit, 20).filter(t => !likedTags.includes(t))
  const preferredTypes = topKeys(typeCounts.liked, 5)
  const avoidedTypes = topKeys(typeCounts.omit, 3).filter(t => !preferredTypes.includes(t))
  const preferredRegions = topKeys(regionCounts.liked, 10)

  return {
    likedTags,
    omitTags,
    preferredTypes,
    avoidedTypes,
    preferredRegions,
    storiesAnalyzed: stories.length,
    builtAt: new Date().toISOString(),
  }
}

function topKeys(obj, limit) {
  return Object.entries(obj)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([k]) => k)
}

module.exports = { getPreferenceProfile, refreshPreferenceProfile, buildPreferenceProfile }
