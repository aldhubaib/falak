/**
 * Article pipeline worker: polls for queued articles and processes them through stages.
 * Stages: imported → content → classify → research → translated → score → done
 *
 * Mirrors the video pipeline worker pattern (worker.js).
 */
try { require('dotenv').config() } catch (_) {}
const db = require('./lib/db')
const logger = require('./lib/logger')
const {
  doStageImported,
  doStageContent,
  doStageClassify,
  doStageResearch,
  doStageTranslated,
  doStageScore,
} = require('./services/articleProcessor')

const POLL_MS = 10_000
const SOURCE_POLL_MS = 5 * 60 * 1000 // check sources for new Apify runs every 5 min
const BATCH_FAST = 5
const BATCH_AI = 1
const AI_INTER_ITEM_MS = 3_000
const MAX_RETRIES = 3
const STUCK_TIMEOUT_MS = 10 * 60 * 1000

const STAGES = ['imported', 'content', 'classify', 'research', 'translated', 'score']

const AI_STAGES = new Set(['classify', 'research', 'translated', 'score'])

let paused = false
function isPaused() { return paused }
function setPaused(v) { paused = !!v }

async function pickItems(stage) {
  const limit = AI_STAGES.has(stage) ? BATCH_AI : BATCH_FAST
  return db.article.findMany({
    where: {
      stage,
      status: 'queued',
      retries: { lt: MAX_RETRIES },
    },
    include: {
      source: {
        include: { project: true },
      },
    },
    orderBy: { createdAt: 'asc' },
    take: limit,
  })
}

async function processItem(article) {
  const project = article.source?.project
  if (!project) return
  if (project.status === 'paused') return

  await db.article.update({
    where: { id: article.id },
    data: { status: 'running', startedAt: new Date(), error: null },
  })

  try {
    let out
    switch (article.stage) {
      case 'imported':
        out = await doStageImported(article, project)
        break
      case 'content':
        out = await doStageContent(article, project)
        break
      case 'classify':
        out = await doStageClassify(article, project)
        break
      case 'research':
        out = await doStageResearch(article, project)
        break
      case 'translated':
        out = await doStageTranslated(article, project)
        break
      case 'score':
        out = await doStageScore(article, project)
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
      return
    }

    await db.article.update({
      where: { id: article.id },
      data: {
        stage: out.nextStage,
        status: out.nextStage === 'done' ? 'done' : 'queued',
        error: null,
        finishedAt: new Date(),
      },
    })
  } catch (err) {
    const errorMsg = (err && err.message) || String(err)
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
    data: { status: 'queued', error: 'Rescued: was stuck as running for >10 min' },
  })
  if (result.count > 0) {
    logger.warn({ count: result.count }, '[article-worker] rescued stuck articles back to queued')
  }
}

async function tick() {
  if (paused) return
  await rescueStuckItems()
  for (const stage of STAGES) {
    await runStage(stage)
  }
}

let lastSourcePoll = 0

async function pollSources() {
  if (Date.now() - lastSourcePoll < SOURCE_POLL_MS) return
  lastSourcePoll = Date.now()

  try {
    const { ingestAll } = require('./services/articlePipeline')
    const projects = await db.project.findMany({
      where: { status: 'active' },
      select: { id: true },
    })
    for (const project of projects) {
      try {
        const results = await ingestAll(project.id)
        const totalInserted = results.reduce((s, r) => s + (r.inserted || 0), 0)
        if (totalInserted > 0) {
          logger.info({ projectId: project.id, inserted: totalInserted }, '[article-worker] auto-ingested new articles')
        }
      } catch (e) {
        logger.warn({ projectId: project.id, error: e.message }, '[article-worker] auto-ingest failed for project')
      }
    }
  } catch (e) {
    logger.error({ error: e.message }, '[article-worker] source poll error')
  }
}

async function runPollingWorker() {
  logger.info({ pollMs: POLL_MS, sourcePollMs: SOURCE_POLL_MS }, '[article-worker] started (polling)')
  for (;;) {
    try {
      await tick()
      await pollSources()
    } catch (e) {
      logger.error({ error: e.message }, '[article-worker] tick error')
    }
    await new Promise(r => setTimeout(r, POLL_MS))
  }
}

module.exports = { tick, rescueStuckItems, runPollingWorker, isPaused, setPaused, processItem }
