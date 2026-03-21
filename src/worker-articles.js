/**
 * Article pipeline worker: polls for queued articles and processes them through stages.
 * Stages: imported → content → classify → title_translate → score → [threshold gate] → research → translated → images → done
 *
 * Mirrors the video pipeline worker pattern (worker.js).
 */
try { require('dotenv').config() } catch (_) {}
const db = require('./lib/db')
const logger = require('./lib/logger')
const articleEvents = require('./lib/articleEvents')
const registry = require('./lib/serviceRegistry')
const { preflight, blockDependents, unblockReady } = require('./lib/pipelinePreflight')
const {
  doStageImported,
  doStageContent,
  doStageClassify,
  doStageTitleTranslate,
  doStageScore,
  doStageResearch,
  doStageTranslated,
  doStageImages,
  doStageTranscript,
  doStageStoryDetect,
} = require('./services/articleProcessor')

const POLL_MS = 10_000
const SOURCE_POLL_MS = 5 * 60 * 1000 // check sources for new Apify runs every 5 min
const BATCH_FAST = 5
const BATCH_AI = 1
const AI_INTER_ITEM_MS = 3_000
const MAX_RETRIES = 3
const STUCK_TIMEOUT_MS = 10 * 60 * 1000

const STAGES = ['transcript', 'story_detect', 'imported', 'content', 'classify', 'title_translate', 'score', 'research', 'translated', 'images']

const AI_STAGES = new Set(['story_detect', 'classify', 'title_translate', 'score', 'research', 'translated'])

let paused = false
let pauseLoaded = false

async function loadPausedState() {
  try {
    const row = await db.appSetting.findUnique({ where: { key: 'articlePipelinePaused' } })
    paused = row?.value === 'true'
    pauseLoaded = true
  } catch (_) {
    // table may not exist yet during migration — keep in-memory default
  }
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

async function pickItems(stage) {
  const limit = AI_STAGES.has(stage) ? BATCH_AI : BATCH_FAST
  // Atomic claim: find candidates then conditionally update only those still queued
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

async function processItem(article, { force = false } = {}) {
  const channel = article.source?.channel
  if (!channel) return
  if (!force && channel.status === 'paused') return

  // Preflight: check required services before running the stage
  const check = await preflight('article', article.stage)
  if (!check.canRun) {
    await db.article.update({
      where: { id: article.id },
      data: {
        status: 'blocked',
        error: `Waiting for: ${check.missing.join(', ')}`,
      },
    })
    articleEvents.emit(`article:${article.id}`, { stage: article.stage, status: 'blocked' })
    return
  }

  try {
    let out
    switch (article.stage) {
      case 'transcript':
        out = await doStageTranscript(article, channel)
        break
      case 'story_detect':
        out = await doStageStoryDetect(article, channel)
        break
      case 'imported':
        out = await doStageImported(article, channel)
        break
      case 'content':
        out = await doStageContent(article, channel)
        break
      case 'classify':
        out = await doStageClassify(article, channel)
        break
      case 'title_translate':
        out = await doStageTitleTranslate(article, channel)
        break
      case 'score':
        out = await doStageScore(article, channel)
        break
      case 'research':
        out = await doStageResearch(article, channel)
        break
      case 'translated':
        out = await doStageTranslated(article, channel)
        break
      case 'images':
        out = await doStageImages(article, channel)
        break
      default:
        return
    }

    if (out.reviewStatus === 'review') {
      await db.article.update({
        where: { id: article.id },
        data: {
          status: 'review',
          error: out.reviewReason || 'Needs review',
          finishedAt: new Date(),
        },
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

    // Non-retryable service errors → block (don't burn retries)
    if (err.isServiceError && !err.retryable) {
      await db.article.update({
        where: { id: article.id },
        data: { status: 'blocked', error: errorMsg, finishedAt: new Date() },
      })
      articleEvents.emit(`article:${article.id}`, { stage: article.stage, status: 'blocked' })
      await blockDependents(err.service)
      return
    }

    // Transient / unknown errors → normal retry logic
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

async function runStage(stage) {
  const items = await pickItems(stage)
  if (AI_STAGES.has(stage)) {
    for (let i = 0; i < items.length; i++) {
      await processItem(items[i])
      if (i < items.length - 1) {
        await new Promise(r => setTimeout(r, AI_INTER_ITEM_MS))
      }
    }
  } else {
    await Promise.all(items.map(processItem))
  }
}

async function rescueStuckItems() {
  const cutoff = new Date(Date.now() - STUCK_TIMEOUT_MS)
  const result = await db.article.updateMany({
    where: { status: 'running', startedAt: { lt: cutoff } },
    data: { status: 'queued', retries: { increment: 1 }, error: 'Rescued: was stuck as running for >10 min' },
  })
  if (result.count > 0) {
    logger.warn({ count: result.count }, '[article-worker] rescued stuck articles back to queued')
  }
  const failed = await db.article.updateMany({
    where: { status: 'queued', retries: { gte: MAX_RETRIES } },
    data: { stage: 'failed', status: 'failed' },
  })
  if (failed.count > 0) {
    logger.warn({ count: failed.count }, '[article-worker] articles exceeded max retries → failed')
  }
}

async function tick() {
  if (paused) return
  await rescueStuckItems()
  await unblockReady()
  for (const stage of STAGES) {
    if (paused) return
    await runStage(stage)
  }
}

let lastSourcePoll = 0

async function pollSources() {
  if (Date.now() - lastSourcePoll < SOURCE_POLL_MS) return
  lastSourcePoll = Date.now()

  try {
    const { ingestAll } = require('./services/articlePipeline')
    const channels = await db.channel.findMany({
      where: { type: 'ours', status: 'active', parentChannelId: null },
      select: { id: true },
    })
    for (const channel of channels) {
      try {
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

async function runPollingWorker() {
  registry.autoDiscover()
  await loadPausedState()
  logger.info({ pollMs: POLL_MS, sourcePollMs: SOURCE_POLL_MS, paused }, '[article-worker] started (polling)')
  for (;;) {
    try {
      await tick()
      if (!paused) await pollSources()
    } catch (e) {
      logger.error({ error: e.message }, '[article-worker] tick error')
    }
    await new Promise(r => setTimeout(r, POLL_MS))
  }
}

let shuttingDown = false
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

module.exports = { tick, rescueStuckItems, runPollingWorker, isPaused, setPaused, processItem }
