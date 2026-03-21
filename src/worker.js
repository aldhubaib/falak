/**
 * Pipeline worker: when REDIS_URL is set, consumes jobs from Bull queue only (no polling).
 * When REDIS_URL is not set, runs legacy polling loop (pick queued items, process in-process).
 */
try { require('dotenv').config() } catch (_) {}
const config = require('./config')
const db = require('./lib/db')
const {
  doStageImport,
  doStageTranscribe,
  doStageComments,
  doStageAnalyzing,
} = require('./services/pipelineProcessor')
const { getQueue, addJob, processJob } = require('./queue/pipeline')
const registry = require('./lib/serviceRegistry')
const { preflight, blockDependents, unblockReady } = require('./lib/pipelinePreflight')

const POLL_MS = 10_000
const BATCH_PER_STAGE = 3          // import / transcribe / comments: 3 concurrent is fine
const BATCH_ANALYZING = 1          // analyzing: 1 at a time — each video makes 4 Anthropic calls
const ANALYZING_INTER_ITEM_MS = 5_000  // 5s gap between analyzing items
const MAX_RETRIES = 3
const STAGES = ['import', 'transcribe', 'comments', 'analyzing']

async function pickItems(stage) {
  const limit = stage === 'analyzing' ? BATCH_ANALYZING : BATCH_PER_STAGE
  // Atomic claim: find candidates then conditionally update only those still queued
  const candidates = await db.pipelineItem.findMany({
    where: { stage, status: 'queued', retries: { lt: MAX_RETRIES } },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
    take: limit,
  })
  if (!candidates.length) return []

  const ids = candidates.map(c => c.id)
  const now = new Date()
  await db.pipelineItem.updateMany({
    where: { id: { in: ids }, status: 'queued' },
    data: { status: 'running', startedAt: now, error: null, lastStage: stage },
  })

  return db.pipelineItem.findMany({
    where: { id: { in: ids }, status: 'running', startedAt: now },
    include: { video: { include: { channel: true } } },
  })
}

async function processItem(item) {
  const { video } = item
  if (!video?.channel) return
  const channel = video.channel
  if (channel.status === 'paused') return

  // Preflight: check required services before running the stage
  const check = await preflight('video', item.stage)
  if (!check.canRun) {
    await db.pipelineItem.update({
      where: { id: item.id },
      data: {
        status: 'blocked',
        error: `Waiting for: ${check.missing.join(', ')}`,
      },
    })
    return
  }

  try {
    let out
    switch (item.stage) {
      case 'import':
        out = await doStageImport(item, video, channel)
        break
      case 'transcribe':
        out = await doStageTranscribe(item, video, channel)
        break
      case 'comments':
        out = await doStageComments(item, video, channel)
        break
      case 'analyzing':
        out = await doStageAnalyzing(item, video, channel)
        break
      default:
        return
    }

    await db.pipelineItem.update({
      where: { id: item.id },
      data: {
        stage: out.nextStage,
        status: out.nextStage === 'done' ? 'done' : 'queued',
        error: null,
        finishedAt: new Date(),
      },
    })
  } catch (err) {
    const errorMsg = (err && err.message) || String(err)

    // Non-retryable service errors → block (don't burn retries)
    if (err.isServiceError && !err.retryable) {
      await db.pipelineItem.update({
        where: { id: item.id },
        data: { status: 'blocked', error: errorMsg, finishedAt: new Date() },
      })
      await blockDependents(err.service)
      return
    }

    // Transient / unknown errors → normal retry logic
    const updated = await db.pipelineItem.update({
      where: { id: item.id },
      data: {
        error: errorMsg,
        retries: { increment: 1 },
        finishedAt: new Date(),
        stage: item.stage,
        status: 'queued',
      },
    })
    if (updated.retries >= MAX_RETRIES) {
      await db.pipelineItem.update({
        where: { id: item.id },
        data: { stage: 'failed', status: 'failed' },
      })
    }
  }
}

async function runStage(stage) {
  const items = await pickItems(stage)
  if (stage === 'analyzing') {
    // Run analyzing items serially with a gap to avoid Anthropic rate limits
    for (let i = 0; i < items.length; i++) {
      await processItem(items[i])
      if (i < items.length - 1) {
        await new Promise(r => setTimeout(r, ANALYZING_INTER_ITEM_MS))
      }
    }
  } else {
    await Promise.all(items.map(processItem))
  }
}

// Reset items stuck as 'running' for longer than STUCK_TIMEOUT_MS.
// This handles the case where the worker crashed mid-item and left it as running.
const STUCK_TIMEOUT_MS = 10 * 60 * 1000 // 10 minutes

async function rescueStuckItems() {
  const cutoff = new Date(Date.now() - STUCK_TIMEOUT_MS)
  const result = await db.pipelineItem.updateMany({
    where: { status: 'running', startedAt: { lt: cutoff } },
    data: { status: 'queued', error: 'Rescued: was stuck as running for >10 min' },
  })
  if (result.count > 0) {
    console.warn(`[worker] rescued ${result.count} stuck item(s) back to queued`)
  }
}

async function tick() {
  await rescueStuckItems()
  await unblockReady()
  for (const stage of STAGES) {
    await runStage(stage)
  }
}

async function runQueueWorker() {
  const q = getQueue()
  if (!q) {
    console.error('[worker] REDIS_URL is not set. Start the server with REDIS_URL to use the queue worker.')
    process.exit(1)
  }
  q.process(5, (job) => processJob(job))
  console.log('[worker] Pipeline queue consumer started (Bull, concurrency=5)')
}

async function runPollingWorker() {
  console.log('[worker] Pipeline worker started (poll every %ds, no Redis)', POLL_MS / 1000)
  for (;;) {
    try {
      await tick()
    } catch (e) {
      console.error('[worker] tick error:', e.message)
    }
    await new Promise((r) => setTimeout(r, POLL_MS))
  }
}

async function main() {
  registry.autoDiscover()
  if (getQueue()) {
    await runQueueWorker()
  } else {
    await runPollingWorker()
  }
}

let shuttingDown = false
function shutdown(signal) {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`[worker] ${signal} received — shutting down`)
  const q = getQueue()
  const closeQueue = q ? q.close().catch(() => {}) : Promise.resolve()
  closeQueue
    .then(() => db.$disconnect())
    .then(() => process.exit(0))
    .catch(() => process.exit(1))
  setTimeout(() => process.exit(1), 10_000)
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

if (require.main === module) {
  main().catch((e) => {
    console.error('[worker] fatal:', e)
    process.exit(1)
  })
}

module.exports = { tick, rescueStuckItems, runQueueWorker, runPollingWorker }
