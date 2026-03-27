const express = require('express')
const { z } = require('zod')
const db = require('../lib/db')
const { requireAuth, requireRole } = require('../middleware/auth')

const router = express.Router()
router.use(requireAuth)

const createSchema = z.object({
  channelId: z.string().min(1),
  name: z.string().min(1).max(100),
  hashtag1: z.string().min(1).max(50),
  hashtag2: z.string().min(1).max(50),
  hashtag3: z.string().min(1).max(50),
  description: z.string().max(500).optional().nullable(),
  rules: z.string().max(2000).optional().nullable(),
  youtubeId: z.string().max(100).optional().nullable(),
})

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  hashtag1: z.string().min(1).max(50).optional(),
  hashtag2: z.string().min(1).max(50).optional(),
  hashtag3: z.string().min(1).max(50).optional(),
  description: z.string().max(500).optional().nullable(),
  rules: z.string().max(2000).optional().nullable(),
  youtubeId: z.string().max(100).optional().nullable(),
})

// GET /api/playlists?channelId=xxx
router.get('/', async (req, res) => {
  try {
    const { channelId } = req.query
    if (!channelId) return res.status(400).json({ error: 'channelId is required' })

    const playlists = await db.playlist.findMany({
      where: { channelId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    })
    res.json(playlists)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /api/playlists
router.post('/', requireRole('owner', 'admin', 'editor'), async (req, res) => {
  try {
    const data = createSchema.parse(req.body)
    const stripped = {
      ...data,
      hashtag1: data.hashtag1.replace(/^#/, ''),
      hashtag2: data.hashtag2.replace(/^#/, ''),
      hashtag3: data.hashtag3.replace(/^#/, ''),
      youtubeId: data.youtubeId || null,
    }
    const playlist = await db.playlist.create({ data: stripped })
    res.json(playlist)
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors[0].message })
    if (e.code === 'P2002') return res.status(409).json({ error: 'A playlist with this YouTube ID already exists' })
    res.status(500).json({ error: e.message })
  }
})

// PATCH /api/playlists/:id
router.patch('/:id', requireRole('owner', 'admin', 'editor'), async (req, res) => {
  try {
    const data = updateSchema.parse(req.body)
    const stripped = { ...data }
    if (stripped.hashtag1) stripped.hashtag1 = stripped.hashtag1.replace(/^#/, '')
    if (stripped.hashtag2) stripped.hashtag2 = stripped.hashtag2.replace(/^#/, '')
    if (stripped.hashtag3) stripped.hashtag3 = stripped.hashtag3.replace(/^#/, '')
    if (stripped.youtubeId === '') stripped.youtubeId = null

    const playlist = await db.playlist.update({
      where: { id: req.params.id },
      data: stripped,
    })
    res.json(playlist)
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors[0].message })
    if (e.code === 'P2025') return res.status(404).json({ error: 'Playlist not found' })
    if (e.code === 'P2002') return res.status(409).json({ error: 'A playlist with this YouTube ID already exists' })
    res.status(500).json({ error: e.message })
  }
})

// DELETE /api/playlists/:id
router.delete('/:id', requireRole('owner', 'admin'), async (req, res) => {
  try {
    await db.playlist.delete({ where: { id: req.params.id } })
    res.json({ ok: true })
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Playlist not found' })
    res.status(500).json({ error: e.message })
  }
})

// POST /api/playlists/reorder — { ids: string[] }
router.post('/reorder', requireRole('owner', 'admin', 'editor'), async (req, res) => {
  try {
    const { ids } = req.body
    if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids array required' })

    await db.$transaction(
      ids.map((id, i) => db.playlist.update({ where: { id }, data: { sortOrder: i } })),
    )
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

module.exports = router
