const express = require('express')
const db = require('../lib/db')
const { requireAuth, requireRole } = require('../middleware/auth')

const router = express.Router()
router.use(requireAuth)
router.use(requireRole('owner', 'admin'))

const PAGES = [
  { slug: 'home', label: 'Home' },
  { slug: 'competitors', label: 'Competitors' },
  { slug: 'pipeline', label: 'Pipeline' },
  { slug: 'analytics', label: 'Analytics' },
  { slug: 'stories', label: 'AI Intelligence' },
  { slug: 'article-pipeline', label: 'Article Pipeline' },
  { slug: 'gallery', label: 'Gallery' },
  { slug: 'settings', label: 'Settings' },
  { slug: 'design-system', label: 'Design System' },
  { slug: 'admin', label: 'Admin' },
]

const PAGE_SLUGS = PAGES.map(p => p.slug)

// GET /api/admin/pages — list all assignable pages
router.get('/pages', (_req, res) => {
  res.json(PAGES)
})

// GET /api/admin/profiles — list all profiles (channels) for assignment
router.get('/profiles', async (_req, res) => {
  try {
    const profiles = await db.channel.findMany({
      where: { type: 'ours', parentChannelId: null },
      select: { id: true, nameAr: true, nameEn: true, handle: true, avatarUrl: true, color: true },
      orderBy: { createdAt: 'asc' },
    })
    res.json(profiles)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// GET /api/admin/users — list all users
router.get('/users', async (_req, res) => {
  try {
    const users = await db.user.findMany({
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        role: true,
        note: true,
        isActive: true,
        canCreateProfile: true,
        pageAccess: true,
        channelAccess: true,
        createdAt: true,
      },
    })
    res.json(users)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /api/admin/users — add a new user (by email, before they log in)
router.post('/users', async (req, res) => {
  try {
    const { email, role, note, pageAccess, channelAccess, canCreateProfile } = req.body
    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: 'Email is required' })
    }
    const normalised = email.trim().toLowerCase()

    const existing = await db.user.findUnique({ where: { email: normalised } })
    if (existing) {
      return res.status(409).json({ error: 'User already exists' })
    }

    const validRole = ['admin', 'editor', 'viewer', 'writer'].includes(role) ? role : 'viewer'
    const validPages = Array.isArray(pageAccess)
      ? pageAccess.filter(p => PAGE_SLUGS.includes(p))
      : null
    const validChannels = Array.isArray(channelAccess) ? channelAccess : null

    const user = await db.user.create({
      data: {
        email: normalised,
        role: validRole,
        note: note || null,
        isActive: true,
        canCreateProfile: !!canCreateProfile,
        pageAccess: validPages,
        channelAccess: validChannels,
      },
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        role: true,
        note: true,
        isActive: true,
        canCreateProfile: true,
        pageAccess: true,
        channelAccess: true,
        createdAt: true,
      },
    })
    res.json(user)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// PATCH /api/admin/users/:id — update user settings
router.patch('/users/:id', async (req, res) => {
  try {
    const target = await db.user.findUnique({ where: { id: req.params.id } })
    if (!target) return res.status(404).json({ error: 'User not found' })
    if (target.role === 'owner') {
      return res.status(403).json({ error: 'Cannot modify the owner account' })
    }

    const data = {}
    if (req.body.role !== undefined) {
      if (['admin', 'editor', 'viewer', 'writer'].includes(req.body.role)) {
        data.role = req.body.role
      }
    }
    if (req.body.note !== undefined) data.note = req.body.note || null
    if (req.body.isActive !== undefined) data.isActive = !!req.body.isActive
    if (req.body.canCreateProfile !== undefined) data.canCreateProfile = !!req.body.canCreateProfile
    if (req.body.pageAccess !== undefined) {
      data.pageAccess = Array.isArray(req.body.pageAccess)
        ? req.body.pageAccess.filter(p => PAGE_SLUGS.includes(p))
        : null
    }
    if (req.body.channelAccess !== undefined) {
      data.channelAccess = Array.isArray(req.body.channelAccess) ? req.body.channelAccess : null
    }

    const user = await db.user.update({
      where: { id: req.params.id },
      data,
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        role: true,
        note: true,
        isActive: true,
        canCreateProfile: true,
        pageAccess: true,
        channelAccess: true,
        createdAt: true,
      },
    })
    res.json(user)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// DELETE /api/admin/users/:id — remove user entirely
router.delete('/users/:id', async (req, res) => {
  try {
    const target = await db.user.findUnique({ where: { id: req.params.id } })
    if (!target) return res.status(404).json({ error: 'User not found' })
    if (target.role === 'owner') {
      return res.status(403).json({ error: 'Cannot delete the owner account' })
    }
    await db.session.deleteMany({ where: { userId: target.id } })
    await db.user.delete({ where: { id: target.id } })
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

module.exports = router
