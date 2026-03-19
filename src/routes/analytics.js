const express = require('express')
const { z } = require('zod')
const db = require('../lib/db')
const { requireAuth } = require('../middleware/auth')
const { parseQuery } = require('../lib/validate')
const { analyticsCache } = require('../lib/cache')

const router = express.Router()
router.use(requireAuth)

const analyticsQuerySchema = z.object({
  channelId: z.string().optional(),
  period: z.enum(['30d', '90d', '12m']).optional().default('12m'),
})

const { requireRole } = require('../middleware/auth')

router.post('/flush-cache', requireRole('owner', 'admin'), async (req, res) => {
  analyticsCache.flush()
  res.json({ ok: true, message: 'Analytics cache cleared' })
})

router.get('/', async (req, res) => {
  try {
  const { channelId, period } = parseQuery(req.query, analyticsQuerySchema)
  const cacheKey = `analytics:${channelId || 'all'}:${period}`
  const cached = analyticsCache.get(cacheKey)
  if (cached !== undefined) {
    res.set('Cache-Control', 'private, max-age=300')
    return res.json(cached)
  }

  const since = periodToDate(period)
  const channelWhere = channelId
    ? { OR: [{ id: channelId }, { parentChannelId: channelId }] }
    : {}

  const channels = await db.channel.findMany({
    where: channelWhere,
    select: {
      id: true, nameAr: true, nameEn: true, handle: true, avatarUrl: true,
      type: true, subscribers: true, totalViews: true,
      videoCount: true, uploadCadence: true,
    },
  })

  const channelIds = channels.map(c => c.id)

  const videos = channelIds.length > 0
    ? await db.video.findMany({
        where: {
          channelId: { in: channelIds },
          publishedAt: { gte: since },
          omitFromAnalytics: { not: true },
        },
        select: {
          id: true, channelId: true,
          viewCount: true, likeCount: true, commentCount: true,
          publishedAt: true, titleAr: true, titleEn: true,
          duration: true, videoType: true,
        },
        take: 50000,
      })
    : []

  const videosByChannel = new Map()
  for (const v of videos) {
    if (!videosByChannel.has(v.channelId)) videosByChannel.set(v.channelId, [])
    videosByChannel.get(v.channelId).push(v)
  }

  const stats = channels.map(ch => {
    const chVideos = videosByChannel.get(ch.id) || []
    const views     = chVideos.reduce((s, v) => s + Number(v.viewCount), 0)
    const likes     = chVideos.reduce((s, v) => s + Number(v.likeCount), 0)
    const comments  = chVideos.reduce((s, v) => s + Number(v.commentCount), 0)
    const videosCnt = chVideos.length
    const engagement = videosCnt && views ? ((likes + comments) / views * 100).toFixed(2) : '0'
    const uploadsPerMonth = uploadRate(chVideos, since)

    return {
      id:             ch.id,
      nameAr:         ch.nameAr,
      nameEn:         ch.nameEn,
      handle:         ch.handle,
      avatarUrl:      ch.avatarUrl,
      type:           ch.type,
      subscribers:    Number(ch.subscribers).toString(),
      totalViews:     Number(ch.totalViews).toString(),
      periodViews:    views,
      videoCount:     videosCnt,
      avgEngagement:  parseFloat(engagement),
      uploadsPerMonth,
      videos:         chVideos.map(v => ({
        id: v.id,
        viewCount:    Number(v.viewCount),
        likeCount:    Number(v.likeCount),
        commentCount: Number(v.commentCount),
        publishedAt:  v.publishedAt,
        titleAr:      v.titleAr,
        titleEn:      v.titleEn,
        duration:     v.duration,
        videoType:    v.videoType || 'video',
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

  // ── Growth snapshots (last 12 months per channel) ──────────────────────
  const twelveMonthsAgo = new Date()
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12)
  const snapshots = await db.channelSnapshot.findMany({
    where: {
      channelId: { in: channels.map(c => c.id) },
      snapshotAt: { gte: twelveMonthsAgo },
    },
    orderBy: { snapshotAt: 'asc' },
    select: {
      channelId: true,
      subscribers: true,
      totalViews: true,
      videoCount: true,
      engagement: true,
      snapshotAt: true,
    },
  })
  const growthByChannel = {}
  for (const snap of snapshots) {
    if (!growthByChannel[snap.channelId]) growthByChannel[snap.channelId] = []
    growthByChannel[snap.channelId].push({
      subscribers: Number(snap.subscribers),
      totalViews: Number(snap.totalViews),
      videoCount: snap.videoCount,
      engagement: snap.engagement,
      date: snap.snapshotAt,
    })
  }

  // ── Content mix (videos vs shorts) ─────────────────────────────────────
  const contentMix = stats.map(ch => {
    const vids = ch.videos.filter(v => !v.videoType || v.videoType === 'video')
    const shorts = ch.videos.filter(v => v.videoType === 'short')
    const vidViews = vids.reduce((s, v) => s + v.viewCount, 0)
    const shortViews = shorts.reduce((s, v) => s + v.viewCount, 0)
    const vidEngagement = vids.length && vidViews
      ? ((vids.reduce((s, v) => s + v.likeCount + v.commentCount, 0)) / vidViews * 100)
      : 0
    const shortEngagement = shorts.length && shortViews
      ? ((shorts.reduce((s, v) => s + v.likeCount + v.commentCount, 0)) / shortViews * 100)
      : 0
    return {
      channelId: ch.id,
      videos: { count: vids.length, views: vidViews, avgViews: vids.length ? Math.round(vidViews / vids.length) : 0, engagement: parseFloat(vidEngagement.toFixed(2)) },
      shorts: { count: shorts.length, views: shortViews, avgViews: shorts.length ? Math.round(shortViews / shorts.length) : 0, engagement: parseFloat(shortEngagement.toFixed(2)) },
    }
  })

  // ── Engagement breakdown (likes vs comments separate) ──────────────────
  const engagementBreakdown = stats.map(ch => {
    const totalLikes = ch.videos.reduce((s, v) => s + v.likeCount, 0)
    const totalComments = ch.videos.reduce((s, v) => s + v.commentCount, 0)
    const totalViews = ch.videos.reduce((s, v) => s + v.viewCount, 0)
    return {
      channelId: ch.id,
      name: ch.nameAr || ch.nameEn || ch.handle,
      type: ch.type,
      likes: totalLikes,
      comments: totalComments,
      views: totalViews,
      likeRate: totalViews ? parseFloat((totalLikes / totalViews * 100).toFixed(3)) : 0,
      commentRate: totalViews ? parseFloat((totalComments / totalViews * 100).toFixed(3)) : 0,
    }
  })

  // ── Publishing patterns (day-of-week + hour distribution) ──────────────
  const TZ = 'Asia/Riyadh'
  const publishingPatterns = stats.map(ch => {
    const dayDist = [0, 0, 0, 0, 0, 0, 0] // Sun-Sat
    const hourDist = new Array(24).fill(0)
    for (const v of ch.videos) {
      if (!v.publishedAt) continue
      const d = new Date(v.publishedAt)
      const localStr = d.toLocaleString('en-US', { timeZone: TZ, weekday: 'short', hour: 'numeric', hour12: false })
      const parts = localStr.split(', ')
      const dayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
      const dayIdx = dayMap[parts[0]] ?? 0
      dayDist[dayIdx]++
      const hr = parseInt(d.toLocaleString('en-US', { timeZone: TZ, hour: 'numeric', hour12: false }))
      if (!isNaN(hr)) hourDist[hr]++
    }
    return {
      channelId: ch.id,
      name: ch.nameAr || ch.nameEn || ch.handle,
      type: ch.type,
      dayOfWeek: dayDist,
      hourOfDay: hourDist,
    }
  })

  // ── Video performance distribution (percentiles, spread) ───────────────
  const allVideoViews = allVideos.map(v => v.viewCount).sort((a, b) => a - b)
  const p = (arr, pct) => arr.length ? arr[Math.min(Math.floor(arr.length * pct), arr.length - 1)] : 0
  const performanceDistribution = {
    total: allVideoViews.length,
    min: allVideoViews[0] || 0,
    p10: p(allVideoViews, 0.1),
    p25: p(allVideoViews, 0.25),
    median: p(allVideoViews, 0.5),
    p75: p(allVideoViews, 0.75),
    p90: p(allVideoViews, 0.9),
    max: allVideoViews[allVideoViews.length - 1] || 0,
    mean: allVideoViews.length ? Math.round(allVideoViews.reduce((s, v) => s + v, 0) / allVideoViews.length) : 0,
    buckets: buildViewBuckets(allVideoViews),
  }

  const payload = {
    universe, channels: stats, topVideos, trend,
    growth: growthByChannel,
    contentMix,
    engagementBreakdown,
    publishingPatterns,
    performanceDistribution,
  }
  analyticsCache.set(cacheKey, payload)
  res.set('Cache-Control', 'private, max-age=300')
  res.json(payload)
  } catch (e) {
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to load analytics' } })
  }
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
  const TZ = 'Asia/Riyadh'
  const now = new Date()
  // Build 12 month labels (oldest → newest) in GMT+3
  const buckets = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    // Use GMT+3 for label so it matches the frontend bucket comparison
    const label = d.toLocaleString('en-US', { month: 'short', year: '2-digit', timeZone: TZ })
    // year/month for bucketing — use the GMT+3 date
    const localStr = d.toLocaleString('en-US', { year: 'numeric', month: 'numeric', day: 'numeric', timeZone: TZ })
    const localDate = new Date(localStr)
    buckets.push({
      year:  localDate.getFullYear(),
      month: localDate.getMonth(),
      label,
    })
  }

  const channelTrends = stats.map(ch => {
    const counts = buckets.map(b => {
      return (ch.videos || []).filter(v => {
        if (!v.publishedAt) return false
        // Convert publishedAt to GMT+3 for bucket comparison
        const pd = new Date(v.publishedAt)
        const localStr = pd.toLocaleString('en-US', { year: 'numeric', month: 'numeric', day: 'numeric', timeZone: TZ })
        const localDate = new Date(localStr)
        return localDate.getFullYear() === b.year && localDate.getMonth() === b.month
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

function buildViewBuckets(sortedViews) {
  const labels = ['<1K', '1K–10K', '10K–100K', '100K–1M', '1M–10M', '10M+']
  const thresholds = [1000, 10000, 100000, 1000000, 10000000, Infinity]
  const counts = new Array(labels.length).fill(0)
  for (const v of sortedViews) {
    for (let i = 0; i < thresholds.length; i++) {
      if (v < thresholds[i]) { counts[i]++; break }
    }
  }
  return labels.map((label, i) => ({ label, count: counts[i] }))
}

module.exports = router
