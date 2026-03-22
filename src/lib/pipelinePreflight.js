/**
 * Pipeline preflight — checks service availability before a stage runs.
 *
 * STAGE_DEPS maps every pipeline stage to the services it needs.
 * `required: true` services must be healthy or the stage is blocked.
 * `required: false` services degrade gracefully (stage still runs).
 *
 * `blockDependents(serviceName)` blocks all queued items at stages
 * that require the failed service — one failure protects the entire queue.
 *
 * `unblockReady()` runs periodically to resume blocked items when
 * the service comes back online.
 */
const db = require('./db')
const registry = require('./serviceRegistry')
const logger = require('./logger')
const articleEvents = require('./articleEvents')

// ── Stage → service dependency map ───────────────────────────────────────────

const VIDEO_STAGE_DEPS = {
  import:     [{ service: 'youtube', required: true }],
  transcribe: [{ service: 'yt-transcript', required: true }],
  comments:   [{ service: 'youtube', required: true }],
  analyzing:  [{ service: 'anthropic', required: true }, { service: 'embedding', required: false }],
}

const ARTICLE_STAGE_DEPS = {
  story_count:     [],
  story_split:     [{ service: 'anthropic', required: true }],
  imported:        [],
  content:         [{ service: 'firecrawl', required: false }],
  classify:        [{ service: 'anthropic', required: true }],
  title_translate: [{ service: 'anthropic', required: false }],
  score:           [{ service: 'embedding', required: false }, { service: 'anthropic', required: false }],
  research:        [{ service: 'google_search', required: false }, { service: 'perplexity', required: false }, { service: 'anthropic', required: false }],
  translated:      [{ service: 'anthropic', required: true }],
}

const RESCORE_DEPS = [
  { service: 'youtube', required: true },
]

// ── Preflight check ──────────────────────────────────────────────────────────

/**
 * Check if all required services for a stage are available.
 * @param {'video'|'article'} pipeline
 * @param {string} stage
 * @returns {{ canRun: boolean, missing: string[], degraded: string[] }}
 */
async function preflight(pipeline, stage) {
  const depsMap = pipeline === 'video' ? VIDEO_STAGE_DEPS : ARTICLE_STAGE_DEPS
  const deps = depsMap[stage] || []
  const missing = []
  const degraded = []

  for (const dep of deps) {
    const health = await registry.checkHealth(dep.service)
    const isDown = health.status !== 'healthy'
    if (isDown) {
      if (dep.required) missing.push(dep.service)
      else degraded.push(dep.service)
    }
  }

  return { canRun: missing.length === 0, missing, degraded }
}

// ── Block dependents ─────────────────────────────────────────────────────────

/**
 * Block all queued pipeline items and articles whose current stage requires
 * the given service. Called when a mid-flight service error is detected.
 */
async function blockDependents(serviceName) {
  // Video pipeline
  const videoStages = Object.entries(VIDEO_STAGE_DEPS)
    .filter(([, deps]) => deps.some(d => d.service === serviceName && d.required))
    .map(([stage]) => stage)

  if (videoStages.length) {
    const result = await db.pipelineItem.updateMany({
      where: { status: 'queued', stage: { in: videoStages } },
      data: { status: 'blocked', error: `Service "${serviceName}" is unavailable` },
    })
    if (result.count > 0) {
      logger.warn({ service: serviceName, blocked: result.count, stages: videoStages }, '[preflight] video items blocked')
    }
  }

  // Article pipeline
  const articleStages = Object.entries(ARTICLE_STAGE_DEPS)
    .filter(([, deps]) => deps.some(d => d.service === serviceName && d.required))
    .map(([stage]) => stage)

  if (articleStages.length) {
    const result = await db.article.updateMany({
      where: { status: 'queued', stage: { in: articleStages } },
      data: { status: 'blocked', error: `Service "${serviceName}" is unavailable` },
    })
    if (result.count > 0) {
      logger.warn({ service: serviceName, blocked: result.count, stages: articleStages }, '[preflight] article items blocked')
    }
  }
}

// ── Unblock ready ────────────────────────────────────────────────────────────

/**
 * Check all blocked items and unblock those whose required services are now available.
 * Run periodically from the worker tick loop.
 */
async function unblockReady() {
  // Video pipeline
  const blockedVideos = await db.pipelineItem.findMany({
    where: { status: 'blocked' },
    select: { id: true, stage: true },
  })
  for (const item of blockedVideos) {
    const check = await preflight('video', item.stage)
    if (check.canRun) {
      await db.pipelineItem.update({
        where: { id: item.id },
        data: { status: 'queued', error: null },
      })
    }
  }
  if (blockedVideos.length) {
    const stillBlocked = await db.pipelineItem.count({ where: { status: 'blocked' } })
    const unblocked = blockedVideos.length - stillBlocked
    if (unblocked > 0) {
      logger.info({ unblocked, stillBlocked }, '[preflight] video items unblocked')
    }
  }

  // Article pipeline
  const blockedArticles = await db.article.findMany({
    where: { status: 'blocked' },
    select: { id: true, stage: true },
  })
  for (const item of blockedArticles) {
    const check = await preflight('article', item.stage)
    if (check.canRun) {
      await db.article.update({
        where: { id: item.id },
        data: { status: 'queued', error: null },
      })
      articleEvents.emit(`article:${item.id}`, { stage: item.stage, status: 'queued' })
    }
  }
  if (blockedArticles.length) {
    const stillBlocked = await db.article.count({ where: { status: 'blocked' } })
    const unblocked = blockedArticles.length - stillBlocked
    if (unblocked > 0) {
      logger.info({ unblocked, stillBlocked }, '[preflight] article items unblocked')
    }
  }
}

module.exports = {
  VIDEO_STAGE_DEPS,
  ARTICLE_STAGE_DEPS,
  RESCORE_DEPS,
  preflight,
  blockDependents,
  unblockReady,
}
