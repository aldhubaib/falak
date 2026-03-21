const express = require('express')
const db = require('../lib/db')
const { requireAuth, requireRole } = require('../middleware/auth')
const { VALID_SOURCE_TYPES, ingestAll, ingestSource, ingestYouTubeSource, hasApiKey, checkBudget, checkCooldown } = require('../services/articlePipeline')
const articleEvents = require('../lib/articleEvents')

const router = express.Router()
router.use(requireAuth)

const PIPELINE_STAGES = ['transcript', 'story_detect', 'imported', 'content', 'classify', 'title_translate', 'score', 'research', 'translated']

// ── GET /api/article-pipeline?channelId=X — Kanban view data ──────────────
router.get('/', async (req, res) => {
  try {
    const { channelId, view } = req.query
    if (!channelId) return res.status(400).json({ error: 'channelId required' })

    if (view === 'sources') {
      return await getSourcesView(req, res, channelId)
    }

    const { isPaused } = require('../worker-articles')

    const articleSelect = {
      id: true, url: true, title: true, description: true,
      stage: true, status: true, error: true, retries: true,
      publishedAt: true, language: true, startedAt: true, finishedAt: true,
      relevanceScore: true, finalScore: true, rankReason: true,
      storyId: true, parentArticleId: true,
      createdAt: true, updatedAt: true,
      processingLog: true, analysis: true,
      source: { select: { id: true, label: true, type: true, language: true } },
    }

    const STAGE_LIMIT = 200

    const [stageCounts, reviewCounts, allArticles] = await Promise.all([
      db.article.groupBy({
        by: ['stage'],
        where: { channelId, status: { not: 'review' } },
        _count: true,
      }),
      db.article.count({ where: { channelId, status: 'review' } }),
      db.article.findMany({
        where: { channelId },
        select: articleSelect,
        orderBy: { createdAt: 'desc' },
        take: STAGE_LIMIT * 9,
      }),
    ])

    const stageCountMap = {}
    for (const row of stageCounts) stageCountMap[row.stage] = row._count
    const totalCount = Object.values(stageCountMap).reduce((s, c) => s + c, 0) + reviewCounts

    const stats = {
      total: totalCount,
      transcript: stageCountMap.transcript || 0,
      story_detect: stageCountMap.story_detect || 0,
      imported: stageCountMap.imported || 0,
      content: stageCountMap.content || 0,
      classify: stageCountMap.classify || 0,
      title_translate: stageCountMap.title_translate || 0,
      score: stageCountMap.score || 0,
      research: stageCountMap.research || 0,
      translated: stageCountMap.translated || 0,
      images: stageCountMap.images || 0,
      review: reviewCounts,
      done: stageCountMap.done || 0,
      filtered: stageCountMap.filtered || 0,
      failed: stageCountMap.failed || 0,
      adapter_done: stageCountMap.adapter_done || 0,
    }

    const byStage = { transcript: [], story_detect: [], imported: [], content: [], classify: [], title_translate: [], score: [], research: [], translated: [], images: [], review: [], filtered: [], failed: [], done: [], adapter_done: [] }
    for (const a of allArticles) {
      if (a.status === 'review') {
        if (byStage.review.length < STAGE_LIMIT) byStage.review.push(a)
      } else if (byStage[a.stage] && byStage[a.stage].length < STAGE_LIMIT) {
        byStage[a.stage].push(a)
      }
    }

    res.json({ stats, byStage, paused: isPaused() })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── GET /api/article-pipeline/firecrawl-example?channelId=X — one article where Firecrawl succeeded
router.get('/firecrawl-example', async (req, res) => {
  try {
    const { channelId } = req.query
    if (!channelId) return res.status(400).json({ error: 'channelId required' })

    const articles = await db.article.findMany({
      where: { channelId, processingLog: { not: null } },
      select: { id: true, url: true, title: true, stage: true, processingLog: true },
      orderBy: { updatedAt: 'desc' },
      take: 1000,
    })

    const found = articles.find((a) => {
      const log = Array.isArray(a.processingLog) ? a.processingLog : []
      return log.some((e) => e.step === 'firecrawl' && e.status === 'ok')
    })

    if (!found) {
      return res.json({ found: false, message: 'No articles where Firecrawl succeeded for this channel.' })
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

async function getSourcesView(req, res, channelId) {
  const channel = await db.channel.findUnique({ where: { id: channelId } })
  if (!channel) return res.status(404).json({ error: 'Channel not found' })

  const sources = await db.articleSource.findMany({
    where: { channelId, type: { in: VALID_SOURCE_TYPES } },
    orderBy: { createdAt: 'asc' },
  })

  const sourceIds = sources.map(s => s.id)
  const allStageCounts = sourceIds.length > 0
    ? await db.article.groupBy({
        by: ['sourceId', 'stage'],
        where: { sourceId: { in: sourceIds } },
        _count: true,
      })
    : []
  const stageMap = new Map()
  for (const row of allStageCounts) {
    if (!stageMap.has(row.sourceId)) stageMap.set(row.sourceId, {})
    stageMap.get(row.sourceId)[row.stage] = row._count
  }

  const workflows = sources.map((source) => {
    const stats = stageMap.get(source.id) || {}
    const totalArticles = Object.values(stats).reduce((s, c) => s + c, 0)

    const keyConnected = hasApiKey(channel, source.type, source)
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
  })

  const globalStats = await db.article.groupBy({ by: ['stage'], where: { channelId }, _count: true })
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
      channelId: article.channelId,
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
      finalScore: article.finalScore,
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

// ── GET /api/article-pipeline/:id/events — SSE stream for live stage updates ──
router.get('/:id/events', async (req, res) => {
  const articleId = req.params.id
  const article = await db.article.findUnique({ where: { id: articleId }, select: { id: true } })
  if (!article) return res.status(404).json({ error: 'Article not found' })

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  })
  res.write(':\n\n')

  const heartbeat = setInterval(() => res.write(':\n\n'), 15_000)

  const onUpdate = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`)
  }
  articleEvents.on(`article:${articleId}`, onUpdate)

  const cleanup = () => {
    clearInterval(heartbeat)
    articleEvents.removeListener(`article:${articleId}`, onUpdate)
  }
  req.on('close', cleanup)
  res.on('close', cleanup)
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
        relevanceScore: true, finalScore: true, rankReason: true,
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
    const { channelId, sourceId, force } = req.body
    if (!channelId) return res.status(400).json({ error: 'channelId required' })

    if (sourceId) {
      const source = await db.articleSource.findUnique({
        where: { id: sourceId },
        include: { channel: true },
      })
      if (!source) return res.status(404).json({ error: 'Source not found' })
      if (source.channelId !== channelId) return res.status(403).json({ error: 'Source does not belong to channel' })
      if (!VALID_SOURCE_TYPES.includes(source.type)) {
        return res.status(400).json({ error: `Unsupported legacy source type: ${source.type}` })
      }

      const result = source.type === 'youtube_channel'
        ? await ingestYouTubeSource(source)
        : await ingestSource(source, source.channel, { force: !!force })
      return res.json({ results: [{ ...result, label: source.label, type: source.type }] })
    }

    const results = await ingestAll(channelId, { force: !!force })
    res.json({ results })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── POST /api/article-pipeline/pause ──────────────────────────────────────
router.post('/pause', requireRole('owner', 'admin', 'editor'), async (req, res) => {
  const { setPaused } = require('../worker-articles')
  await setPaused(true)
  res.json({ paused: true })
})

// ── POST /api/article-pipeline/resume ─────────────────────────────────────
router.post('/resume', requireRole('owner', 'admin', 'editor'), async (req, res) => {
  const { setPaused } = require('../worker-articles')
  await setPaused(false)
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

// ── POST /api/article-pipeline/:id/restart ────────────────────────────────
// Re-queue from current stage (or optional ?stage= to restart from a specific stage)
router.post('/:id/restart', requireRole('owner', 'admin', 'editor'), async (req, res) => {
  try {
    const article = await db.article.findUnique({ where: { id: req.params.id } })
    if (!article) return res.status(404).json({ error: 'Article not found' })
    if (article.status === 'running') {
      return res.status(400).json({ error: 'Article is currently running — wait or let rescue handle it' })
    }

    const VALID_STAGES = ['imported', 'content', 'classify', 'title_translate', 'score', 'research', 'translated']
    const targetStage = req.body.stage || article.stage
    if (!VALID_STAGES.includes(targetStage)) {
      return res.status(400).json({ error: `Invalid stage "${targetStage}"` })
    }

    await db.article.update({
      where: { id: article.id },
      data: { stage: targetStage, status: 'queued', error: null, retries: 0 },
    })
    res.json({ ok: true, stage: targetStage })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── POST /api/article-pipeline/restart-stage ──────────────────────────────
// Bulk re-queue all non-running articles in a given stage (clears errors & retries)
router.post('/restart-stage', requireRole('owner', 'admin', 'editor'), async (req, res) => {
  try {
    const { channelId, stage } = req.body
    if (!channelId) return res.status(400).json({ error: 'channelId required' })
    const VALID_STAGES = ['imported', 'content', 'classify', 'title_translate', 'score', 'research', 'translated']
    if (!VALID_STAGES.includes(stage)) {
      return res.status(400).json({ error: `Invalid stage "${stage}"` })
    }

    const result = await db.article.updateMany({
      where: { channelId, stage, status: { not: 'running' } },
      data: { status: 'queued', error: null, retries: 0 },
    })
    res.json({ restarted: result.count, stage })
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

    const stageOrder = ['imported', 'content', 'classify', 'title_translate', 'score', 'research', 'translated', 'done']
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

// ── POST /api/article-pipeline/reset — wipe all stories & articles to start fresh
router.post('/reset', requireRole('owner', 'admin'), async (req, res) => {
  try {
    const results = await db.$transaction([
      db.storyLog.deleteMany({}),
      db.alert.deleteMany({}),
      db.article.deleteMany({}),
      db.apifyRun.deleteMany({}),
      db.story.deleteMany({}),
      db.scoreProfile.deleteMany({}),
    ])

    const labels = ['StoryLog', 'Alert', 'Article', 'ApifyRun', 'Story', 'ScoreProfile']
    const deleted = {}
    results.forEach((r, i) => { deleted[labels[i]] = r.count })

    await db.articleSource.updateMany({
      data: { lastPolledAt: null, fetchLog: null, lastImportedRunId: null },
    })

    res.json({ ok: true, deleted })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── POST /api/article-pipeline/retry-all-failed ───────────────────────────
router.post('/retry-all-failed', requireRole('owner', 'admin', 'editor'), async (req, res) => {
  try {
    const { channelId } = req.body
    if (!channelId) return res.status(400).json({ error: 'channelId required' })

    const result = await db.article.updateMany({
      where: { channelId, stage: 'failed' },
      data: { stage: 'imported', status: 'queued', error: null, retries: 0 },
    })
    res.json({ retried: result.count })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── POST /api/article-pipeline/test-run — kick off processing for N articles (returns immediately)
const _testRuns = new Map()
const MAX_TEST_RUNS = 50

router.post('/test-run', requireRole('owner', 'admin'), async (req, res) => {
  try {
    const { channelId, limit = 5 } = req.body
    if (!channelId) return res.status(400).json({ error: 'channelId required' })

    const cap = Math.min(Math.max(1, Number(limit) || 5), 20)

    // Pick any articles in the 'imported' stage regardless of status/retries.
    // Prefer 'queued' first, then fall back to any status (running, failed, etc.)
    let articles = await db.article.findMany({
      where: { channelId, stage: 'imported', status: 'queued' },
      include: { source: { include: { channel: true } } },
      orderBy: { createdAt: 'asc' },
      take: cap,
    })
    if (articles.length < cap) {
      const existingIds = articles.map(a => a.id)
      const more = await db.article.findMany({
        where: {
          channelId,
          stage: 'imported',
          ...(existingIds.length > 0 ? { id: { notIn: existingIds } } : {}),
        },
        include: { source: { include: { channel: true } } },
        orderBy: { createdAt: 'asc' },
        take: cap - articles.length,
      })
      articles = articles.concat(more)
    }

    if (articles.length === 0) {
      return res.json({ runId: null, total: 0, articles: [] })
    }

    // Force-reset picked articles so processItem can run them cleanly
    await db.article.updateMany({
      where: { id: { in: articles.map(a => a.id) } },
      data: { status: 'queued', retries: 0, error: null, startedAt: null },
    })
    // Re-fetch after reset so processItem sees clean state
    articles = await db.article.findMany({
      where: { id: { in: articles.map(a => a.id) } },
      include: { source: { include: { channel: true } } },
      orderBy: { createdAt: 'asc' },
    })

    const runId = `test-${Date.now()}`
    const DONE_STAGES = new Set(['done', 'failed', 'filtered', 'adapter_done'])
    const items = articles.map(a => ({
      id: a.id, title: a.title, stageBefore: 'imported',
      stageAfter: null, currentStage: 'imported', status: 'pending', error: null,
    }))

    if (_testRuns.size >= MAX_TEST_RUNS) {
      const oldest = _testRuns.keys().next().value
      _testRuns.delete(oldest)
    }
    _testRuns.set(runId, { channelId, items, startedAt: Date.now() })

    // Process each article through ALL stages until done/failed
    const { processItem } = require('../worker-articles')
    ;(async () => {
      for (const item of items) {
        item.status = 'running'
        try {
          let loops = 0
          while (loops < 10) {
            loops++
            const fresh = await db.article.findUnique({
              where: { id: item.id },
              include: { source: { include: { channel: true } } },
            })
            if (!fresh || DONE_STAGES.has(fresh.stage) || fresh.status === 'review') break
            item.currentStage = fresh.stage
            await processItem(fresh, { force: true })
            const after = await db.article.findUnique({
              where: { id: item.id },
              select: { stage: true, status: true, error: true },
            })
            if (!after || DONE_STAGES.has(after.stage) || after.status === 'review' || after.error) {
              item.stageAfter = after?.stage || item.currentStage
              item.error = after?.error || null
              break
            }
          }
          const final = await db.article.findUnique({
            where: { id: item.id },
            select: { stage: true, status: true, error: true },
          })
          item.stageAfter = final?.stage || item.currentStage
          item.status = final?.error ? 'error' : 'done'
          item.error = final?.error || null
          item.currentStage = final?.stage || item.currentStage
        } catch (e) {
          item.stageAfter = item.currentStage
          item.status = 'error'
          item.error = e.message
        }
      }
      setTimeout(() => _testRuns.delete(runId), 10 * 60 * 1000)
    })()

    res.json({
      runId,
      total: items.length,
      articles: items.map(i => ({ id: i.id, title: i.title, stageBefore: i.stageBefore, status: i.status })),
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── POST /api/article-pipeline/test-video — kick off processing for 1 YouTube video
router.post('/test-video', requireRole('owner', 'admin'), async (req, res) => {
  try {
    const { channelId } = req.body
    if (!channelId) return res.status(400).json({ error: 'channelId required' })

    let articles = await db.article.findMany({
      where: { channelId, stage: 'transcript', status: 'queued' },
      include: { source: { include: { channel: true } } },
      orderBy: { createdAt: 'asc' },
      take: 1,
    })
    if (articles.length === 0) {
      articles = await db.article.findMany({
        where: { channelId, stage: 'transcript' },
        include: { source: { include: { channel: true } } },
        orderBy: { createdAt: 'asc' },
        take: 1,
      })
    }

    if (articles.length === 0) {
      return res.json({ runId: null, total: 0, articles: [] })
    }

    await db.article.updateMany({
      where: { id: { in: articles.map(a => a.id) } },
      data: { status: 'queued', retries: 0, error: null, startedAt: null },
    })
    articles = await db.article.findMany({
      where: { id: { in: articles.map(a => a.id) } },
      include: { source: { include: { channel: true } } },
      orderBy: { createdAt: 'asc' },
    })

    const runId = `test-vid-${Date.now()}`
    const DONE_STAGES = new Set(['done', 'failed', 'filtered', 'adapter_done'])
    const items = articles.map(a => ({
      id: a.id, title: a.title, stageBefore: 'transcript',
      stageAfter: null, currentStage: 'transcript', status: 'pending', error: null,
    }))

    if (_testRuns.size >= MAX_TEST_RUNS) {
      const oldest = _testRuns.keys().next().value
      _testRuns.delete(oldest)
    }
    _testRuns.set(runId, { channelId, items, startedAt: Date.now() })

    const { processItem } = require('../worker-articles')
    ;(async () => {
      for (const item of items) {
        item.status = 'running'
        try {
          let loops = 0
          while (loops < 15) {
            loops++
            const fresh = await db.article.findUnique({
              where: { id: item.id },
              include: { source: { include: { channel: true } } },
            })
            if (!fresh || DONE_STAGES.has(fresh.stage) || fresh.status === 'review') break
            item.currentStage = fresh.stage
            await processItem(fresh, { force: true })
            const after = await db.article.findUnique({
              where: { id: item.id },
              select: { stage: true, status: true, error: true },
            })
            if (!after || DONE_STAGES.has(after.stage) || after.status === 'review' || after.error) {
              item.stageAfter = after?.stage || item.currentStage
              item.error = after?.error || null
              break
            }
          }
          const final = await db.article.findUnique({
            where: { id: item.id },
            select: { stage: true, status: true, error: true },
          })
          item.stageAfter = final?.stage || item.currentStage
          item.status = final?.error ? 'error' : 'done'
          item.error = final?.error || null
          item.currentStage = final?.stage || item.currentStage
        } catch (e) {
          item.stageAfter = item.currentStage
          item.status = 'error'
          item.error = e.message
        }
      }
      setTimeout(() => _testRuns.delete(runId), 10 * 60 * 1000)
    })()

    res.json({
      runId,
      total: items.length,
      articles: items.map(i => ({ id: i.id, title: i.title, stageBefore: i.stageBefore, status: i.status })),
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── GET /api/article-pipeline/test-run/:runId — poll for test run progress
router.get('/test-run/:runId', async (req, res) => {
  const run = _testRuns.get(req.params.runId)
  if (!run) return res.status(404).json({ error: 'Test run not found or expired' })

  const done = run.items.filter(i => i.status === 'done' || i.status === 'error').length
  const running = run.items.find(i => i.status === 'running')

  res.json({
    runId: req.params.runId,
    total: run.items.length,
    completed: done,
    currentlyProcessing: running ? running.title || running.id : null,
    finished: done === run.items.length,
    items: run.items,
  })
})

module.exports = router
