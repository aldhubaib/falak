const express = require('express')
const { z } = require('zod')
const db = require('../lib/db')
const { requireAuth, requireRole } = require('../middleware/auth')
const { parseQuery } = require('../lib/validate')

const router = express.Router()
router.use(requireAuth)

// ── GET /api/trending — latest snapshot for a country ──────────────
const latestSchema = z.object({
  country: z.string().length(2).optional().default('SA'),
  category: z.string().optional(),
})

router.get('/', async (req, res) => {
  try {
    const { country, category } = parseQuery(req.query, latestSchema)

    const snapshot = await db.trendingSnapshot.findFirst({
      where: { country },
      orderBy: { fetchedAt: 'desc' },
      include: {
        entries: {
          where: category ? { categoryName: category } : {},
          orderBy: { rank: 'asc' },
        },
      },
    })
    if (!snapshot) return res.json({ snapshot: null, entries: [] })
    res.json({ snapshot: { id: snapshot.id, country: snapshot.country, fetchedAt: snapshot.fetchedAt, totalVideos: snapshot.totalVideos }, entries: snapshot.entries })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── GET /api/trending/history — snapshots over time ────────────────
const historySchema = z.object({
  country: z.string().length(2).optional().default('SA'),
  days: z.coerce.number().int().min(1).max(90).optional().default(30),
})

router.get('/history', async (req, res) => {
  try {
    const { country, days } = parseQuery(req.query, historySchema)
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

    const snapshots = await db.trendingSnapshot.findMany({
      where: { country, fetchedAt: { gte: since } },
      orderBy: { fetchedAt: 'desc' },
      select: { id: true, country: true, fetchedAt: true, totalVideos: true },
    })
    res.json({ snapshots })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── GET /api/trending/snapshot/:id — full entries for a snapshot ────
router.get('/snapshot/:id', async (req, res) => {
  try {
    const snapshot = await db.trendingSnapshot.findUnique({
      where: { id: req.params.id },
      include: { entries: { orderBy: { rank: 'asc' } } },
    })
    if (!snapshot) return res.status(404).json({ error: 'Snapshot not found' })
    res.json(snapshot)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── GET /api/trending/countries — countries with data ──────────────
router.get('/countries', async (req, res) => {
  try {
    const rows = await db.trendingSnapshot.groupBy({
      by: ['country'],
      _count: { id: true },
      _max: { fetchedAt: true },
      orderBy: { _count: { id: 'desc' } },
    })
    res.json({ countries: rows.map(r => ({ country: r.country, snapshots: r._count.id, lastFetched: r._max.fetchedAt })) })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── GET /api/trending/categories — distinct categories across data ─
router.get('/categories', async (req, res) => {
  try {
    const { country } = parseQuery(req.query, z.object({ country: z.string().length(2).optional().default('SA') }))

    const latest = await db.trendingSnapshot.findFirst({
      where: { country },
      orderBy: { fetchedAt: 'desc' },
      select: { id: true },
    })
    if (!latest) return res.json({ categories: [] })

    const rows = await db.trendingEntry.groupBy({
      by: ['categoryName'],
      where: { snapshotId: latest.id, categoryName: { not: null } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    })
    res.json({ categories: rows.map(r => ({ name: r.categoryName, count: r._count.id })) })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── GET /api/trending/video-history/:youtubeVideoId — track a video across snapshots ─
router.get('/video-history/:youtubeVideoId', async (req, res) => {
  try {
    const entries = await db.trendingEntry.findMany({
      where: { youtubeVideoId: req.params.youtubeVideoId },
      orderBy: { snapshot: { fetchedAt: 'asc' } },
      include: { snapshot: { select: { fetchedAt: true, country: true } } },
    })
    res.json({ entries })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── POST /api/trending/fetch — manually trigger a fetch (admin only) ─
router.post('/fetch', requireRole('owner', 'admin'), async (req, res) => {
  try {
    const { fetchTrending } = require('../services/youtube')
    const { country = 'SA' } = req.body

    const items = await fetchTrending(country, 50)
    const snapshot = await db.trendingSnapshot.create({
      data: {
        country,
        totalVideos: items.length,
        entries: {
          create: items.map((item, i) => ({
            rank: i + 1,
            youtubeVideoId: item.youtubeVideoId,
            title: item.title,
            channelName: item.channelName,
            channelId: item.channelId,
            categoryId: item.categoryId,
            categoryName: item.categoryName,
            viewCount: item.viewCount,
            likeCount: item.likeCount,
            commentCount: item.commentCount,
            duration: item.duration,
            publishedAt: item.publishedAt,
            thumbnailUrl: item.thumbnailUrl,
          })),
        },
      },
      include: { entries: { orderBy: { rank: 'asc' } } },
    })
    res.json({ ok: true, snapshot })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

module.exports = router
