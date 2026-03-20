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
  const videoWhere = {
    channelId: { in: channelIds },
    publishedAt: { gte: since },
    omitFromAnalytics: { not: true },
  }

  // ── DB-level aggregation (replaces loading 50K rows + JS reduce) ──────
  const [channelAggs, contentMixAggs, topVideosRaw, videoMeta, snapshots] = channelIds.length > 0
    ? await Promise.all([
        db.video.groupBy({
          by: ['channelId'],
          where: videoWhere,
          _sum: { viewCount: true, likeCount: true, commentCount: true },
          _count: true,
        }),
        db.video.groupBy({
          by: ['channelId', 'videoType'],
          where: videoWhere,
          _sum: { viewCount: true, likeCount: true, commentCount: true },
          _count: true,
        }),
        db.video.findMany({
          where: videoWhere,
          select: {
            id: true, channelId: true, viewCount: true,
            titleAr: true, titleEn: true,
          },
          orderBy: { viewCount: 'desc' },
          take: 10,
        }),
        db.video.findMany({
          where: videoWhere,
          select: {
            channelId: true, publishedAt: true,
            viewCount: true, likeCount: true, commentCount: true,
            videoType: true,
          },
        }),
        (() => {
          const twelveMonthsAgo = new Date()
          twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12)
          return db.channelSnapshot.findMany({
            where: { channelId: { in: channelIds }, snapshotAt: { gte: twelveMonthsAgo } },
            orderBy: { snapshotAt: 'asc' },
            select: {
              channelId: true, subscribers: true, totalViews: true,
              videoCount: true, engagement: true, snapshotAt: true,
            },
          })
        })(),
      ])
    : [[], [], [], [], []]

  const aggMap = new Map()
  for (const row of channelAggs) {
    aggMap.set(row.channelId, {
      views: Number(row._sum.viewCount || 0),
      likes: Number(row._sum.likeCount || 0),
      comments: Number(row._sum.commentCount || 0),
      count: row._count,
    })
  }

  const stats = channels.map(ch => {
    const agg = aggMap.get(ch.id) || { views: 0, likes: 0, comments: 0, count: 0 }
    const engagement = agg.count && agg.views ? ((agg.likes + agg.comments) / agg.views * 100).toFixed(2) : '0'
    const months = (Date.now() - since.getTime()) / (30 * 86400000)
    const uploadsPerMonth = agg.count ? parseFloat((agg.count / months).toFixed(1)) : 0

    return {
      id:             ch.id,
      nameAr:         ch.nameAr,
      nameEn:         ch.nameEn,
      handle:         ch.handle,
      avatarUrl:      ch.avatarUrl,
      type:           ch.type,
      subscribers:    Number(ch.subscribers).toString(),
      totalViews:     Number(ch.totalViews).toString(),
      periodViews:    agg.views,
      videoCount:     agg.count,
      avgEngagement:  parseFloat(engagement),
      uploadsPerMonth,
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

  // ── Top videos ────────────────────────────────────────────────────────
  const chLookup = new Map(channels.map(c => [c.id, c]))
  const topVideos = topVideosRaw.map((v, i) => {
    const ch = chLookup.get(v.channelId)
    return {
      rank:        i + 1,
      id:          v.id,
      title:       v.titleAr || v.titleEn || '—',
      channelId:   v.channelId,
      channelName: ch?.nameAr || ch?.nameEn || ch?.handle || '—',
      avatarUrl:   ch?.avatarUrl,
      views:       fmtViews(Number(v.viewCount)),
      viewCount:   Number(v.viewCount),
    }
  })

  // ── Monthly trend (Videos / Views / Likes — all tabs pre-computed) ────
  const trend = buildMonthlyTrend(stats, videoMeta)

  // ── Growth snapshots ──────────────────────────────────────────────────
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

  // ── Content mix (from DB groupBy) ─────────────────────────────────────
  const mixMap = new Map()
  for (const row of contentMixAggs) {
    if (!mixMap.has(row.channelId)) mixMap.set(row.channelId, { videos: null, shorts: null })
    const entry = mixMap.get(row.channelId)
    const bucket = {
      count: row._count,
      views: Number(row._sum.viewCount || 0),
      likes: Number(row._sum.likeCount || 0),
      comments: Number(row._sum.commentCount || 0),
    }
    if (row.videoType === 'short') entry.shorts = bucket
    else entry.videos = bucket
  }
  const contentMix = channels.map(ch => {
    const m = mixMap.get(ch.id) || {}
    const v = m.videos || { count: 0, views: 0, likes: 0, comments: 0 }
    const s = m.shorts || { count: 0, views: 0, likes: 0, comments: 0 }
    const vidEng = v.count && v.views ? ((v.likes + v.comments) / v.views * 100) : 0
    const shortEng = s.count && s.views ? ((s.likes + s.comments) / s.views * 100) : 0
    return {
      channelId: ch.id,
      videos: { count: v.count, views: v.views, avgViews: v.count ? Math.round(v.views / v.count) : 0, engagement: parseFloat(vidEng.toFixed(2)) },
      shorts: { count: s.count, views: s.views, avgViews: s.count ? Math.round(s.views / s.count) : 0, engagement: parseFloat(shortEng.toFixed(2)) },
    }
  })

  // ── Engagement breakdown (from aggregates) ────────────────────────────
  const engagementBreakdown = stats.map(ch => {
    const agg = aggMap.get(ch.id) || { views: 0, likes: 0, comments: 0 }
    return {
      channelId: ch.id,
      name: ch.nameAr || ch.nameEn || ch.handle,
      type: ch.type,
      likes: agg.likes,
      comments: agg.comments,
      views: agg.views,
      likeRate: agg.views ? parseFloat((agg.likes / agg.views * 100).toFixed(3)) : 0,
      commentRate: agg.views ? parseFloat((agg.comments / agg.views * 100).toFixed(3)) : 0,
    }
  })

  // ── Publishing patterns (from lightweight videoMeta) ──────────────────
  const TZ = 'Asia/Riyadh'
  const patternMap = new Map()
  for (const v of videoMeta) {
    if (!v.publishedAt) continue
    if (!patternMap.has(v.channelId)) patternMap.set(v.channelId, { day: [0,0,0,0,0,0,0], hour: new Array(24).fill(0) })
    const p = patternMap.get(v.channelId)
    const d = new Date(v.publishedAt)
    const localStr = d.toLocaleString('en-US', { timeZone: TZ, weekday: 'short', hour: 'numeric', hour12: false })
    const parts = localStr.split(', ')
    const dayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
    p.day[dayMap[parts[0]] ?? 0]++
    const hr = parseInt(d.toLocaleString('en-US', { timeZone: TZ, hour: 'numeric', hour12: false }))
    if (!isNaN(hr)) p.hour[hr]++
  }
  const publishingPatterns = channels.map(ch => {
    const p = patternMap.get(ch.id) || { day: [0,0,0,0,0,0,0], hour: new Array(24).fill(0) }
    return { channelId: ch.id, name: ch.nameAr || ch.nameEn || ch.handle, type: ch.type, dayOfWeek: p.day, hourOfDay: p.hour }
  })

  // ── Performance distribution (from lightweight videoMeta) ─────────────
  const allViewCounts = videoMeta.map(v => Number(v.viewCount)).sort((a, b) => a - b)
  const pct = (arr, pc) => arr.length ? arr[Math.min(Math.floor(arr.length * pc), arr.length - 1)] : 0
  const performanceDistribution = {
    total: allViewCounts.length,
    min: allViewCounts[0] || 0,
    p10: pct(allViewCounts, 0.1),
    p25: pct(allViewCounts, 0.25),
    median: pct(allViewCounts, 0.5),
    p75: pct(allViewCounts, 0.75),
    p90: pct(allViewCounts, 0.9),
    max: allViewCounts[allViewCounts.length - 1] || 0,
    mean: allViewCounts.length ? Math.round(allViewCounts.reduce((s, v) => s + v, 0) / allViewCounts.length) : 0,
    buckets: buildViewBuckets(allViewCounts),
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
 * Build 12-month upload trend buckets with pre-computed Views and Likes tabs.
 * Returns: { months: string[], channels: { id, name, type, data, viewData, likeData }[] }
 */
function buildMonthlyTrend(stats, videoMeta) {
  const TZ = 'Asia/Riyadh'
  const now = new Date()
  const buckets = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const label = d.toLocaleString('en-US', { month: 'short', year: '2-digit', timeZone: TZ })
    const localStr = d.toLocaleString('en-US', { year: 'numeric', month: 'numeric', day: 'numeric', timeZone: TZ })
    const localDate = new Date(localStr)
    buckets.push({ year: localDate.getFullYear(), month: localDate.getMonth(), label })
  }

  // Pre-bucket all videoMeta by channelId → bucketIndex
  const channelBuckets = new Map()
  for (const v of videoMeta) {
    if (!v.publishedAt) continue
    const pd = new Date(v.publishedAt)
    const ls = pd.toLocaleString('en-US', { year: 'numeric', month: 'numeric', day: 'numeric', timeZone: TZ })
    const ld = new Date(ls)
    const bi = buckets.findIndex(b => ld.getFullYear() === b.year && ld.getMonth() === b.month)
    if (bi < 0) continue
    if (!channelBuckets.has(v.channelId)) channelBuckets.set(v.channelId, buckets.map(() => ({ count: 0, views: 0, likes: 0 })))
    const arr = channelBuckets.get(v.channelId)
    arr[bi].count++
    arr[bi].views += Number(v.viewCount)
    arr[bi].likes += Number(v.likeCount)
  }

  const channelTrends = stats.map(ch => {
    const arr = channelBuckets.get(ch.id) || buckets.map(() => ({ count: 0, views: 0, likes: 0 }))
    return {
      id:       ch.id,
      name:     ch.nameAr || ch.nameEn || ch.handle,
      type:     ch.type,
      data:     arr.map(b => b.count),
      viewData: arr.map(b => b.views),
      likeData: arr.map(b => b.likes),
    }
  })

  return { months: buckets.map(b => b.label), channels: channelTrends }
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
