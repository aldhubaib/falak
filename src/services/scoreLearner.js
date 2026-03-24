/**
 * Self-learning score profile: learns from user decisions and actual YouTube outcomes.
 * Builds a per-channel ScoreProfile that evolves over time.
 *
 * Two learning signals:
 *   1. Decisions: which stories did the user like/skip/trash?
 *   2. Outcomes: how did published (done) stories actually perform on YouTube?
 */
const db = require('../lib/db')
const logger = require('../lib/logger')

const LEARNING_RATE = 0.1
const MIN_OUTCOMES_FOR_ACCURACY = 3
const MIN_DECISIONS_FOR_SIGNALS = 5

function median(arr) {
  if (!arr.length) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/**
 * Get or create the score profile for a channel.
 */
async function getOrCreateProfile(channelId) {
  let profile = await db.scoreProfile.findUnique({ where: { channelId } })
  if (!profile) {
    profile = await db.scoreProfile.create({
      data: { id: require('crypto').randomUUID(), channelId, updatedAt: new Date() },
    })
  }
  return profile
}

/**
 * Learn from user decisions (liked/skip/trash story stage transitions).
 * Builds tagSignals, contentTypeSignals, regionSignals from what the user chose.
 */
async function learnFromDecisions(channelId) {
  const profile = await getOrCreateProfile(channelId)

  const positiveStages = ['liked', 'scripting', 'filmed', 'done']
  const negativeStages = ['skip', 'trash']

  const stories = await db.story.findMany({
    where: {
      channelId,
      stage: { in: [...positiveStages, ...negativeStages] },
    },
    select: { id: true, stage: true, brief: true },
  })

  const totalDecisions = stories.length
  if (totalDecisions < MIN_DECISIONS_FOR_SIGNALS) {
    return { totalDecisions, learned: false, reason: `Need at least ${MIN_DECISIONS_FOR_SIGNALS} decisions` }
  }

  const tagCounts = {}     // tag → { positive: n, negative: n }
  const ctCounts = {}      // contentType → { positive: n, negative: n }
  const regionCounts = {}  // region → { positive: n, negative: n }

  for (const story of stories) {
    const brief = (story.brief && typeof story.brief === 'object') ? story.brief : {}
    const isPositive = positiveStages.includes(story.stage)
    const key = isPositive ? 'positive' : 'negative'

    const tags = Array.isArray(brief.tags) ? brief.tags : []
    for (const tag of tags) {
      if (!tagCounts[tag]) tagCounts[tag] = { positive: 0, negative: 0 }
      tagCounts[tag][key]++
    }

    if (brief.contentType) {
      if (!ctCounts[brief.contentType]) ctCounts[brief.contentType] = { positive: 0, negative: 0 }
      ctCounts[brief.contentType][key]++
    }

    if (brief.region) {
      if (!regionCounts[brief.region]) regionCounts[brief.region] = { positive: 0, negative: 0 }
      regionCounts[brief.region][key]++
    }
  }

  const computeSignal = (counts) => {
    const result = {}
    for (const [key, { positive, negative }] of Object.entries(counts)) {
      const total = positive + negative
      if (total < 2) continue
      const ratio = positive / total
      const signal = (ratio - 0.5) * 2  // -1 to +1 scale
      result[key] = Math.round(signal * 100) / 100
    }
    return result
  }

  const newTagSignals = computeSignal(tagCounts)
  const newCtSignals = computeSignal(ctCounts)
  const newRegionSignals = computeSignal(regionCounts)

  const blendSignals = (existing, fresh) => {
    const result = { ...(existing || {}) }
    for (const [key, val] of Object.entries(fresh)) {
      const prev = result[key] || 0
      result[key] = Math.round((prev * (1 - LEARNING_RATE) + val * LEARNING_RATE) * 100) / 100
    }
    return result
  }

  await db.scoreProfile.update({
    where: { channelId },
    data: {
      tagSignals: blendSignals(profile.tagSignals, newTagSignals),
      contentTypeSignals: blendSignals(profile.contentTypeSignals, newCtSignals),
      regionSignals: blendSignals(profile.regionSignals, newRegionSignals),
      totalDecisions,
      lastLearnedAt: new Date(),
      updatedAt: new Date(),
    },
  })

  logger.info({
    channelId,
    totalDecisions,
    tagSignals: Object.keys(newTagSignals).length,
    ctSignals: Object.keys(newCtSignals).length,
    regionSignals: Object.keys(newRegionSignals).length,
  }, '[score-learner] learned from decisions')

  return { totalDecisions, learned: true }
}

/**
 * Learn from YouTube outcomes: how did our published stories actually perform?
 * Adjusts AI accuracy multipliers and updates channel performance baselines.
 */
async function learnFromOutcomes(channelId) {
  const profile = await getOrCreateProfile(channelId)

  const doneStories = await db.story.findMany({
    where: { channelId, stage: 'done' },
    select: {
      id: true, brief: true, producedVideoId: true,
      relevanceScore: true, viralScore: true, firstMoverScore: true,
    },
  })

  const withStats = []
  for (const story of doneStories) {
    const brief = (story.brief && typeof story.brief === 'object') ? story.brief : {}

    if (brief.views != null && brief.views > 0) {
      withStats.push({ ...story, _views: brief.views, _likes: brief.likes || 0, _comments: brief.comments || 0 })
      continue
    }

    if (story.producedVideoId) {
      const video = await db.video.findUnique({
        where: { id: story.producedVideoId },
        select: { viewCount: true, likeCount: true, commentCount: true },
      })
      if (video && Number(video.viewCount) > 0) {
        withStats.push({
          ...story,
          _views: Number(video.viewCount),
          _likes: Number(video.likeCount),
          _comments: Number(video.commentCount),
        })
      }
    }
  }

  if (withStats.length < MIN_OUTCOMES_FOR_ACCURACY) {
    return { totalOutcomes: withStats.length, learned: false, reason: `Need at least ${MIN_OUTCOMES_FOR_ACCURACY} outcomes with YouTube stats` }
  }

  const ownVideos = await db.video.findMany({
    where: { channelId, viewCount: { gt: 0 } },
    select: { viewCount: true },
    orderBy: { viewCount: 'asc' },
  })
  const viewCounts = ownVideos.map(v => Number(v.viewCount))
  const channelAvgViews = viewCounts.length > 0
    ? BigInt(Math.round(viewCounts.reduce((a, b) => a + b, 0) / viewCounts.length))
    : 0n
  const channelMedianViews = BigInt(Math.round(median(viewCounts)))
  const avgViewsNum = Number(channelAvgViews) || 1

  let viralAccuracySum = 0
  let count = 0

  for (const story of withStats) {
    const engagementRatio = story._views > 0
      ? (story._likes + story._comments) / story._views
      : 0

    const viewRatio = story._views / avgViewsNum
    const engagementSignal = engagementRatio > 0 ? Math.min(2, engagementRatio / 0.02) : 1
    const performanceRatio = viewRatio * 0.70 + engagementSignal * 0.30

    const predictedViral = (story.viralScore || 50) / 100
    const actualViral = Math.min(1, performanceRatio)

    if (predictedViral > 0.05) {
      viralAccuracySum += actualViral / predictedViral
      count++
    }
  }

  let aiViralAccuracy = profile.aiViralAccuracy
  if (count >= MIN_OUTCOMES_FOR_ACCURACY) {
    const observedAccuracy = Math.min(2.0, Math.max(0.5, viralAccuracySum / count))
    aiViralAccuracy = Math.round(
      (profile.aiViralAccuracy * (1 - LEARNING_RATE) + observedAccuracy * LEARNING_RATE) * 100
    ) / 100
  }

  const tagPerformance = {}
  for (const story of withStats) {
    const brief = (story.brief && typeof story.brief === 'object') ? story.brief : {}
    const ratio = story._views / avgViewsNum
    const tags = Array.isArray(brief.tags) ? brief.tags : []
    for (const tag of tags) {
      if (!tagPerformance[tag]) tagPerformance[tag] = []
      tagPerformance[tag].push(ratio)
    }
  }

  const outcomeTagSignals = {}
  for (const [tag, ratios] of Object.entries(tagPerformance)) {
    if (ratios.length < 2) continue
    const avgRatio = ratios.reduce((a, b) => a + b, 0) / ratios.length
    outcomeTagSignals[tag] = Math.round(Math.min(0.5, Math.max(-0.5, (avgRatio - 1) * 0.3)) * 100) / 100
  }

  const existingTagSignals = profile.tagSignals || {}
  for (const [tag, signal] of Object.entries(outcomeTagSignals)) {
    const prev = existingTagSignals[tag] || 0
    existingTagSignals[tag] = Math.round((prev * 0.4 + signal * 0.6) * 100) / 100
  }

  await db.scoreProfile.update({
    where: { channelId },
    data: {
      aiViralAccuracy,
      channelAvgViews,
      channelMedianViews,
      totalOutcomes: withStats.length,
      tagSignals: existingTagSignals,
      lastLearnedAt: new Date(),
      updatedAt: new Date(),
    },
  })

  logger.info({
    channelId,
    totalOutcomes: withStats.length,
    aiViralAccuracy,
    channelAvgViews: Number(channelAvgViews),
    outcomeTagSignals: Object.keys(outcomeTagSignals).length,
  }, '[score-learner] learned from outcomes')

  return { totalOutcomes: withStats.length, learned: true, aiViralAccuracy }
}

/**
 * Get the confidence level based on how much data the profile has learned from.
 * Returns 0.0–0.9 (never 1.0 — always trust AI at least 10%).
 */
function getConfidence(profile) {
  const total = (profile.totalOutcomes || 0) + (profile.totalDecisions || 0)
  if (total < 5) return 0
  if (total < 15) return 0.3
  if (total < 30) return 0.6
  return 0.9
}

module.exports = {
  getOrCreateProfile,
  learnFromDecisions,
  learnFromOutcomes,
  getConfidence,
}
