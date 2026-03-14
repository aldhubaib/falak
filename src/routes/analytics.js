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
          select: { viewCount: true, likeCount: true, commentCount: true, publishedAt: true, titleAr: true, titleEn: true }
        }
      }
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
          viewCount: Number(v.viewCount),
          likeCount: Number(v.likeCount),
          commentCount: Number(v.commentCount),
          publishedAt: v.publishedAt,
          titleAr: v.titleAr,
          titleEn: v.titleEn,
        })),
      }
    })

    // Universe totals (type: 'ours' = your channels, 'competitor' = others)
    const universe = {
      channels:       channels.length,
      owned:          channels.filter(c => c.type === 'ours').length,
      competitors:    channels.filter(c => c.type === 'competitor').length,
      totalSubscribers: stats.reduce((s, c) => s + parseInt(c.subscribers), 0),
      totalViews:       stats.reduce((s, c) => s + c.periodViews, 0),
      videosTracked:    stats.reduce((s, c) => s + c.videoCount, 0),
      avgEngagement:    avg(stats.map(c => c.avgEngagement)),
      avgUploads:       avg(stats.map(c => c.uploadsPerMonth)),
    }

    const payload = { universe, channels: stats }
    analyticsCache.set(cacheKey, payload)
    res.set('Cache-Control', 'private, max-age=300')
    res.json(payload)
})

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

module.exports = router
