/**
 * Article pipeline worker — concurrent per-stage loops.
 *
 * Each pipeline stage runs its own independent polling loop, so classify
 * doesn't block score, content doesn't block translate, etc.
 * AI stages share a concurrency semaphore to stay within rate limits.
 *
 * Batch lifecycle:
 *   pick items → create PipelineBatch → process all → persist PipelineBatchItem per article → done
 *   Succeeded items move to next stage. Failed items stay queued for a future batch.
 */
try { require('dotenv').config() } catch (_) {}
const db = require('./lib/db')
const logger = require('./lib/logger')
const articleEvents = require('./lib/articleEvents')
const { emitBatch } = require('./lib/pipelineEvents')
const registry = require('./lib/serviceRegistry')
const { preflight, blockDependents, unblockReady } = require('./lib/pipelinePreflight')
const {
  doStageImported,
  doStageContent,
  doStageClassify,
  doStageTitleTranslate,
  doStageScore,
  doStageResearch,
  doStageTranscript,
  doStageStoryCount,
  doStageStorySplit,
} = require('./services/articleProcessor')

/* ── Config ─────────────────────────────────────────── */

const MAX_RETRIES = 3
const STUCK_TIMEOUT_MS = 10 * 60 * 1000
const MAX_ROUNDS = 5
const AI_INTER_ITEM_MS = 3_000
const RESCUE_INTERVAL_MS = 60_000
const SOURCE_POLL_MS = 5 * 60 * 1000
const AI_CONCURRENCY = 5

const STAGES = [
  'transcript', 'story_count', 'story_split', 'imported', 'content',
  'classify', 'title_translate', 'score', 'research',
]

const STAGE_CONFIG = {
  transcript:      { batch: 5,  pollMs: 5_000,  serial: false, ai: false },
  story_count:     { batch: 5,  pollMs: 3_000,  serial: false, ai: false },
  story_split:     { batch: 1,  pollMs: 10_000, serial: true,  ai: true  },
  imported:        { batch: 5,  pollMs: 3_000,  serial: false, ai: false },
  content:         { batch: 5,  pollMs: 5_000,  serial: false, ai: false },
  classify:        { batch: 8,  pollMs: 5_000,  serial: false, ai: true  },
  title_translate: { batch: 8,  pollMs: 5_000,  serial: false, ai: true  },
  score:           { batch: 3,  pollMs: 8_000,  serial: true,  ai: true  },
  research:        { batch: 5,  pollMs: 5_000,  serial: false, ai: true  },
}

/* ── Semaphore (limits concurrent AI calls across all stages) ── */

class Semaphore {
  constructor(max) { this.max = max; this.current = 0; this.queue = [] }
  acquire() {
    if (this.current < this.max) { this.current++; return Promise.resolve() }
    return new Promise(resolve => this.queue.push(resolve))
  }
  release() {
    this.current--
    if (this.queue.length > 0) { this.current++; this.queue.shift()() }
  }
}

const aiSemaphore = new Semaphore(AI_CONCURRENCY)

/* ── Pause state ─────────────────────────────────────── */

let paused = false

async function loadPausedState() {
  try {
    const row = await db.appSetting.findUnique({ where: { key: 'articlePipelinePaused' } })
    paused = row?.value === 'true'
  } catch (_) {}
}

function isPaused() { return paused }

async function setPaused(v) {
  paused = !!v
  try {
    await db.appSetting.upsert({
      where: { key: 'articlePipelinePaused' },
      update: { value: String(paused) },
      create: { key: 'articlePipelinePaused', value: String(paused) },
    })
  } catch (e) {
    logger.warn({ error: e.message }, '[article-worker] failed to persist pause state')
  }
}

/* ── Item picking ────────────────────────────────────── */

async function pickItems(stage) {
  const limit = STAGE_CONFIG[stage]?.batch || 1
  const candidates = await db.article.findMany({
    where: { stage, status: 'queued', retries: { lt: MAX_RETRIES } },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
    take: limit,
  })
  if (!candidates.length) return []

  const ids = candidates.map(c => c.id)
  const now = new Date()
  await db.article.updateMany({
    where: { id: { in: ids }, status: 'queued' },
    data: { status: 'running', startedAt: now, error: null },
  })

  return db.article.findMany({
    where: { id: { in: ids }, status: 'running', startedAt: now },
    include: { source: { include: { channel: true } } },
  })
}

/* ── Single-item processing (unchanged — used by test-run API too) ── */

async function processItem(article, { force = false } = {}) {
  const channel = article.source?.channel
  if (!channel) return
  if (!force && channel.status === 'paused') return

  const check = await preflight('article', article.stage)
  if (!check.canRun) {
    await db.article.update({
      where: { id: article.id },
      data: { status: 'blocked', error: `Waiting for: ${check.missing.join(', ')}` },
    })
    articleEvents.emit(`article:${article.id}`, { stage: article.stage, status: 'blocked' })
    return
  }

  try {
    let out
    switch (article.stage) {
      case 'transcript':      out = await doStageTranscript(article, channel); break
      case 'story_count':     out = await doStageStoryCount(article, channel); break
      case 'story_split':     out = await doStageStorySplit(article, channel); break
      case 'imported':        out = await doStageImported(article, channel); break
      case 'content':         out = await doStageContent(article, channel); break
      case 'classify':        out = await doStageClassify(article, channel); break
      case 'title_translate':  out = await doStageTitleTranslate(article, channel); break
      case 'score':           out = await doStageScore(article, channel); break
      case 'research':        out = await doStageResearch(article, channel); break
      default: return
    }

    if (out.reviewStatus === 'review') {
      await db.article.update({
        where: { id: article.id },
        data: { status: 'review', error: out.reviewReason || 'Needs review', finishedAt: new Date() },
      })
      articleEvents.emit(`article:${article.id}`, { stage: article.stage, status: 'review' })
      return
    }

    const isTerminal = out.nextStage === 'done' || out.nextStage === 'filtered' || out.nextStage === 'adapter_done'
    await db.article.update({
      where: { id: article.id },
      data: {
        stage: out.nextStage,
        status: isTerminal ? out.nextStage : 'queued',
        error: null,
        finishedAt: new Date(),
      },
    })
    articleEvents.emit(`article:${article.id}`, { stage: out.nextStage, status: isTerminal ? out.nextStage : 'queued' })
  } catch (err) {
    const errorMsg = (err && err.message) || String(err)

    if (err.isServiceError && !err.retryable) {
      await db.article.update({
        where: { id: article.id },
        data: { status: 'blocked', error: errorMsg, finishedAt: new Date() },
      })
      articleEvents.emit(`article:${article.id}`, { stage: article.stage, status: 'blocked' })
      await blockDependents(err.service)
      return
    }

    const updated = await db.article.update({
      where: { id: article.id },
      data: {
        error: errorMsg,
        retries: { increment: 1 },
        finishedAt: new Date(),
        stage: article.stage,
        status: 'queued',
      },
    })
    if (updated.retries >= MAX_RETRIES) {
      await db.article.update({
        where: { id: article.id },
        data: { stage: 'failed', status: 'failed' },
      })
      articleEvents.emit(`article:${article.id}`, { stage: 'failed', status: 'failed' })
    }
  }
}

/* ── Tracked item processing (wraps processItem, captures result) ── */

async function processItemTracked(article, stage) {
  const config = STAGE_CONFIG[stage]
  const startMs = Date.now()
  const attempt = (article.retries || 0) + 1
  const origStage = article.stage

  const run = async () => {
    try {
      await processItem(article)
    } catch (_) { /* processItem handles its own errors */ }
  }

  if (config.ai) {
    await aiSemaphore.acquire()
    try { await run() } finally { aiSemaphore.release() }
  } else {
    await run()
  }

  const durationMs = Date.now() - startMs

  try {
    const after = await db.article.findUnique({
      where: { id: article.id },
      select: { stage: true, status: true, error: true },
    })
    if (!after) return { articleId: article.id, status: 'failed', error: 'Article deleted', durationMs, attempt }

    if (after.stage !== origStage && after.status !== 'failed') {
      return { articleId: article.id, status: 'succeeded', error: null, durationMs, attempt }
    }
    if (after.status === 'review') {
      return { articleId: article.id, status: 'review', error: after.error, durationMs, attempt }
    }
    if (after.status === 'blocked') {
      return { articleId: article.id, status: 'blocked', error: after.error, durationMs, attempt }
    }
    if (after.status === 'failed') {
      return { articleId: article.id, status: 'failed', error: after.error, durationMs, attempt }
    }
    return { articleId: article.id, status: 'failed', error: after.error || 'Unknown', durationMs, attempt }
  } catch (e) {
    return { articleId: article.id, status: 'failed', error: e.message, durationMs, attempt }
  }
}

/* ── Batch persistence (async, non-blocking) ─────────── */

let batchSeq = 0

function persistBatch(pipeline, stage, seq, items, results, catchup, batchStart) {
  const channelIds = [...new Set(items.map(a => a.channelId).filter(Boolean))]
  const succeeded = results.filter(r => r.status === 'succeeded').length
  const failed = results.length - succeeded

  db.pipelineBatch.create({
    data: {
      pipeline, stage, batchSeq: seq,
      itemCount: items.length, succeededCount: succeeded, failedCount: failed,
      catchup: !!catchup, channelIds,
      startedAt: batchStart, finishedAt: new Date(),
      items: {
        create: results.map(r => ({
          articleId: r.articleId,
          status: r.status,
          error: r.error || null,
          durationMs: r.durationMs,
          attempt: r.attempt,
        })),
      },
    },
  }).catch(e => logger.warn({ error: e.message }, '[article-worker] batch persist failed'))
}

/* ── Run one batch for a stage ───────────────────────── */

async function runStage(stage) {
  const config = STAGE_CONFIG[stage]
  let totalProcessed = 0

  for (let round = 0; round < MAX_ROUNDS; round++) {
    if (paused) break
    const items = await pickItems(stage)
    if (!items.length) break

    const seq = ++batchSeq
    const batchStart = new Date()
    emitBatch('article', { type: 'batch_start', stage, batchId: seq, count: items.length })

    let results
    if (config.serial) {
      results = []
      for (let i = 0; i < items.length; i++) {
        const r = await processItemTracked(items[i], stage)
        results.push(r)
        if (i < items.length - 1) await new Promise(r => setTimeout(r, AI_INTER_ITEM_MS))
      }
    } else {
      results = await Promise.all(items.map(a => processItemTracked(a, stage)))
    }

    const failed = results.filter(r => r.status !== 'succeeded').length
    totalProcessed += items.length

    emitBatch('article', { type: 'batch_done', stage, batchId: seq, count: items.length, failed })
    persistBatch('article', stage, seq, items, results, false, batchStart)

    if (items.length < config.batch) break
  }

  return totalProcessed
}

/* ── Rescue stuck items ──────────────────────────────── */

async function rescueStuckItems() {
  const cutoff = new Date(Date.now() - STUCK_TIMEOUT_MS)
  const result = await db.article.updateMany({
    where: { status: 'running', startedAt: { lt: cutoff } },
    data: { status: 'queued', retries: { increment: 1 }, error: 'Rescued: stuck as running >10 min' },
  })
  if (result.count > 0) {
    logger.warn({ count: result.count }, '[article-worker] rescued stuck articles')
  }
  const failed = await db.article.updateMany({
    where: { status: 'queued', retries: { gte: MAX_RETRIES } },
    data: { stage: 'failed', status: 'failed' },
  })
  if (failed.count > 0) {
    logger.warn({ count: failed.count }, '[article-worker] articles exceeded max retries → failed')
  }
}

/* ── Source polling ───────────────────────────────────── */

async function pollSources() {
  try {
    const { ingestAll, hasNicheEmbedding } = require('./services/articlePipeline')
    const channels = await db.channel.findMany({
      where: { type: 'ours', status: 'active', parentChannelId: null },
      select: { id: true },
    })
    for (const channel of channels) {
      try {
        const hasDna = await hasNicheEmbedding(channel.id)
        if (!hasDna) continue
        const results = await ingestAll(channel.id)
        const totalInserted = results.reduce((s, r) => s + (r.inserted || 0), 0)
        if (totalInserted > 0) {
          logger.info({ channelId: channel.id, inserted: totalInserted }, '[article-worker] auto-ingested new articles')
        }
      } catch (e) {
        logger.warn({ channelId: channel.id, error: e.message }, '[article-worker] auto-ingest failed for channel')
      }
    }
  } catch (e) {
    logger.error({ error: e.message }, '[article-worker] source poll error')
  }
}

/* ── Per-stage loop ──────────────────────────────────── */

async function runStageLoop(stage) {
  const config = STAGE_CONFIG[stage]
  const idleMs = config.pollMs * 2
  logger.info({ stage, batchSize: config.batch, pollMs: config.pollMs, serial: config.serial, ai: config.ai }, '[article-worker] stage loop started')

  while (!shuttingDown) {
    if (paused) {
      await sleep(idleMs)
      continue
    }
    try {
      const processed = await runStage(stage)
      await sleep(processed > 0 ? config.pollMs : idleMs)
    } catch (e) {
      logger.error({ stage, error: e.message }, '[article-worker] stage loop error')
      await sleep(idleMs)
    }
  }
}

/* ── Periodic tasks (rescue + unblock + source poll) ─── */

async function runPeriodicTasks() {
  while (!shuttingDown) {
    try {
      if (!paused) {
        await rescueStuckItems()
        await unblockReady()
      }
    } catch (e) {
      logger.error({ error: e.message }, '[article-worker] rescue/unblock error')
    }
    await sleep(RESCUE_INTERVAL_MS)
  }
}

async function runSourcePollLoop() {
  while (!shuttingDown) {
    try {
      if (!paused) await pollSources()
    } catch (e) {
      logger.error({ error: e.message }, '[article-worker] source poll error')
    }
    await sleep(SOURCE_POLL_MS)
  }
}

/* ── Main entry ──────────────────────────────────────── */

let shuttingDown = false

async function migrateTranslatedStage() {
  const result = await db.article.updateMany({
    where: { stage: 'translated' },
    data: { stage: 'done', status: 'done' },
  })
  if (result.count > 0) {
    logger.info({ count: result.count }, '[article-worker] migrated articles from removed "translated" stage → done')
  }
}

async function runPollingWorker() {
  registry.autoDiscover()
  await loadPausedState()
  await migrateTranslatedStage()
  logger.info({
    stages: STAGES.length,
    aiConcurrency: AI_CONCURRENCY,
    paused,
  }, '[article-worker] started (concurrent per-stage loops)')

  runPeriodicTasks()
  runSourcePollLoop()

  for (const stage of STAGES) {
    runStageLoop(stage)
  }

  // Keep process alive until shutdown
  await new Promise((resolve) => {
    const check = setInterval(() => {
      if (shuttingDown) { clearInterval(check); resolve() }
    }, 1000)
  })
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

function shutdown(signal) {
  if (shuttingDown) return
  shuttingDown = true
  logger.info(`[article-worker] ${signal} received — shutting down`)
  db.$disconnect()
    .then(() => process.exit(0))
    .catch(() => process.exit(1))
  setTimeout(() => process.exit(1), 10_000)
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

module.exports = { runPollingWorker, isPaused, setPaused, processItem, rescueStuckItems }
