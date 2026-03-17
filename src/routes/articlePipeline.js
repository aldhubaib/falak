const express = require('express')
const db = require('../lib/db')
const { requireAuth, requireRole } = require('../middleware/auth')
const { ingestAll, ingestSource, hasApiKey, checkBudget, checkCooldown } = require('../services/articlePipeline')
const { decrypt } = require('../services/crypto')

const router = express.Router()
router.use(requireAuth)

// ── GET /api/article-pipeline?projectId=X ─────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { projectId } = req.query
    if (!projectId) return res.status(400).json({ error: 'projectId required' })

    const project = await db.project.findUnique({ where: { id: projectId } })
    if (!project) return res.status(404).json({ error: 'Project not found' })

    const sources = await db.articleSource.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' },
    })

    const workflows = await Promise.all(sources.map(async (source) => {
      const stageCounts = await db.article.groupBy({
        by: ['stage'],
        where: { sourceId: source.id },
        _count: true,
      })
      const stats = {}
      for (const row of stageCounts) stats[row.stage] = row._count
      const totalArticles = Object.values(stats).reduce((s, c) => s + c, 0)

      const keyConnected = hasApiKey(project, source.type)
      const budget = checkBudget(source)
      const cooldown = checkCooldown(source)

      const log = Array.isArray(source.fetchLog) ? source.fetchLog : []
      const successCount = log.filter(e => !e.error).length
      const successRate = log.length > 0 ? Math.round((successCount / log.length) * 100) : null

      return {
        id: source.id,
        type: source.type,
        label: source.label,
        language: source.language,
        isActive: source.isActive,
        lastPolledAt: source.lastPolledAt,
        config: source.config,
        fetchLog: log.slice(0, 10),
        stats,
        totalArticles,
        health: {
          keyConnected,
          budgetUsed: budget.usedToday,
          budgetMax: budget.maxPerDay,
          cooldownOk: cooldown.allowed,
          minutesSinceLast: cooldown.minutesSince,
          successRate,
          totalFetches: log.length,
        },
      }
    }))

    const globalStats = await db.article.groupBy({
      by: ['stage'],
      where: { projectId },
      _count: true,
    })
    const totals = {}
    for (const row of globalStats) totals[row.stage] = row._count

    res.json({ workflows, totals })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── GET /api/article-pipeline/:sourceId/articles ──────────────────────────
router.get('/:sourceId/articles', async (req, res) => {
  try {
    const { stage } = req.query
    const where = { sourceId: req.params.sourceId }
    if (stage) where.stage = stage

    const articles = await db.article.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true, url: true, title: true, description: true,
        stage: true, status: true, error: true, retries: true,
        publishedAt: true, language: true,
        relevanceScore: true, rankScore: true, rankReason: true,
        createdAt: true, updatedAt: true,
      },
    })
    res.json(articles)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── POST /api/article-pipeline/ingest ─────────────────────────────────────
router.post('/ingest', requireRole('owner', 'admin', 'editor'), async (req, res) => {
  try {
    const { projectId, sourceId, force } = req.body
    if (!projectId) return res.status(400).json({ error: 'projectId required' })

    if (sourceId) {
      const source = await db.articleSource.findUnique({
        where: { id: sourceId },
        include: { project: true },
      })
      if (!source) return res.status(404).json({ error: 'Source not found' })
      if (source.projectId !== projectId) return res.status(403).json({ error: 'Source does not belong to project' })

      const result = await ingestSource(source, source.project, { force: !!force })
      return res.json({ results: [{ ...result, label: source.label, type: source.type }] })
    }

    const results = await ingestAll(projectId)
    res.json({ results })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── POST /api/article-pipeline/:id/retry ──────────────────────────────────
router.post('/:id/retry', requireRole('owner', 'admin', 'editor'), async (req, res) => {
  try {
    const article = await db.article.findUnique({ where: { id: req.params.id } })
    if (!article) return res.status(404).json({ error: 'Article not found' })
    if (article.stage !== 'failed') return res.status(400).json({ error: 'Article is not failed' })

    await db.article.update({
      where: { id: article.id },
      data: { stage: 'clean', status: 'queued', error: null },
    })
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── POST /api/article-pipeline/retry-all-failed ───────────────────────────
router.post('/retry-all-failed', requireRole('owner', 'admin', 'editor'), async (req, res) => {
  try {
    const { projectId } = req.body
    if (!projectId) return res.status(400).json({ error: 'projectId required' })

    const result = await db.article.updateMany({
      where: { projectId, stage: 'failed' },
      data: { stage: 'clean', status: 'queued', error: null },
    })
    res.json({ retried: result.count })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

module.exports = router
