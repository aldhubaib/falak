const express = require('express')
const db = require('../lib/db')
const { requireAuth, requireRole } = require('../middleware/auth')

const router = express.Router()
router.use(requireAuth)

// ── GET /api/writer/stories?channelId=xxx — writer's own stories
router.get('/stories', requireRole('writer'), async (req, res) => {
  try {
    const { channelId } = req.query
    if (!channelId) return res.status(400).json({ error: 'channelId required' })

    const stories = await db.story.findMany({
      where: { writerId: req.user.id, channelId },
      select: {
        id: true, headline: true, stage: true, origin: true,
        scriptLong: true, scriptShort: true, writerNotes: true,
        createdAt: true, updatedAt: true, channelId: true,
        producedVideoId: true,
        producedVideo: { select: { id: true, titleAr: true, thumbnailUrl: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 500,
    })
    res.json(stories)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── GET /api/writer/stories/summary?channelId=xxx — counts by stage
router.get('/stories/summary', requireRole('writer'), async (req, res) => {
  try {
    const { channelId } = req.query
    if (!channelId) return res.status(400).json({ error: 'channelId required' })

    const stageCounts = await db.story.groupBy({
      by: ['stage'],
      where: { writerId: req.user.id, channelId },
      _count: true,
    })

    const stages = ['writer_draft', 'writer_submitted', 'writer_approved', 'scripting', 'filmed', 'writer_review', 'writer_revision', 'done', 'trash']
    const counts = {}
    for (const s of stages) counts[s] = 0
    for (const row of stageCounts) counts[row.stage] = row._count
    const total = Object.values(counts).reduce((a, b) => a + b, 0)

    res.json({ total, ...counts })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── GET /api/writer/stories/:id — single story detail (writer's own)
router.get('/stories/:id', requireRole('writer'), async (req, res) => {
  try {
    const story = await db.story.findUnique({
      where: { id: req.params.id },
      include: {
        producedVideo: { select: { id: true, titleAr: true, titleEn: true, thumbnailUrl: true, youtubeId: true } },
        log: { include: { user: { select: { name: true, avatarUrl: true } } }, orderBy: { createdAt: 'desc' }, take: 50 },
        writer: { select: { id: true, name: true, avatarUrl: true } },
      },
    })
    if (!story) return res.status(404).json({ error: 'Story not found' })
    if (story.writerId !== req.user.id) return res.status(403).json({ error: 'Access denied' })
    res.json(story)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

module.exports = router
