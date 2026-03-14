const express = require('express')
const db = require('../lib/db')
const { requireAuth, requireRole } = require('../middleware/auth')
const { decrypt } = require('../services/crypto')
const { fetchStorySuggestions } = require('../services/perplexity')
const { trackUsage } = require('../services/usageTracker')
const brainV2 = require('./brainV2')

const router = express.Router()
router.use(requireAuth)

// ── POST /api/stories/fetch — call Perplexity Sonar with Brain v2 auto-search query, create suggestion stories
router.post('/fetch', requireRole('owner', 'admin', 'editor'), async (req, res) => {
  try {
    const { projectId } = req.body
    if (!projectId) return res.status(400).json({ error: 'projectId required' })

    const project = await db.project.findUnique({
      where: { id: projectId },
      select: { id: true, perplexityApiKeyEncrypted: true },
    })
    if (!project) return res.status(404).json({ error: 'Project not found' })
    if (!project.perplexityApiKeyEncrypted) {
      return res.status(400).json({ error: 'Perplexity API key not set. Add it in Settings → API Keys.' })
    }

    const apiKey = decrypt(project.perplexityApiKeyEncrypted)
    const brainData = await brainV2.getBrainV2Data(projectId)
    const autoSearchQuery = brainData?.autoSearchQuery
    if (!autoSearchQuery || !autoSearchQuery.trim()) {
      return res.status(400).json({
        error: 'No search query yet. Add competitor and your channels, run the pipeline, then try Fetch again.',
      })
    }

    const suggestions = await fetchStorySuggestions(apiKey, autoSearchQuery)
    const created = []
    for (const s of suggestions) {
      const story = await db.story.create({
        data: {
          projectId,
          headline: s.headline,
          stage: 'suggestion',
          sourceName: 'Perplexity Sonar',
          sourceUrl: s.sourceUrl || null,
          brief: s.summary ? { summary: s.summary } : null,
        },
      })
      created.push(story)
    }

    const tokensUsed = 2000
    trackUsage({ projectId, service: 'perplexity', action: 'Fetch Stories', tokensUsed, status: 'ok' })

    res.json({ ok: true, created: created.length, stories: created })
  } catch (e) {
    console.error('[stories/fetch]', e)
    const message = e instanceof Error ? e.message : String(e)
    if (req.body?.projectId) {
      trackUsage({ projectId: req.body.projectId, service: 'perplexity', action: 'Fetch Stories', status: 'fail', error: message })
    }
    res.status(500).json({ error: message })
  }
})

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
