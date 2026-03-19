/**
 * Rescore worker: periodically refreshes competition/own stats and re-evaluates story scores.
 *
 * Runs in-process alongside worker.js (video pipeline) and worker-articles.js (article pipeline).
 * Checks every hour whether each active project's rescore interval has elapsed.
 *
 * Full cycle per project:
 *   1. Refresh competition channel + video stats from YouTube
 *   2. Fetch own published video stats from YouTube
 *   3. Learn from user decisions + YouTube outcomes (self-learning)
 *   4. Re-score all active stories with updated data + learned profile
 */
try { require('dotenv').config() } catch (_) {}
const db = require('./lib/db')
const logger = require('./lib/logger')
const { refreshCompetitionData, fetchOwnVideoStats } = require('./services/statsRefresher')
const { learnFromDecisions, learnFromOutcomes } = require('./services/scoreLearner')
const { rescoreActiveStories } = require('./services/rescorer')

const CHECK_INTERVAL_MS = 60 * 60 * 1000 // check every 1 hour
const DEFAULT_RESCORE_HOURS = 24

let paused = false
function isPaused() { return paused }
function setPaused(v) { paused = !!v }

function shouldRescore(channel) {
  const intervalMs = (channel.rescoreIntervalHours || DEFAULT_RESCORE_HOURS) * 60 * 60 * 1000
  const lastRefresh = channel.lastStatsRefreshAt
  if (!lastRefresh) return true
  return Date.now() - new Date(lastRefresh).getTime() > intervalMs
}

async function runCycleForChannel(channelId) {
  const startTime = Date.now()
  logger.info({ channelId }, '[rescore-worker] starting cycle')

  // Step 1: Refresh competition data
  let refreshResult = { channelsRefreshed: 0, videosUpdated: 0 }
  try {
    refreshResult = await refreshCompetitionData(channelId)
  } catch (e) {
    logger.error({ channelId, error: e.message }, '[rescore-worker] competition refresh failed')
  }

  // Step 2: Fetch own video stats
  let ownResult = { ownVideosUpdated: 0 }
  try {
    ownResult = await fetchOwnVideoStats(channelId)
  } catch (e) {
    logger.error({ channelId, error: e.message }, '[rescore-worker] own video stats failed')
  }

  // Step 3: Self-learning
  let learnResult = {}
  try {
    const decisions = await learnFromDecisions(channelId)
    const outcomes = await learnFromOutcomes(channelId)
    learnResult = { decisions, outcomes }
  } catch (e) {
    logger.error({ channelId, error: e.message }, '[rescore-worker] learning failed')
  }

  // Step 4: Re-score active stories
  let rescoreResult = { evaluated: 0, changed: 0, alerts: 0 }
  try {
    rescoreResult = await rescoreActiveStories(channelId)
  } catch (e) {
    logger.error({ channelId, error: e.message }, '[rescore-worker] rescore failed')
  }

  const elapsed = Date.now() - startTime
  logger.info({
    channelId,
    elapsed,
    ...refreshResult,
    ...ownResult,
    ...rescoreResult,
  }, '[rescore-worker] cycle complete')

  return { ...refreshResult, ...ownResult, ...rescoreResult, learnResult, elapsed }
}

async function tick() {
  if (paused) return

  try {
    const channels = await db.channel.findMany({
      where: { type: 'ours', status: 'active', parentChannelId: null },
      select: { id: true, lastStatsRefreshAt: true, rescoreIntervalHours: true },
    })

    for (const channel of channels) {
      if (shouldRescore(channel)) {
        try {
          await runCycleForChannel(channel.id)
        } catch (e) {
          logger.error({ channelId: channel.id, error: e.message }, '[rescore-worker] channel cycle failed')
        }
      }
    }
  } catch (e) {
    logger.error({ error: e.message }, '[rescore-worker] tick error')
  }
}

async function runPollingWorker() {
  logger.info({ checkIntervalMs: CHECK_INTERVAL_MS }, '[rescore-worker] started (polling)')
  for (;;) {
    try {
      await tick()
    } catch (e) {
      logger.error({ error: e.message }, '[rescore-worker] tick error')
    }
    await new Promise(r => setTimeout(r, CHECK_INTERVAL_MS))
  }
}

module.exports = { tick, runPollingWorker, runCycleForChannel, isPaused, setPaused }
