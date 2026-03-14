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

const POLL_MS = 10_000
const BATCH_PER_STAGE = 3
const MAX_RETRIES = 3
const STAGES = ['import', 'transcribe', 'comments', 'analyzing']

async function pickItems(stage) {
  return db.pipelineItem.findMany({
    where: {
      stage,
      status: 'queued',
      retries: { lt: MAX_RETRIES },
    },
    include: {
      video: {
        include: {
          channel: { include: { project: true } },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
    take: BATCH_PER_STAGE,
  })
}

async function processItem(item) {
  const { video } = item
  if (!video?.channel?.project) return
  const project = video.channel.project
  if (project.status === 'paused') return

  await db.pipelineItem.update({
    where: { id: item.id },
    data: { status: 'running', startedAt: new Date(), error: null, lastStage: item.stage },
  })

  try {
    let out
    switch (item.stage) {
      case 'import':
        out = await doStageImport(item, video, project)
        break
      case 'transcribe':
        out = await doStageTranscribe(item, video, project)
        break
      case 'comments':
        out = await doStageComments(item, video, project)
        break
      case 'analyzing':
        out = await doStageAnalyzing(item, video, project)
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
    await db.pipelineItem.update({
      where: { id: item.id },
      data: {
        stage: 'failed',
        status: 'failed',
        error: errorMsg,
        retries: { increment: 1 },
        finishedAt: new Date(),
      },
    })
  }
}

async function runStage(stage) {
  const items = await pickItems(stage)
  await Promise.all(items.map(processItem))
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
  q.process((job) => processJob(job))
  console.log('[worker] Pipeline queue consumer started (Bull)')
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
  if (getQueue()) {
    await runQueueWorker()
  } else {
    await runPollingWorker()
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error('[worker] fatal:', e)
    process.exit(1)
  })
}

module.exports = { tick, rescueStuckItems, runQueueWorker, runPollingWorker }
