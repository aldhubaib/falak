const express = require('express')
const router = express.Router()
const db = require('../lib/db')
const { requireAuth, requireRole } = require('../middleware/auth')

router.use(requireAuth)

router.get('/status', requireRole('owner', 'admin', 'editor', 'viewer'), async (req, res) => {
  try {
    const { projectId } = req.query
    if (!projectId) return res.status(400).json({ error: 'projectId required' })

    const project = await db.project.findUnique({
      where: { id: projectId },
      select: {
        embeddingApiKeyEncrypted: true,
        lastStatsRefreshAt: true,
        rescoreIntervalHours: true,
      },
    })

    const [
      totalVideos,
      videosWithEmbedding,
      totalStories,
      storiesWithEmbedding,
      recentAlerts,
      unreadAlertCount,
      scoreProfile,
    ] = await Promise.all([
      db.video.count({ where: { channel: { projectId } } }),
      db.$queryRaw`SELECT count(*)::int as c FROM "Video" v JOIN "Channel" ch ON v."channelId" = ch.id WHERE ch."projectId" = ${projectId} AND v.embedding IS NOT NULL`,
      db.story.count({ where: { projectId } }),
      db.$queryRaw`SELECT count(*)::int as c FROM "Story" WHERE "projectId" = ${projectId} AND embedding IS NOT NULL`,
      db.alert.findMany({
        where: { projectId },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { id: true, type: true, title: true, detail: true, storyId: true, isRead: true, createdAt: true },
      }),
      db.alert.count({ where: { projectId, isRead: false } }),
      db.scoreProfile.findUnique({
        where: { projectId },
        select: {
          totalOutcomes: true,
          totalDecisions: true,
          aiViralAccuracy: true,
          aiRelevanceAccuracy: true,
          channelAvgViews: true,
          tagSignals: true,
          contentTypeSignals: true,
          regionSignals: true,
          lastLearnedAt: true,
        },
      }).catch(() => null),
    ])

    const rescored = await db.$queryRaw`
      SELECT count(*)::int as total,
             count(*) FILTER (WHERE "rescoreLog" IS NOT NULL AND jsonb_array_length("rescoreLog"::jsonb) > 0)::int as rescored
      FROM "Story" WHERE "projectId" = ${projectId}
    `

    const recentRescores = await db.$queryRaw`
      SELECT s.id, s.headline,
        s."compositeScore",
        s."lastRescoredAt",
        (s."rescoreLog"::jsonb->-1) as "latestEntry"
      FROM "Story" s
      WHERE s."projectId" = ${projectId}
        AND s."rescoreLog" IS NOT NULL
        AND jsonb_array_length(s."rescoreLog"::jsonb) > 0
      ORDER BY s."lastRescoredAt" DESC NULLS LAST
      LIMIT 15
    `

    const topSimilarity = await db.$queryRaw`
      SELECT s.id, s.headline,
        (s."rescoreLog"::jsonb->-1->'factors'->>'competitionMatches')::int as "competitionMatches",
        (s."rescoreLog"::jsonb->-1->'factors'->>'provenViralBoost')::float as "viralBoost",
        (s."rescoreLog"::jsonb->-1->'factors'->>'freshness')::float as freshness,
        s."compositeScore"
      FROM "Story" s
      WHERE s."projectId" = ${projectId}
        AND s."rescoreLog" IS NOT NULL
        AND jsonb_array_length(s."rescoreLog"::jsonb) > 0
        AND s.stage NOT IN ('done', 'omit')
      ORDER BY (s."rescoreLog"::jsonb->-1->'factors'->>'provenViralBoost')::float DESC NULLS LAST
      LIMIT 10
    `

    res.json({
      hasEmbeddingKey: !!project?.embeddingApiKeyEncrypted,
      lastStatsRefreshAt: project?.lastStatsRefreshAt,
      rescoreIntervalHours: project?.rescoreIntervalHours ?? 24,
      embeddings: {
        videos: { total: totalVideos, embedded: videosWithEmbedding?.[0]?.c ?? 0 },
        stories: { total: totalStories, embedded: storiesWithEmbedding?.[0]?.c ?? 0 },
      },
      rescoreStats: {
        total: rescored?.[0]?.total ?? 0,
        rescored: rescored?.[0]?.rescored ?? 0,
      },
      scoreProfile,
      alerts: { items: recentAlerts, unreadCount: unreadAlertCount },
      recentRescores,
      topSimilarity,
    })
  } catch (e) {
    console.error('[vector-intelligence/status]', e)
    res.status(500).json({ error: e.message })
  }
})

module.exports = router
