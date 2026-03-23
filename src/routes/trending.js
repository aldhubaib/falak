const express = require('express')
const { z } = require('zod')
const db = require('../lib/db')
const { requireAuth, requireRole } = require('../middleware/auth')
const { parseQuery } = require('../lib/validate')

const router = express.Router()
router.use(requireAuth)

// ── GET /api/trending — combined latest from all (or filtered) countries ────
const latestSchema = z.object({
  countries: z.string().optional(),
  category: z.string().optional(),
})

router.get('/', async (req, res) => {
  try {
    const { countries: countriesRaw, category } = parseQuery(req.query, latestSchema)
    const countryFilter = countriesRaw
      ? countriesRaw.split(',').map(c => c.trim().toUpperCase()).filter(Boolean)
      : null

    const latestPerCountry = await db.$queryRaw`
      SELECT DISTINCT ON (country) id, country, "fetchedAt", "totalVideos"
      FROM "TrendingSnapshot"
      ${countryFilter ? db.$queryRaw`WHERE country = ANY(${countryFilter})` : db.$queryRaw``}
      ORDER BY country, "fetchedAt" DESC
    `.catch(() => [])

    // Fallback: if raw query has issues with conditional WHERE, use Prisma
    let snapshots = latestPerCountry
    if (!snapshots || snapshots.length === 0) {
      const allCountries = countryFilter
        ? await db.trendingSnapshot.findMany({
            where: { country: { in: countryFilter } },
            orderBy: { fetchedAt: 'desc' },
            distinct: ['country'],
            select: { id: true, country: true, fetchedAt: true, totalVideos: true },
          })
        : await db.trendingSnapshot.findMany({
            orderBy: { fetchedAt: 'desc' },
            distinct: ['country'],
            select: { id: true, country: true, fetchedAt: true, totalVideos: true },
          })
      snapshots = allCountries
    }

    if (snapshots.length === 0) return res.json({ snapshots: [], entries: [] })

    const snapshotIds = snapshots.map(s => s.id)
    const entryWhere = { snapshotId: { in: snapshotIds } }
    if (category) entryWhere.categoryName = category

    const entries = await db.trendingEntry.findMany({
      where: entryWhere,
      orderBy: { viewCount: 'desc' },
      include: { snapshot: { select: { country: true, fetchedAt: true } } },
    })

    const flat = entries.map(e => ({
      ...e,
      country: e.snapshot.country,
      snapshotFetchedAt: e.snapshot.fetchedAt,
      snapshot: undefined,
    }))

    res.json({ snapshots, entries: flat })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── GET /api/trending/history — snapshots over time ────────────────
const historySchema = z.object({
  countries: z.string().optional(),
  days: z.coerce.number().int().min(1).max(90).optional().default(30),
})

router.get('/history', async (req, res) => {
  try {
    const { countries: countriesRaw, days } = parseQuery(req.query, historySchema)
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    const countryFilter = countriesRaw
      ? countriesRaw.split(',').map(c => c.trim().toUpperCase()).filter(Boolean)
      : undefined

    const where = { fetchedAt: { gte: since } }
    if (countryFilter) where.country = { in: countryFilter }

    const snapshots = await db.trendingSnapshot.findMany({
      where,
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

// ── GET /api/trending/categories — distinct categories across selected countries ─
router.get('/categories', async (req, res) => {
  try {
    const { countries: countriesRaw } = parseQuery(req.query, z.object({ countries: z.string().optional() }))
    const countryFilter = countriesRaw
      ? countriesRaw.split(',').map(c => c.trim().toUpperCase()).filter(Boolean)
      : undefined

    const latestSnapshots = countryFilter
      ? await db.trendingSnapshot.findMany({
          where: { country: { in: countryFilter } },
          orderBy: { fetchedAt: 'desc' },
          distinct: ['country'],
          select: { id: true },
        })
      : await db.trendingSnapshot.findMany({
          orderBy: { fetchedAt: 'desc' },
          distinct: ['country'],
          select: { id: true },
        })

    if (!latestSnapshots.length) return res.json({ categories: [] })

    const rows = await db.trendingEntry.groupBy({
      by: ['categoryName'],
      where: { snapshotId: { in: latestSnapshots.map(s => s.id) }, categoryName: { not: null } },
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
    const { countries } = req.body
    const countryList = Array.isArray(countries) ? countries : countries ? [countries] : ['SA']

    const results = []
    for (const country of countryList) {
      const items = await fetchTrending(country.toUpperCase(), 50)
      const snapshot = await db.trendingSnapshot.create({
        data: {
          country: country.toUpperCase(),
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
      })
      results.push({ country: country.toUpperCase(), snapshotId: snapshot.id, videos: items.length })
    }
    res.json({ ok: true, results })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

module.exports = router
