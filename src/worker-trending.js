/**
 * Trending worker: periodically fetches YouTube trending videos for configured
 * countries and stores snapshots for historical analysis.
 *
 * Runs in-process alongside other workers. Default interval: 6 hours.
 * Countries default to ['SA'] — extend via TRENDING_COUNTRIES env var (comma-separated).
 */
try { require('dotenv').config() } catch (_) {}
const db = require('./lib/db')
const logger = require('./lib/logger')

const INTERVAL_MS = 6 * 60 * 60 * 1000 // 6 hours
const DEFAULT_COUNTRIES = ['SA', 'AE', 'KW', 'EG']

function getCountries() {
  const env = process.env.TRENDING_COUNTRIES
  if (env) return env.split(',').map(c => c.trim().toUpperCase()).filter(Boolean)
  return DEFAULT_COUNTRIES
}

async function fetchAndStore(country) {
  const { fetchTrending } = require('./services/youtube')
  const items = await fetchTrending(country, 50)
  if (!items.length) {
    logger.warn({ country }, '[trending-worker] no items returned')
    return { country, stored: 0 }
  }

  const snapshot = await db.trendingSnapshot.create({
    data: {
      country,
      totalVideos: items.length,
      entries: {
        create: items.map((item, i) => ({
          rank: i + 1,
          youtubeVideoId: item.youtubeVideoId,
          title: item.title,
          channelName: item.channelName,
          channelId: item.channelId,
          categoryId: item.categoryId,
          categoryName: item.categoryName,
          viewCount: item.viewCount,
          likeCount: item.likeCount,
          commentCount: item.commentCount,
          duration: item.duration,
          publishedAt: item.publishedAt,
          thumbnailUrl: item.thumbnailUrl,
        })),
      },
    },
  })
  logger.info({ country, snapshotId: snapshot.id, videos: items.length }, '[trending-worker] snapshot saved')
  return { country, stored: items.length }
}

const RETENTION_DAYS = 90

async function cleanupOldSnapshots() {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000)
  try {
    const result = await db.trendingSnapshot.deleteMany({
      where: { fetchedAt: { lt: cutoff } },
    })
    if (result.count > 0) {
      logger.info({ deleted: result.count }, '[trending-worker] old snapshots cleaned')
    }
  } catch (e) {
    logger.warn({ error: e.message }, '[trending-worker] cleanup failed')
  }
}

async function tick() {
  const countries = getCountries()
  logger.info({ countries }, '[trending-worker] starting fetch cycle')

  for (const country of countries) {
    try {
      await fetchAndStore(country)
    } catch (e) {
      logger.error({ country, error: e.message }, '[trending-worker] fetch failed')
    }
  }

  await cleanupOldSnapshots()
}

async function runPollingWorker() {
  logger.info({ intervalMs: INTERVAL_MS, countries: getCountries() }, '[trending-worker] started (polling)')
  // Run immediately on startup, then on interval
  try { await tick() } catch (e) { logger.error({ error: e.message }, '[trending-worker] initial tick error') }
  setInterval(async () => {
    try { await tick() } catch (e) { logger.error({ error: e.message }, '[trending-worker] tick error') }
  }, INTERVAL_MS)
}

module.exports = { tick, runPollingWorker, fetchAndStore }
