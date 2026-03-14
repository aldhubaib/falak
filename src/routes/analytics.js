const express = require('express')
const { z } = require('zod')
const db = require('../lib/db')
const { requireAuth } = require('../middleware/auth')
const { parseQuery } = require('../lib/validate')
const { analyticsCache } = require('../lib/cache')

const router = express.Router()
router.use(requireAuth)

const analyticsQuerySchema = z.object({
  projectId: z.string().optional(),
  period: z.enum(['30d', '90d', '12m']).optional().default('12m'),
})

// ── GET /api/analytics?projectId=xxx&period=30d|90d|12m (cached 5 min, Cache-Control)
router.get('/', async (req, res) => {
  const { projectId, period } = parseQuery(req.query, analyticsQuerySchema)
  const cacheKey = `analytics:${projectId || 'all'}:${period}`
  const cached = analyticsCache.get(cacheKey)
  if (cached !== undefined) {
    res.set('Cache-Control', 'private, max-age=300')
    return res.json(cached)
  }

  const since = periodToDate(period)
  const channelWhere = projectId ? { projectId } : {}

  const channels = await db.channel.findMany({
    where: channelWhere,
    select: {
      id: true, nameAr: true, nameEn: true, handle: true, avatarUrl: true,
      type: true, subscribers: true, totalViews: true,
      videoCount: true, uploadCadence: true,
      videos: {
        where: { publishedAt: { gte: since }, omitFromAnalytics: { not: true } },
        select: {
          id: true,
          viewCount: true, likeCount: true, commentCount: true,
          publishedAt: true, titleAr: true, titleEn: true,
        },
      },
    },
  })

  const stats = channels.map(ch => {
    const views     = ch.videos.reduce((s, v) => s + Number(v.viewCount), 0)
    const likes     = ch.videos.reduce((s, v) => s + Number(v.likeCount), 0)
    const comments  = ch.videos.reduce((s, v) => s + Number(v.commentCount), 0)
    const videosCnt = ch.videos.length
    const engagement = videosCnt && views ? ((likes + comments) / views * 100).toFixed(2) : '0'
    const uploadsPerMonth = uploadRate(ch.videos, since)

    return {
      id:             ch.id,
      nameAr:         ch.nameAr,
      nameEn:         ch.nameEn,
      handle:         ch.handle,
      avatarUrl:      ch.avatarUrl,
      type:           ch.type,
      subscribers:    ch.subscribers.toString(),
      totalViews:     ch.totalViews.toString(),
      periodViews:    views,
      videoCount:     videosCnt,
      avgEngagement:  parseFloat(engagement),
      uploadsPerMonth,
      videos:         (ch.videos || []).map(v => ({
        id: v.id,
        viewCount:    Number(v.viewCount),
        likeCount:    Number(v.likeCount),
        commentCount: Number(v.commentCount),
        publishedAt:  v.publishedAt,
        titleAr:      v.titleAr,
        titleEn:      v.titleEn,
      })),
    }
  })

  // Universe totals
  const universe = {
    channels:         channels.length,
    owned:            channels.filter(c => c.type === 'ours').length,
    competitors:      channels.filter(c => c.type === 'competitor').length,
    totalSubscribers: stats.reduce((s, c) => s + parseInt(c.subscribers), 0),
    totalViews:       stats.reduce((s, c) => s + c.periodViews, 0),
    videosTracked:    stats.reduce((s, c) => s + c.videoCount, 0),
    avgEngagement:    avg(stats.map(c => c.avgEngagement)),
    avgUploads:       avg(stats.map(c => c.uploadsPerMonth)),
  }

  // ── Top videos by view count (period) ─────────────────────────────────────
  const allVideos = stats.flatMap(ch =>
    (ch.videos || []).map(v => ({
      ...v,
      channelId:   ch.id,
      channelName: ch.nameAr || ch.nameEn || ch.handle,
      avatarUrl:   ch.avatarUrl,
    }))
  )
  const topVideos = allVideos
    .sort((a, b) => b.viewCount - a.viewCount)
    .slice(0, 10)
    .map((v, i) => ({
      rank:        i + 1,
      id:          v.id,
      title:       v.titleAr || v.titleEn || '—',
      channelId:   v.channelId,
      channelName: v.channelName,
      avatarUrl:   v.avatarUrl,
      views:       fmtViews(v.viewCount),
      viewCount:   v.viewCount,
    }))

  // ── Monthly upload trend (last 12 months, always 12 buckets) ──────────────
  const trend = buildMonthlyTrend(stats)

  const payload = { universe, channels: stats, topVideos, trend }
  analyticsCache.set(cacheKey, payload)
  res.set('Cache-Control', 'private, max-age=300')
  res.json(payload)
})

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function periodToDate(period) {
  const now = new Date()
  if (period === '30d') return new Date(now - 30 * 86400000)
  if (period === '90d') return new Date(now - 90 * 86400000)
  return new Date(now.getFullYear() - 1, now.getMonth(), now.getDate())
}

function uploadRate(videos, since) {
  if (!videos.length) return 0
  const months = (Date.now() - since.getTime()) / (30 * 86400000)
  return parseFloat((videos.length / months).toFixed(1))
}

function avg(arr) {
  if (!arr.length) return 0
  return parseFloat((arr.reduce((s, v) => s + v, 0) / arr.length).toFixed(2))
}

function fmtViews(n) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`
  return String(n)
}

/**
 * Build 12-month upload trend buckets.
 * Returns: { months: string[], channels: { id, name, type, data: number[] }[] }
 * data[i] = number of videos published in month i
 */
function buildMonthlyTrend(stats) {
  const now = new Date()
  // Build 12 month labels (oldest → newest)
  const buckets = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    buckets.push({
      year: d.getFullYear(),
      month: d.getMonth(), // 0-indexed
      label: d.toLocaleString('en-US', { month: 'short', year: '2-digit' }),
    })
  }

  const channelTrends = stats.map(ch => {
    const counts = buckets.map(b => {
      return (ch.videos || []).filter(v => {
        if (!v.publishedAt) return false
        const pd = new Date(v.publishedAt)
        return pd.getFullYear() === b.year && pd.getMonth() === b.month
      }).length
    })
    return {
      id:   ch.id,
      name: ch.nameAr || ch.nameEn || ch.handle,
      type: ch.type,
      data: counts,
    }
  })

  return {
    months:   buckets.map(b => b.label),
    channels: channelTrends,
  }
}

module.exports = router
