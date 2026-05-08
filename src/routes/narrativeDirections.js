const express = require('express')
const { z } = require('zod')
const db = require('../lib/db')
const { requireAuth, requireRole } = require('../middleware/auth')
const { asyncWrap } = require('../middleware/errors')
const { parseBody } = require('../lib/validate')

const router = express.Router()
router.use(requireAuth)

const createSchema = z.object({
  slug: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/, 'slug must be lowercase alphanumeric with dashes'),
  nameEn: z.string().min(1).max(100),
  nameAr: z.string().min(1).max(100),
  description: z.string().min(1).max(2000),
  detectHint: z.string().min(1).max(2000),
  sortOrder: z.number().int().optional(),
})

const updateSchema = z.object({
  nameEn: z.string().min(1).max(100).optional(),
  nameAr: z.string().min(1).max(100).optional(),
  description: z.string().min(1).max(2000).optional(),
  detectHint: z.string().min(1).max(2000).optional(),
  sortOrder: z.number().int().optional(),
})

// GET /api/narrative-directions — list all
router.get('/', asyncWrap(async (req, res) => {
  const directions = await db.narrativeDirection.findMany({
    orderBy: { sortOrder: 'asc' },
  })
  res.json(directions)
}))

// POST /api/narrative-directions — create
router.post('/', requireRole('owner', 'admin', 'editor'), asyncWrap(async (req, res) => {
  const data = parseBody(req.body, createSchema)
  const existing = await db.narrativeDirection.findUnique({ where: { slug: data.slug } })
  if (existing) return res.status(409).json({ error: 'A direction with this slug already exists' })
  const direction = await db.narrativeDirection.create({ data })
  res.json(direction)
}))

// PATCH /api/narrative-directions/:id — update
router.patch('/:id', requireRole('owner', 'admin', 'editor'), asyncWrap(async (req, res) => {
  const data = parseBody(req.body, updateSchema)
  const direction = await db.narrativeDirection.update({
    where: { id: req.params.id },
    data,
  })
  res.json(direction)
}))

// DELETE /api/narrative-directions/:id — delete
router.delete('/:id', requireRole('owner', 'admin'), asyncWrap(async (req, res) => {
  await db.narrativeDirection.delete({ where: { id: req.params.id } })
  res.json({ ok: true })
}))

module.exports = router
