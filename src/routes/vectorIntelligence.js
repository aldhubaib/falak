const express = require('express')
const router = express.Router()
const db = require('../lib/db')
const { requireAuth, requireRole } = require('../middleware/auth')
const { RESCORE_BASE, RESCORE_LEARNED } = require('../lib/scoringConfig')

router.use(requireAuth)

router.get('/status', requireRole('owner', 'admin', 'editor', 'viewer'), async (req, res) => {
  try {
    const { channelId } = req.query
    if (!channelId) return res.status(400).json({ error: 'channelId required' })

    const channel = await db.channel.findUnique({
      where: { id: channelId },
      select: {
        lastStatsRefreshAt: true,
        rescoreIntervalHours: true,
      },
    })
    const embeddingKey = await db.apiKey.findUnique({ where: { service: 'embedding' } })

    const [
      totalVideos,
      videosWithEmbedding,
      totalStories,
      storiesWithEmbedding,
      recentAlerts,
      unreadAlertCount,
      scoreProfile,
    ] = await Promise.all([
      db.video.count({ where: { channel: { OR: [{ id: channelId }, { parentChannelId: channelId }] } } }),
      db.$queryRaw`SELECT count(*)::int as c FROM "Video" v JOIN "Channel" ch ON v."channelId" = ch.id WHERE (ch.id = ${channelId} OR ch."parentChannelId" = ${channelId}) AND v.embedding IS NOT NULL`,
      db.story.count({ where: { channelId } }),
      db.$queryRaw`SELECT count(*)::int as c FROM "Story" WHERE "channelId" = ${channelId} AND embedding IS NOT NULL`,
      db.alert.findMany({
        where: { channelId },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { id: true, type: true, title: true, detail: true, storyId: true, isRead: true, createdAt: true },
      }),
      db.alert.count({ where: { channelId, isRead: false } }),
      db.scoreProfile.findUnique({
        where: { channelId },
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
      FROM "Story" WHERE "channelId" = ${channelId}
    `

    const recentRescores = await db.$queryRaw`
      SELECT s.id, s.headline,
        s."compositeScore",
        s."lastRescoredAt",
        (s."rescoreLog"::jsonb->-1) as "latestEntry"
      FROM "Story" s
      WHERE s."channelId" = ${channelId}
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
      WHERE s."channelId" = ${channelId}
        AND s."rescoreLog" IS NOT NULL
        AND jsonb_array_length(s."rescoreLog"::jsonb) > 0
        AND s.stage NOT IN ('done', 'trash')
      ORDER BY (s."rescoreLog"::jsonb->-1->'factors'->>'provenViralBoost')::float DESC NULLS LAST
      LIMIT 10
    `

    res.json({
      hasEmbeddingKey: !!embeddingKey?.encryptedKey,
      lastStatsRefreshAt: channel?.lastStatsRefreshAt,
      rescoreIntervalHours: channel?.rescoreIntervalHours ?? 24,
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
      scoringFormula: { base: RESCORE_BASE, learned: RESCORE_LEARNED },
    })
  } catch (e) {
    console.error('[vector-intelligence/status]', e)
    res.status(500).json({ error: e.message })
  }
})

module.exports = router
