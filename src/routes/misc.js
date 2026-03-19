const express = require('express')
const db = require('../lib/db')
const { requireAuth, requireRole } = require('../middleware/auth')
const { fetchChannel } = require('../services/youtube')

// ── MONITOR ────────────────────────────────────────────────────
const monitor = express.Router()
monitor.use(requireAuth)

monitor.get('/', async (req, res) => {
  try {
    const { channelId } = req.query
    const where = channelId
      ? { OR: [{ id: channelId }, { parentChannelId: channelId }] }
      : {}
    const channels = await db.channel.findMany({
      where,
      select: {
        id: true, nameAr: true, nameEn: true, handle: true, avatarUrl: true,
        type: true, status: true, lastFetchedAt: true, uploadCadence: true,
        _count: { select: { videos: true } },
        videos: { orderBy: { publishedAt: 'desc' }, take: 1, select: { publishedAt: true } }
      },
      orderBy: { lastFetchedAt: 'asc' }
    })
    const list = channels.map(ch => {
      const { videos, ...rest } = ch
      const lastVideoPublishedAt = videos && videos[0] ? videos[0].publishedAt : null
      return { ...rest, lastVideoPublishedAt }
    })
    res.json(list)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── ADMIN (user management) ────────────────────────────────────
const admin = express.Router()
admin.use(requireAuth)
admin.use(requireRole('owner', 'admin'))

admin.get('/users', async (req, res) => {
  try {
    const users = await db.user.findMany({
      select: {
        id: true, email: true, name: true, avatarUrl: true,
        role: true, note: true, isActive: true,
        pageAccess: true, channelAccess: true,
        createdAt: true, updatedAt: true,
      },
      orderBy: { createdAt: 'asc' }
    })
    res.json(users)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

admin.post('/users', async (req, res) => {
  try {
    const { email, role, note, pageAccess, channelAccess } = req.body
    if (!email) return res.status(400).json({ error: 'email required' })

    const existing = await db.user.findUnique({ where: { email } })
    if (existing) return res.status(409).json({ error: 'User already exists' })

    const user = await db.user.create({
      data: { email, role: role || 'viewer', note, pageAccess, channelAccess }
    })
    res.json(user)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

admin.patch('/users/:id', async (req, res) => {
  try {
    // Prevent owner from demoting themselves
    if (req.params.id === req.user.id && req.body.role && req.body.role !== 'owner') {
      return res.status(400).json({ error: 'Cannot change your own role' })
    }
    const allowed = ['role', 'note', 'isActive', 'pageAccess', 'channelAccess']
    const data = {}
    for (const k of allowed) if (req.body[k] !== undefined) data[k] = req.body[k]

    const user = await db.user.update({ where: { id: req.params.id }, data })
    res.json(user)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

admin.delete('/users/:id', async (req, res) => {
  try {
    if (req.params.id === req.user.id) return res.status(400).json({ error: 'Cannot delete yourself' })
    await db.user.delete({ where: { id: req.params.id } })
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// Re-queue videos that have a plain-string transcription (not yet migrated to JSON segments).
// Call once after deploying the segment-storage update to re-process existing videos.
admin.post('/retranscribe-all', async (req, res) => {
  try {
    const videos = await db.video.findMany({
      where: { transcription: { not: null } },
      select: {
        id: true,
        transcription: true,
        pipelineItem: { select: { id: true, stage: true } },
      },
    })

    // A transcription is "already migrated" if it's valid JSON containing an array.
    const needsMigration = videos.filter(v => {
      try {
        const p = JSON.parse(v.transcription)
        return !Array.isArray(p)   // has content but it's not an array
      } catch (_) {
        return true                // plain string — not valid JSON at all
      }
    })

    let reset = 0
    for (const v of needsMigration) {
      if (v.pipelineItem) {
        await db.pipelineItem.update({
          where: { id: v.pipelineItem.id },
          data: { stage: 'transcribe', status: 'queued', error: null, retries: 0 },
        })
        reset++
      }
    }

    res.json({ ok: true, total: videos.length, reset })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── PROFILES (replaces projects) ──────────────────────────────
const profiles = express.Router()
profiles.use(requireAuth)

profiles.get('/', async (req, res) => {
  try {
    const items = await db.channel.findMany({
      where: { type: 'ours', parentChannelId: null },
      include: { _count: { select: { stories: true, competitors: true } } },
      orderBy: { createdAt: 'asc' }
    })
    res.json(items)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

profiles.post('/', requireRole('owner', 'admin'), async (req, res) => {
  try {
    const { handle, color } = req.body
    if (!handle) return res.status(400).json({ error: 'YouTube handle required' })

    const ytData = await fetchChannel(handle)

    const exists = await db.channel.findUnique({ where: { youtubeId: ytData.youtubeId } })
    if (exists) {
      if (exists.type === 'ours' && !exists.parentChannelId) {
        return res.status(409).json({ error: 'This channel is already a profile' })
      }
      const promoted = await db.channel.update({
        where: { id: exists.id },
        data: {
          ...ytData,
          type: 'ours',
          parentChannelId: null,
          color: color || exists.color || '#3b82f6',
          status: 'active',
          lastFetchedAt: new Date(),
        }
      })
      return res.json(promoted)
    }

    const channel = await db.channel.create({
      data: {
        ...ytData,
        color: color || '#3b82f6',
        type: 'ours',
        status: 'active',
        lastFetchedAt: new Date(),
      }
    })
    res.json(channel)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

profiles.patch('/:id', requireRole('owner', 'admin'), async (req, res) => {
  try {
    const { nameAr, nameEn, color, status } = req.body
    const data = {}
    if (nameAr !== undefined) data.nameAr = nameAr
    if (nameEn !== undefined) data.nameEn = nameEn
    if (color !== undefined) data.color = color
    if (status !== undefined) data.status = status
    const channel = await db.channel.update({ where: { id: req.params.id }, data })
    res.json(channel)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

profiles.delete('/:id', requireRole('owner'), async (req, res) => {
  try {
    await db.channel.delete({ where: { id: req.params.id } })
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// GET /api/profiles/:id/usage?limit=50&cursor=<lastId>
profiles.get('/:id/usage', requireRole('owner', 'admin'), async (req, res) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit || '50', 10), 100)
    const cursor = req.query.cursor || null

    const rows = await db.apiUsage.findMany({
      where: { channelId: req.params.id },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    })

    const hasMore = rows.length > limit
    const page    = hasMore ? rows.slice(0, limit) : rows
    const nextCursor = hasMore ? page[page.length - 1].id : null

    const shaped = page.map(r => ({
      id:     r.id,
      ts:     new Date(r.createdAt).toISOString(),
      api:    r.service,
      action: r.action || '—',
      tokens: r.tokensUsed,
      status: r.status,
      error:  r.error,
    }))

    res.json({ rows: shaped, nextCursor, hasMore })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

module.exports = { monitor, admin, profiles }
