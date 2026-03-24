/**
 * Story re-scorer: re-evaluates active stories using competition data,
 * own channel performance, vector similarity, and the self-learning profile.
 *
 * Called by the rescore worker (scheduled) and the manual re-evaluate endpoint.
 */
const db = require('../lib/db')
const logger = require('../lib/logger')
const { getOrCreateProfile, getConfidence } = require('./scoreLearner')
const { findSimilarVideos, findSimilarOwnStories } = require('./embeddings')
const { getChannelStats } = require('./statsRefresher')
const { w, finalScoreToComposite, compositeToFinalScore } = require('../lib/scoringConfig')

const ACTIVE_STAGES = ['suggestion', 'liked', 'scripting', 'filmed']

/**
 * Re-score all active stories for a channel.
 * Returns summary of what changed.
 */
async function rescoreActiveStories(channelId) {
  const profile = await getOrCreateProfile(channelId)
  const confidence = getConfidence(profile)

  const stories = await db.story.findMany({
    where: { channelId, stage: { in: ACTIVE_STAGES } },
    select: {
      id: true, headline: true, stage: true, brief: true,
      relevanceScore: true, viralScore: true, firstMoverScore: true,
      compositeScore: true, sourceDate: true, createdAt: true,
      rescoreLog: true,
    },
  })

  // Preload embeddings for all active stories in a single query
  const storyIds = stories.map(s => s.id)
  const embeddingMap = new Map()
  if (storyIds.length > 0) {
    try {
      const rows = await db.$queryRaw`
        SELECT id, (embedding IS NOT NULL) as "hasEmbedding", embedding::text as embedding
        FROM "Story" WHERE id = ANY(${storyIds})
      `
      for (const row of rows) {
        embeddingMap.set(row.id, {
          hasEmbedding: row.hasEmbedding,
          embedding: row.embedding ? JSON.parse(row.embedding) : null,
        })
      }
    } catch (e) {
      logger.warn({ channelId, error: e.message }, '[rescorer] embedding preload failed')
    }
  }

  // Preload channel avg views for competition ratio calculations
  const competitorChannels = await db.channel.findMany({
    where: { parentChannelId: channelId, type: 'competitor', status: 'active' },
    select: { id: true },
  })
  const channelAvgMap = new Map()
  const CONCURRENCY = 5
  for (let i = 0; i < competitorChannels.length; i += CONCURRENCY) {
    const batch = competitorChannels.slice(i, i + CONCURRENCY)
    const results = await Promise.allSettled(batch.map(ch => getChannelStats(ch.id)))
    for (let j = 0; j < batch.length; j++) {
      const r = results[j]
      channelAvgMap.set(batch[j].id, r.status === 'fulfilled' ? (r.value.avgViews || 1) : 1)
    }
  }

  let evaluated = 0
  let changed = 0
  const alerts = []
  const logEntries = []
  const storyUpdates = []

  for (const story of stories) {
    const result = await rescoreStory(story, profile, confidence, channelAvgMap, channelId, embeddingMap)
    evaluated++

    if (result.changed) {
      changed++
      if (result.dbUpdate) storyUpdates.push(result.dbUpdate)

      const scoreDelta = result.after.compositeScore - result.before.compositeScore
      const direction = scoreDelta > 0 ? '↑' : '↓'
      logEntries.push({
        storyId: story.id,
        action: 'auto_rescore',
        note: `Score ${result.before.compositeScore.toFixed(1)} ${direction} ${result.after.compositeScore.toFixed(1)} | ` +
          (result.factors.competitionMatches > 0
            ? `${result.factors.competitionMatches} competition matches, `
            : '') +
          `confidence: ${Math.round(confidence * 100)}%`,
      })

      if (Math.abs(scoreDelta) >= 1.0) {
        alerts.push({
          storyId: story.id,
          type: 'score_change',
          title: `${story.headline.slice(0, 60)} — score ${direction} ${Math.abs(scoreDelta).toFixed(1)}`,
          scoreDelta,
        })
      }

      if (result.factors.newCompetitorVideos > 0) {
        alerts.push({
          storyId: story.id,
          type: 'competitor_published',
          title: `${result.factors.newCompetitorVideos} competitor(s) covered: ${story.headline.slice(0, 50)}`,
          detail: result.factors.topCompetitor,
        })
      }
    }
  }

  if (storyUpdates.length > 0 || logEntries.length > 0 || alerts.length > 0) {
    const ops = []
    for (const u of storyUpdates) ops.push(db.story.update(u))
    if (logEntries.length > 0) ops.push(db.storyLog.createMany({ data: logEntries }))
    if (alerts.length > 0) {
      ops.push(db.alert.createMany({
        data: alerts.map(a => ({
          channelId,
          storyId: a.storyId,
          type: a.type,
          title: a.title,
          detail: a.detail || null,
        })),
        skipDuplicates: true,
      }))
    }
    await db.$transaction(ops)
  }

  logger.info({ channelId, evaluated, changed, alerts: alerts.length, confidence }, '[rescorer] re-scored active stories')
  return { evaluated, changed, alerts: alerts.length }
}

/**
 * Re-score a single story. Returns before/after and whether anything changed.
 */
async function rescoreStory(story, profile, confidence, channelAvgMap, channelId, embeddingMap) {
  const brief = (story.brief && typeof story.brief === 'object') ? story.brief : {}
  const before = {
    relevanceScore: story.relevanceScore || 0,
    viralScore: story.viralScore || 0,
    firstMoverScore: story.firstMoverScore || 0,
    compositeScore: story.compositeScore || 0,
  }

  // ── 1. Recompute freshness (time decay) ──
  const sourceDate = story.sourceDate || story.createdAt
  const daysSince = Math.max(0, (Date.now() - new Date(sourceDate).getTime()) / 86400000)
  const freshness = Math.exp(-daysSince / 7 * Math.LN2)

  // ── 2. Vector similarity: find competition matches ──
  let provenViralBoost = 0
  let competitionMatches = 0
  let newCompetitorVideos = 0
  let topCompetitor = null

  const embData = embeddingMap?.get(story.id)
  const hasEmbedding = embData?.hasEmbedding
  const preloadedEmbedding = embData?.embedding

  if (hasEmbedding && preloadedEmbedding) {
    try {
      {
        const embedding = preloadedEmbedding

        const similar = await findSimilarVideos(embedding, channelId, 10)
        competitionMatches = similar.length

        if (similar.length > 0) {
          let totalRatio = 0
          for (const v of similar) {
            const channelAvg = channelAvgMap.get(v.channelId) || 1
            const ratio = Number(v.viewCount) / channelAvg
            totalRatio += ratio

            if (v.publishedAt && new Date(v.publishedAt) > new Date(story.createdAt)) {
              newCompetitorVideos++
              if (!topCompetitor || Number(v.viewCount) > Number(topCompetitor.viewCount)) {
                topCompetitor = {
                  channelName: v.channelName,
                  title: v.titleAr,
                  viewCount: Number(v.viewCount),
                  similarity: Number(v.similarity),
                }
              }
            }
          }

          const avgRatio = totalRatio / similar.length
          provenViralBoost = Math.round(Math.min(30, Math.max(-15, (avgRatio - 1) * 15)))
        }
      }
    } catch (e) {
      logger.warn({ storyId: story.id, error: e.message }, '[rescorer] vector search failed')
    }
  }

  // ── 3. Own channel affinity (from done stories with YouTube stats) ──
  let ownChannelBoost = 0
  if (hasEmbedding && preloadedEmbedding) {
    try {
      const ownSimilar = await findSimilarOwnStories(preloadedEmbedding, channelId, story.id, 5)
      const withViews = ownSimilar.filter(s => {
        const b = (s.brief && typeof s.brief === 'object') ? s.brief : {}
        return b.views > 0
      })
      if (withViews.length > 0) {
        const channelAvg = Number(profile.channelAvgViews) || 1
        let totalRatio = 0
        for (const s of withViews) {
          totalRatio += (s.brief.views || 0) / channelAvg
        }
        const avgOwnRatio = totalRatio / withViews.length
        ownChannelBoost = Math.round(Math.min(15, Math.max(-10, (avgOwnRatio - 1) * 10)))
      }
    } catch (_) {}
  }

  // ── 4. Apply learned profile adjustments ──
  let tagBoost = 0
  let contentTypeBoost = 0
  let regionBoost = 0

  if (confidence > 0) {
    const tags = Array.isArray(brief.tags) ? brief.tags : []
    const tagSignals = profile.tagSignals || {}
    for (const tag of tags) {
      tagBoost += (tagSignals[tag] || 0)
    }
    tagBoost = Math.max(-0.3, Math.min(0.3, tags.length > 0 ? tagBoost / tags.length : 0))

    contentTypeBoost = (profile.contentTypeSignals || {})[brief.contentType] || 0
    regionBoost = (profile.regionSignals || {})[brief.region] || 0
  }

  // ── 5. Correct AI accuracy ──
  const aiViralMultiplier = profile.aiViralAccuracy || 1.0
  const correctedViral = Math.round(Math.min(100, (story.viralScore || 0) * aiViralMultiplier))

  // ── 6. First mover adjustment ──
  let adjustedFirstMover = story.firstMoverScore || 40
  if (newCompetitorVideos > 0) {
    // Penalize: more competitors = lower first mover score
    const penalty = Math.min(60, newCompetitorVideos * 20)
    adjustedFirstMover = Math.max(0, adjustedFirstMover - penalty)
  }
  // Time decay on first mover (breaking news loses urgency)
  if (daysSince > 7) {
    adjustedFirstMover = Math.round(adjustedFirstMover * Math.max(0.3, 1 - (daysSince - 7) / 30))
  }

  // ── 7. Compute final score ──
  const baseScore = (
    (story.relevanceScore || 0) * w('relevance') +
    correctedViral * w('correctedViral') +
    adjustedFirstMover * w('firstMover') +
    (freshness * 100) * w('freshness')
  )

  const learnedBoost = (
    provenViralBoost * w('provenViral') +
    ownChannelBoost * w('ownChannel') +
    (tagBoost * 100) * w('tagSignals') +
    (contentTypeBoost * 100) * w('contentType') +
    (regionBoost * 100) * w('region')
  )

  // Blend base AI score with learned adjustments based on confidence
  const rawComposite = baseScore + learnedBoost * confidence
  const clampedRaw = Math.max(0, Math.min(100, rawComposite)) / 100
  const newCompositeScore = finalScoreToComposite(clampedRaw)

  const after = {
    relevanceScore: story.relevanceScore || 0,
    viralScore: correctedViral,
    firstMoverScore: adjustedFirstMover,
    compositeScore: newCompositeScore,
  }

  const scoreChanged = Math.abs(newCompositeScore - before.compositeScore) > 0.05

  // Update story if score changed
  if (scoreChanged) {
    const rescoreEntry = {
      at: new Date().toISOString(),
      trigger: 'scheduled',
      confidence: Math.round(confidence * 100) / 100,
      before,
      after,
      factors: {
        freshness: Math.round(freshness * 100) / 100,
        daysSincePublished: Math.round(daysSince * 10) / 10,
        provenViralBoost,
        competitionMatches,
        newCompetitorVideos,
        topCompetitor,
        ownChannelBoost,
        tagBoost: Math.round(tagBoost * 100) / 100,
        contentTypeBoost: Math.round(contentTypeBoost * 100) / 100,
        regionBoost: Math.round(regionBoost * 100) / 100,
        aiViralMultiplier,
        adjustedFirstMover,
      },
    }

    const existingLog = Array.isArray(story.rescoreLog) ? story.rescoreLog : []
    const updatedLog = [...existingLog.slice(-19), rescoreEntry] // keep last 20 entries

  }

  return {
    changed: scoreChanged,
    ...(scoreChanged ? {
      dbUpdate: {
        where: { id: story.id },
        data: {
          viralScore: correctedViral,
          firstMoverScore: adjustedFirstMover,
          compositeScore: newCompositeScore,
          finalScore: compositeToFinalScore(newCompositeScore),
          lastRescoredAt: new Date(),
          rescoreLog: updatedLog,
        },
      },
    } : {}),
    before,
    after,
    factors: {
      freshness,
      provenViralBoost,
      competitionMatches,
      newCompetitorVideos,
      topCompetitor,
      ownChannelBoost,
      tagBoost,
      contentTypeBoost,
      regionBoost,
      confidence,
    },
  }
}

module.exports = { rescoreActiveStories }
