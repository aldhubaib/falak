const express = require('express')
const db = require('../lib/db')
const { requireAuth, requireRole } = require('../middleware/auth')
const { learnFromStory, extractCorrectionsPreview, EMPTY_GUIDE } = require('../services/aiLearner')

const router = express.Router()
router.use(requireAuth)

// ── GET /api/ai-monitor/logs?channelId=xxx&page=1&limit=50
router.get('/logs', async (req, res) => {
  try {
    const { channelId, storyId, action, page = '1', limit = '50' } = req.query
    const where = {}
    if (channelId) where.channelId = channelId
    if (storyId)  where.storyId = storyId
    if (action)   where.action = { contains: action }

    const take = Math.min(parseInt(limit) || 50, 100)
    const skip = (Math.max(parseInt(page) || 1, 1) - 1) * take

    const [logs, total] = await Promise.all([
      db.aiGenerationLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take,
        skip,
        select: {
          id: true,
          channelId: true,
          storyId: true,
          action: true,
          model: true,
          inputTokens: true,
          outputTokens: true,
          durationMs: true,
          status: true,
          error: true,
          createdAt: true,
        },
      }),
      db.aiGenerationLog.count({ where }),
    ])

    res.json({ logs, total, page: parseInt(page) || 1, limit: take })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── GET /api/ai-monitor/logs/:id — full log detail with prompts and response
router.get('/logs/:id', async (req, res) => {
  try {
    const log = await db.aiGenerationLog.findUnique({ where: { id: req.params.id } })
    if (!log) return res.status(404).json({ error: 'Log not found' })
    res.json(log)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── GET /api/ai-monitor/style-guide/:channelId
router.get('/style-guide/:channelId', async (req, res) => {
  try {
    const channel = await db.channel.findUnique({
      where: { id: req.params.channelId },
      select: { id: true, nameAr: true, nameEn: true, startHook: true, endHook: true, styleGuide: true },
    })
    if (!channel) return res.status(404).json({ error: 'Channel not found' })
    const guide = (channel.styleGuide && typeof channel.styleGuide === 'object')
      ? { ...EMPTY_GUIDE, ...channel.styleGuide }
      : { ...EMPTY_GUIDE }
    res.json({ channel: { id: channel.id, nameAr: channel.nameAr, nameEn: channel.nameEn, startHook: channel.startHook, endHook: channel.endHook }, styleGuide: guide })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── PATCH /api/ai-monitor/style-guide/:channelId — manually edit style guide
router.patch('/style-guide/:channelId', requireRole('owner', 'admin'), async (req, res) => {
  try {
    const channel = await db.channel.findUnique({
      where: { id: req.params.channelId },
      select: { id: true, styleGuide: true },
    })
    if (!channel) return res.status(404).json({ error: 'Channel not found' })

    const current = (channel.styleGuide && typeof channel.styleGuide === 'object')
      ? { ...EMPTY_GUIDE, ...channel.styleGuide }
      : { ...EMPTY_GUIDE }

    const body = req.body
    if (body.corrections !== undefined) current.corrections = body.corrections
    if (body.signatures !== undefined) current.signatures = body.signatures
    if (body.notes !== undefined) current.notes = body.notes

    await db.channel.update({
      where: { id: req.params.channelId },
      data: { styleGuide: current },
    })
    res.json({ styleGuide: current })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── POST /api/ai-monitor/learn/:storyId — manually trigger learning for a story
router.post('/learn/:storyId', requireRole('owner', 'admin'), async (req, res) => {
  try {
    await learnFromStory(req.params.storyId)
    const story = await db.story.findUnique({ where: { id: req.params.storyId }, select: { channelId: true } })
    if (!story) return res.status(404).json({ error: 'Story not found' })
    const channel = await db.channel.findUnique({
      where: { id: story.channelId },
      select: { styleGuide: true },
    })
    res.json({ styleGuide: channel?.styleGuide || EMPTY_GUIDE })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── POST /api/ai-monitor/preview-corrections/:storyId — preview without saving
router.post('/preview-corrections/:storyId', requireRole('owner', 'admin'), async (req, res) => {
  try {
    const result = await extractCorrectionsPreview(req.params.storyId)
    res.json(result)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── GET /api/ai-monitor/diff-data/:storyId — get script vs transcript for diff view
router.get('/diff-data/:storyId', async (req, res) => {
  try {
    const story = await db.story.findUnique({ where: { id: req.params.storyId } })
    if (!story) return res.status(404).json({ error: 'Story not found' })
    const brief = (story.brief && typeof story.brief === 'object') ? story.brief : {}
    res.json({
      storyId: story.id,
      headline: story.headline,
      aiScript: brief.scriptRaw || brief.script || null,
      transcript: brief.transcript || null,
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── GET /api/ai-monitor/stories-with-both?channelId=xxx — stories that have both script + transcript
router.get('/stories-with-both', async (req, res) => {
  try {
    const { channelId } = req.query
    if (!channelId) return res.status(400).json({ error: 'channelId required' })
    const stories = await db.story.findMany({
      where: {
        channelId,
        stage: { in: ['filmed', 'done'] },
      },
      select: { id: true, headline: true, stage: true, createdAt: true, brief: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    const filtered = stories.filter(s => {
      const b = (s.brief && typeof s.brief === 'object') ? s.brief : {}
      return (b.scriptRaw || b.script) && b.transcript
    }).map(s => ({
      id: s.id,
      headline: s.headline,
      stage: s.stage,
      createdAt: s.createdAt,
    }))
    res.json(filtered)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

module.exports = router
