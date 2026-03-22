/**
 * Article pipeline worker: polls for queued articles and processes them through stages.
 * Stages: imported → content → classify → title_translate → score → [threshold gate] → research → translated → done
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
  doStageTranscript,
  doStageStoryCount,
  doStageStorySplit,
} = require('./services/articleProcessor')

const POLL_IDLE_MS = 10_000
const POLL_BUSY_MS = 2_000
const SOURCE_POLL_MS = 5 * 60 * 1000 // check sources for new Apify runs every 5 min
const AI_INTER_ITEM_MS = 3_000
const INTER_BATCH_MS = 1_000
const MAX_RETRIES = 3
const STUCK_TIMEOUT_MS = 10 * 60 * 1000
const MAX_ROUNDS_PER_STAGE = 5
const CATCHUP_THRESHOLD = 30
const CATCHUP_ROUNDS = 10

const STAGES = ['transcript', 'story_count', 'story_split', 'imported', 'content', 'classify', 'title_translate', 'score', 'research', 'translated']

const STAGE_BATCH = {
  transcript:      5,
  story_count:     5,
  story_split:     1,
  imported:        5,
  content:         5,
  classify:        8,
  title_translate: 8,
  score:           3,
  research:        2,
  translated:      2,
}

// Expensive multi-step stages that must run serially with inter-item delays
const SERIAL_AI_STAGES = new Set(['story_split', 'score', 'research', 'translated'])

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
  const limit = STAGE_BATCH[stage] || 1
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
      case 'story_count':
        out = await doStageStoryCount(article, channel)
        break
      case 'story_split':
        out = await doStageStorySplit(article, channel)
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
  let totalProcessed = 0
  const batchSize = STAGE_BATCH[stage] || 1
  const maxRounds = SERIAL_AI_STAGES.has(stage) ? 1 : MAX_ROUNDS_PER_STAGE

  for (let round = 0; round < maxRounds; round++) {
    if (paused) break
    const items = await pickItems(stage)
    if (!items.length) break

    if (SERIAL_AI_STAGES.has(stage)) {
      for (let i = 0; i < items.length; i++) {
        await processItem(items[i])
        if (i < items.length - 1) {
          await new Promise(r => setTimeout(r, AI_INTER_ITEM_MS))
        }
      }
    } else {
      const results = await Promise.allSettled(items.map(processItem))
      for (let i = 0; i < results.length; i++) {
        if (results[i].status === 'rejected') {
          logger.warn({ articleId: items[i]?.id, error: results[i].reason?.message }, `[article-worker] ${stage} failed`)
        }
      }
    }

    totalProcessed += items.length
    if (items.length < batchSize) break
    if (round < maxRounds - 1) {
      await new Promise(r => setTimeout(r, INTER_BATCH_MS))
    }
  }

  if (totalProcessed > 0) {
    logger.info({ stage, processed: totalProcessed }, '[article-worker] stage batch complete')
  }
  return totalProcessed
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
  if (paused) return false
  await rescueStuckItems()
  await unblockReady()
  let hadWork = false
  for (const stage of STAGES) {
    if (paused) break
    const processed = await runStage(stage)
    if (processed > 0) hadWork = true
  }

  // Catch-up pass: re-drain non-serial stages that still have large backlogs.
  // Prevents slow downstream stages from starving fast upstream stages.
  if (!paused && hadWork) {
    for (const stage of STAGES) {
      if (paused || SERIAL_AI_STAGES.has(stage)) continue
      const queued = await db.article.count({ where: { stage, status: 'queued', retries: { lt: MAX_RETRIES } } })
      if (queued >= CATCHUP_THRESHOLD) {
        logger.info({ stage, queued }, '[article-worker] catch-up drain')
        const batchSize = STAGE_BATCH[stage] || 1
        for (let r = 0; r < CATCHUP_ROUNDS; r++) {
          if (paused) break
          const items = await pickItems(stage)
          if (!items.length) break
          const results = await Promise.allSettled(items.map(processItem))
          for (let i = 0; i < results.length; i++) {
            if (results[i].status === 'rejected') {
              logger.warn({ articleId: items[i]?.id, error: results[i].reason?.message }, `[article-worker] ${stage} catch-up failed`)
            }
          }
          if (items.length < batchSize) break
          await new Promise(resolve => setTimeout(resolve, INTER_BATCH_MS))
        }
      }
    }
  }

  return hadWork
}

let lastSourcePoll = 0

async function pollSources() {
  if (Date.now() - lastSourcePoll < SOURCE_POLL_MS) return
  lastSourcePoll = Date.now()

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

async function runPollingWorker() {
  registry.autoDiscover()
  await loadPausedState()
  logger.info({ pollIdleMs: POLL_IDLE_MS, pollBusyMs: POLL_BUSY_MS, sourcePollMs: SOURCE_POLL_MS, paused }, '[article-worker] started (polling)')
  for (;;) {
    let hadWork = false
    try {
      hadWork = await tick()
      if (!paused) await pollSources()
    } catch (e) {
      logger.error({ error: e.message }, '[article-worker] tick error')
    }
    await new Promise(r => setTimeout(r, hadWork ? POLL_BUSY_MS : POLL_IDLE_MS))
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
