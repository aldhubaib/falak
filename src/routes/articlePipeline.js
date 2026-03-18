const express = require('express')
const db = require('../lib/db')
const { requireAuth, requireRole } = require('../middleware/auth')
const { VALID_SOURCE_TYPES, ingestAll, ingestSource, hasApiKey, checkBudget, checkCooldown } = require('../services/articlePipeline')

const router = express.Router()
router.use(requireAuth)

const PIPELINE_STAGES = ['imported', 'content', 'classify', 'research', 'translated', 'score']

// ── GET /api/article-pipeline?projectId=X — Kanban view data ──────────────
router.get('/', async (req, res) => {
  try {
    const { projectId, view } = req.query
    if (!projectId) return res.status(400).json({ error: 'projectId required' })

    if (view === 'sources') {
      return getSourcesView(req, res, projectId)
    }

    const { isPaused } = require('../worker-articles')

    const articleSelect = {
      id: true, url: true, title: true, description: true,
      stage: true, status: true, error: true, retries: true,
      publishedAt: true, language: true, startedAt: true, finishedAt: true,
      relevanceScore: true, rankScore: true, rankReason: true,
      storyId: true, createdAt: true, updatedAt: true,
      processingLog: true, analysis: true,
      source: { select: { id: true, label: true, type: true, language: true } },
    }

    const STAGE_LIMIT = 200

    const [
      totalCount, reviewCount, failedCount, doneCount,
      importedCount, contentCount, classifyCount, researchCount, translatedCount, scoreCount,
      imported, content, classify, research, translated, score,
      reviewArticles, failedArticles, doneArticles,
    ] = await Promise.all([
      db.article.count({ where: { projectId } }),
      db.article.count({ where: { projectId, status: 'review' } }),
      db.article.count({ where: { projectId, stage: 'failed' } }),
      db.article.count({ where: { projectId, stage: 'done' } }),
      db.article.count({ where: { projectId, stage: 'imported', status: { not: 'review' } } }),
      db.article.count({ where: { projectId, stage: 'content', status: { not: 'review' } } }),
      db.article.count({ where: { projectId, stage: 'classify', status: { not: 'review' } } }),
      db.article.count({ where: { projectId, stage: 'research', status: { not: 'review' } } }),
      db.article.count({ where: { projectId, stage: 'translated', status: { not: 'review' } } }),
      db.article.count({ where: { projectId, stage: 'score', status: { not: 'review' } } }),
      db.article.findMany({
        where: { projectId, stage: 'imported', status: { not: 'review' } },
        select: articleSelect, orderBy: { createdAt: 'desc' }, take: STAGE_LIMIT,
      }),
      db.article.findMany({
        where: { projectId, stage: 'content', status: { not: 'review' } },
        select: articleSelect, orderBy: { createdAt: 'desc' }, take: STAGE_LIMIT,
      }),
      db.article.findMany({
        where: { projectId, stage: 'classify', status: { not: 'review' } },
        select: articleSelect, orderBy: { createdAt: 'desc' }, take: STAGE_LIMIT,
      }),
      db.article.findMany({
        where: { projectId, stage: 'research', status: { not: 'review' } },
        select: articleSelect, orderBy: { createdAt: 'desc' }, take: STAGE_LIMIT,
      }),
      db.article.findMany({
        where: { projectId, stage: 'translated', status: { not: 'review' } },
        select: articleSelect, orderBy: { createdAt: 'desc' }, take: STAGE_LIMIT,
      }),
      db.article.findMany({
        where: { projectId, stage: 'score', status: { not: 'review' } },
        select: articleSelect, orderBy: { createdAt: 'desc' }, take: STAGE_LIMIT,
      }),
      db.article.findMany({
        where: { projectId, status: 'review' },
        select: articleSelect, orderBy: { createdAt: 'desc' }, take: STAGE_LIMIT,
      }),
      db.article.findMany({
        where: { projectId, stage: 'failed' },
        select: articleSelect, orderBy: { createdAt: 'desc' }, take: STAGE_LIMIT,
      }),
      db.article.findMany({
        where: { projectId, stage: 'done' },
        select: articleSelect, orderBy: { updatedAt: 'desc' }, take: STAGE_LIMIT,
      }),
    ])

    const stats = {
      total: totalCount,
      imported: importedCount,
      content: contentCount,
      classify: classifyCount,
      research: researchCount,
      translated: translatedCount,
      score: scoreCount,
      review: reviewCount,
      done: doneCount,
      failed: failedCount,
    }

    const byStage = {
      imported, content, classify, research, translated, score,
      review: reviewArticles, failed: failedArticles, done: doneArticles,
    }

    res.json({ stats, byStage, paused: isPaused() })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── GET /api/article-pipeline/firecrawl-example?projectId=X — one article where Firecrawl succeeded
router.get('/firecrawl-example', async (req, res) => {
  try {
    const { projectId } = req.query
    if (!projectId) return res.status(400).json({ error: 'projectId required' })

    const articles = await db.article.findMany({
      where: { projectId, processingLog: { not: null } },
      select: { id: true, url: true, title: true, stage: true, processingLog: true },
      orderBy: { updatedAt: 'desc' },
      take: 1000,
    })

    const found = articles.find((a) => {
      const log = Array.isArray(a.processingLog) ? a.processingLog : []
      return log.some((e) => e.step === 'firecrawl' && e.status === 'ok')
    })

    if (!found) {
      return res.json({ found: false, message: 'No articles where Firecrawl succeeded in this project.' })
    }

    const firecrawlLog = found.processingLog.find((e) => e.step === 'firecrawl')
    res.json({
      found: true,
      article: {
        id: found.id,
        url: found.url,
        title: found.title,
        stage: found.stage,
        firecrawlChars: firecrawlLog?.chars ?? null,
      },
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

async function getSourcesView(req, res, projectId) {
  const project = await db.project.findUnique({ where: { id: projectId } })
  if (!project) return res.status(404).json({ error: 'Project not found' })

  const sources = await db.articleSource.findMany({
    where: { projectId, type: { in: VALID_SOURCE_TYPES } },
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

    const keyConnected = hasApiKey(project, source.type, source)
    const budget = checkBudget(source)
    const cooldown = checkCooldown(source)

    const log = Array.isArray(source.fetchLog) ? source.fetchLog : []
    const successCount = log.filter(e => !e.error).length
    const successRate = log.length > 0 ? Math.round((successCount / log.length) * 100) : null

    return {
      id: source.id, type: source.type, label: source.label, language: source.language,
      isActive: source.isActive, lastPolledAt: source.lastPolledAt, config: source.config,
      fetchLog: log.slice(0, 10), stats, totalArticles,
      health: {
        keyConnected, budgetUsed: budget.usedToday, budgetMax: budget.maxPerDay,
        cooldownOk: cooldown.allowed, minutesSinceLast: cooldown.minutesSince,
        successRate, totalFetches: log.length,
      },
    }
  }))

  const globalStats = await db.article.groupBy({ by: ['stage'], where: { projectId }, _count: true })
  const totals = {}
  for (const row of globalStats) totals[row.stage] = row._count

  res.json({ workflows, totals })
}

// ── GET /api/article-pipeline/:id/detail — full article with all content fields ──
router.get('/:id/detail', async (req, res) => {
  try {
    const article = await db.article.findUnique({
      where: { id: req.params.id },
      include: {
        source: { select: { id: true, label: true, type: true, language: true } },
      },
    })
    if (!article) return res.status(404).json({ error: 'Article not found' })

    const contentPreviewLen = 5000
    const truncate = (s) => s && s.length > contentPreviewLen ? s.slice(0, contentPreviewLen) + '…' : s

    res.json({
      id: article.id,
      projectId: article.projectId,
      url: article.url,
      title: article.title,
      description: article.description,
      content: truncate(article.content),
      contentClean: truncate(article.contentClean),
      contentAr: truncate(article.contentAr),
      contentRawLength: article.content?.length ?? 0,
      contentCleanLength: article.contentClean?.length ?? 0,
      contentArLength: article.contentAr?.length ?? 0,
      publishedAt: article.publishedAt,
      language: article.language,
      stage: article.stage,
      status: article.status,
      retries: article.retries,
      error: article.error,
      startedAt: article.startedAt,
      finishedAt: article.finishedAt,
      processingLog: article.processingLog,
      analysis: article.analysis,
      relevanceScore: article.relevanceScore,
      rankScore: article.rankScore,
      rankReason: article.rankReason,
      storyId: article.storyId,
      source: article.source,
      createdAt: article.createdAt,
      updatedAt: article.updatedAt,
    })
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
        publishedAt: true, language: true, startedAt: true,
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
      if (!VALID_SOURCE_TYPES.includes(source.type)) {
        return res.status(400).json({ error: `Unsupported legacy source type: ${source.type}` })
      }

      const result = await ingestSource(source, source.project, { force: !!force })
      return res.json({ results: [{ ...result, label: source.label, type: source.type }] })
    }

    const results = await ingestAll(projectId)
    res.json({ results })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── POST /api/article-pipeline/pause ──────────────────────────────────────
router.post('/pause', requireRole('owner', 'admin'), async (req, res) => {
  const { setPaused } = require('../worker-articles')
  setPaused(true)
  res.json({ paused: true })
})

// ── POST /api/article-pipeline/resume ─────────────────────────────────────
router.post('/resume', requireRole('owner', 'admin'), async (req, res) => {
  const { setPaused } = require('../worker-articles')
  setPaused(false)
  res.json({ paused: false })
})

// ── POST /api/article-pipeline/:id/retry ──────────────────────────────────
router.post('/:id/retry', requireRole('owner', 'admin', 'editor'), async (req, res) => {
  try {
    const article = await db.article.findUnique({ where: { id: req.params.id } })
    if (!article) return res.status(404).json({ error: 'Article not found' })
    if (article.stage !== 'failed' && article.status !== 'review') {
      return res.status(400).json({ error: 'Article is not failed or in review' })
    }

    const retryStage = article.status === 'review' ? article.stage : 'imported'
    await db.article.update({
      where: { id: article.id },
      data: { stage: retryStage, status: 'queued', error: null, retries: 0 },
    })
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── POST /api/article-pipeline/:id/skip — advance review item to next stage
router.post('/:id/skip', requireRole('owner', 'admin', 'editor'), async (req, res) => {
  try {
    const article = await db.article.findUnique({ where: { id: req.params.id } })
    if (!article) return res.status(404).json({ error: 'Article not found' })
    if (article.status !== 'review') return res.status(400).json({ error: 'Article is not in review' })

    const stageOrder = ['imported', 'content', 'classify', 'research', 'translated', 'score', 'done']
    const idx = stageOrder.indexOf(article.stage)
    const nextStage = idx >= 0 && idx < stageOrder.length - 1 ? stageOrder[idx + 1] : 'done'

    await db.article.update({
      where: { id: article.id },
      data: { stage: nextStage, status: nextStage === 'done' ? 'done' : 'queued', error: null },
    })
    res.json({ ok: true, nextStage })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── POST /api/article-pipeline/:id/drop — mark review item as failed
router.post('/:id/drop', requireRole('owner', 'admin', 'editor'), async (req, res) => {
  try {
    const article = await db.article.findUnique({ where: { id: req.params.id } })
    if (!article) return res.status(404).json({ error: 'Article not found' })

    await db.article.update({
      where: { id: article.id },
      data: { stage: 'failed', status: 'failed', error: 'Dropped by user' },
    })
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── PATCH /api/article-pipeline/:id/content — user pastes content manually
router.patch('/:id/content', requireRole('owner', 'admin', 'editor'), async (req, res) => {
  try {
    const { content } = req.body
    if (!content || typeof content !== 'string' || content.trim().length < 50) {
      return res.status(400).json({ error: 'Content must be at least 50 characters' })
    }
    const article = await db.article.findUnique({ where: { id: req.params.id } })
    if (!article) return res.status(404).json({ error: 'Article not found' })

    await db.article.update({
      where: { id: article.id },
      data: {
        contentClean: content.trim(),
        stage: 'classify',
        status: 'queued',
        error: null,
      },
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
      data: { stage: 'imported', status: 'queued', error: null, retries: 0 },
    })
    res.json({ retried: result.count })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

module.exports = router
