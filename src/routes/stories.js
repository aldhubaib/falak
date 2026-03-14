const express = require('express')
const db = require('../lib/db')
const { requireAuth, requireRole } = require('../middleware/auth')

const router = express.Router()
router.use(requireAuth)

// ── GET /api/stories?projectId=xxx&stage=xxx
router.get('/', async (req, res) => {
  try {
    const { projectId, stage } = req.query
    const where = {}
    if (projectId) where.projectId = projectId
    if (stage)     where.stage = stage

    const stories = await db.story.findMany({
      where,
      include: { log: { orderBy: { createdAt: 'desc' }, take: 20 } },
      orderBy: { createdAt: 'desc' }
    })
    res.json(stories)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── GET /api/stories/summary?projectId=xxx
router.get('/summary', async (req, res) => {
  try {
    const { projectId } = req.query
    const where = projectId ? { projectId } : {}

    const all = await db.story.findMany({ where, select: { stage: true, coverageStatus: true } })
    const stages = ['suggestion', 'liked', 'approved', 'produced', 'publish', 'done']
    const counts = {}
    for (const s of stages) counts[s] = all.filter(x => x.stage === s).length

    const firstMovers  = all.filter(x => x.coverageStatus === 'first').length
    const firstMoverPct = all.length ? Math.round(firstMovers / all.length * 100) : 0

    res.json({ total: all.length, ...counts, firstMovers, firstMoverPct })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── GET /api/stories/:id
router.get('/:id', async (req, res) => {
  try {
    const story = await db.story.findUniqueOrThrow({
      where: { id: req.params.id },
      include: { log: { include: { user: { select: { name: true, avatarUrl: true } } }, orderBy: { createdAt: 'desc' } } }
    })
    res.json(story)
  } catch (e) {
    res.status(404).json({ error: 'Story not found' })
  }
})

// ── POST /api/stories
router.post('/', requireRole('owner', 'admin', 'editor'), async (req, res) => {
  try {
    const { projectId, headline, stage, sourceUrl, sourceName, brief } = req.body
    if (!projectId || !headline) return res.status(400).json({ error: 'projectId and headline required' })

    const story = await db.story.create({
      data: { projectId, headline, stage: stage || 'suggestion', sourceUrl, sourceName, brief }
    })
    await addLog(story.id, req.user.id, 'created', `Stage: ${story.stage}`)
    res.json(story)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── PATCH /api/stories/:id
router.patch('/:id', requireRole('owner', 'admin', 'editor'), async (req, res) => {
  try {
    const allowed = ['headline', 'stage', 'sourceUrl', 'sourceName', 'sourceDate',
                     'coverageStatus', 'scriptLong', 'scriptShort', 'brief',
                     'relevanceScore', 'viralScore', 'firstMoverScore', 'compositeScore']
    const data = {}
    for (const k of allowed) if (req.body[k] !== undefined) data[k] = req.body[k]

    const story = await db.story.update({ where: { id: req.params.id }, data })

    if (req.body.stage) {
      await addLog(story.id, req.user.id, 'stage_change', `→ ${req.body.stage}`)
    }
    res.json(story)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── DELETE /api/stories/:id
router.delete('/:id', requireRole('owner', 'admin'), async (req, res) => {
  try {
    await db.story.delete({ where: { id: req.params.id } })
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── POST /api/stories/:id/log
router.post('/:id/log', requireRole('owner', 'admin', 'editor'), async (req, res) => {
  try {
    const { action, note } = req.body
    const log = await addLog(req.params.id, req.user.id, action, note)
    res.json(log)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

async function addLog(storyId, userId, action, note) {
  return db.storyLog.create({ data: { storyId, userId, action, note } })
}

module.exports = router
