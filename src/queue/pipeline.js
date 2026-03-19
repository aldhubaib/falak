/**
 * Pipeline queue: Bull + Redis. Job data: { pipelineItemId, stage }.
 * When REDIS_URL is set, enqueue here; worker consumes. When not set, getQueue() is null and API/worker use legacy polling/sync.
 */
const Queue = require('bull')
const config = require('../config')
const db = require('../lib/db')
const {
  doStageImport,
  doStageTranscribe,
  doStageComments,
  doStageAnalyzing,
} = require('../services/pipelineProcessor')

const QUEUE_NAME = 'falak-pipeline'
const MAX_RETRIES = 3

let queue = null
if (config.REDIS_URL) {
  queue = new Queue(QUEUE_NAME, config.REDIS_URL, {
    defaultJobOptions: {
      removeOnComplete: 100,
      removeOnFail: 500,
      attempts: 1,
    },
  })
}

function getQueue() {
  return queue
}

function addJob(pipelineItemId, stage) {
  if (!queue) return Promise.resolve(null)
  return queue.add({ pipelineItemId, stage }, { jobId: `${pipelineItemId}-${stage}-${Date.now()}` })
}

/**
 * Process one job: load item/video/channel/project, run doStage, update DB, enqueue next stage on success.
 * Used by the worker. On failure updates item to failed and increments retries.
 */
async function processJob(job) {
  const { pipelineItemId, stage } = job.data
  const item = await db.pipelineItem.findUnique({
    where: { id: pipelineItemId },
    include: {
      video: {
        include: {
          channel: { include: { project: true } },
        },
      },
    },
  })
  if (!item?.video?.channel?.project) {
    return
  }
  const project = item.video.channel.project
  if (project.status === 'paused') {
    return
  }

  await db.pipelineItem.update({
    where: { id: item.id },
    data: { status: 'running', startedAt: new Date(), error: null, lastStage: stage },
  })

  try {
    let out
    switch (stage) {
      case 'import':
        out = await doStageImport(item, item.video, project)
        break
      case 'transcribe':
        out = await doStageTranscribe(item, item.video, project)
        break
      case 'comments':
        out = await doStageComments(item, item.video, project)
        break
      case 'analyzing':
        out = await doStageAnalyzing(item, item.video, project)
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

    if (out.nextStage && out.nextStage !== 'done') {
      await addJob(item.id, out.nextStage)
    }
  } catch (err) {
    const errorMsg = (err && err.message) || String(err)
    const updated = await db.pipelineItem.update({
      where: { id: item.id },
      data: {
        error: errorMsg,
        retries: { increment: 1 },
        finishedAt: new Date(),
        // Keep the original stage and re-queue if retries remain;
        // only move to 'failed' when retries are exhausted.
        stage,
        status: 'queued',
      },
    })
    if (updated.retries >= MAX_RETRIES) {
      await db.pipelineItem.update({
        where: { id: item.id },
        data: { stage: 'failed', status: 'failed' },
      })
    } else {
      await addJob(item.id, stage)
    }
    throw err
  }
}

module.exports = {
  getQueue,
  addJob,
  processJob,
  QUEUE_NAME,
}
