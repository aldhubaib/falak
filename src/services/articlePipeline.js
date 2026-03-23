/**
 * Brain v3 — Article Pipeline: SOURCE → SEARCH → FETCH
 *
 * SOURCE: API selection, key status, language, budget
 * SEARCH: Per-API native params + keyword gate + dedup rules
 * FETCH:  Execute fetch, apply gates, dedup, save, audit log
 */
const db = require('../lib/db')
const logger = require('../lib/logger')
const { getApifyToken, listSuccessfulRuns, fetchLatestSuccessfulRunWithItems, fetchDatasetItemsByDatasetId } = require('./apify')

const VALID_SOURCE_TYPES = ['rss', 'apify_actor', 'youtube_channel']

const MAX_FETCH_LOG_ENTRIES = 30

// ── Config validation per source type ─────────────────────────────────────

function validateSourceConfig(type, config) {
  if (!config || typeof config !== 'object') return 'config must be a JSON object'
  switch (type) {
    case 'rss':
      if (!config.url || typeof config.url !== 'string') return 'rss requires config.url (valid URL)'
      try { new URL(config.url) } catch { return 'rss config.url must be a valid URL' }
      break
    case 'apify_actor':
      if (!config.actorId || typeof config.actorId !== 'string') return 'apify_actor requires config.actorId (string)'
      if (config.datasetId !== undefined && config.datasetId !== null && typeof config.datasetId !== 'string') {
        return 'apify_actor config.datasetId must be a string when provided'
      }
      if (config.limit !== undefined && config.limit !== null && config.limit !== 0 && (!Number.isInteger(config.limit) || config.limit < 1 || config.limit > 50000)) {
        return 'apify_actor config.limit must be 0 (all) or an integer between 1 and 50000'
      }
      break
    case 'youtube_channel': {
      const hasChannel = config.youtubeChannelId || config.handle || config.channelUrl
      if (!hasChannel) return 'youtube_channel requires config.youtubeChannelId, config.handle, or config.channelUrl'
      break
    }
    default:
      return `Unknown source type: ${type}`
  }
  return null
}

function hasApiKey(project, sourceType, source = null) {
  if (sourceType === 'apify_actor') return !!getApifyToken(source)
  if (sourceType === 'youtube_channel') return true
  return sourceType === 'rss'
}

function canonicalizeArticleUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return null
  try {
    const url = new URL(rawUrl)
    url.hash = ''

    for (const key of [...url.searchParams.keys()]) {
      const lower = key.toLowerCase()
      if (lower.startsWith('utm_') || ['fbclid', 'gclid', 'igshid'].includes(lower)) {
        url.searchParams.delete(key)
      }
    }

    url.hostname = url.hostname.toLowerCase()
    if (url.pathname.length > 1) {
      url.pathname = url.pathname.replace(/\/+$/, '')
    }
    const search = url.searchParams.toString()
    return `${url.origin}${url.pathname}${search ? `?${search}` : ''}`
  } catch {
    return rawUrl.trim() || null
  }
}

// ── String sanitisation (strips chars that break Prisma/Postgres) ─────────

function sanitizeString(val) {
  if (typeof val !== 'string') return val
  return val
    .replace(/\0/g, '')
    .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/[\u0080-\u009F]/g, '')
    .replace(/[\uD800-\uDFFF]/g, '')
    .replace(/\\x/g, 'x')
    .replace(/\\u/g, 'u')
}

// ── Fetch articles from a single source ───────────────────────────────────

async function fetchFromSource(source, apiKey) {
  const { type, config } = source
  switch (type) {
    case 'rss':
      return fetchRSS(config.url)
    default:
      throw new Error(`Unknown source type: ${type}`)
  }
}

async function fetchFromApifySource(source, apiKey) {
  const { config } = source

  if (config.datasetId) {
    const result = await fetchDatasetItemsByDatasetId(config.datasetId, apiKey, config.limit || 0, source.language || 'en')
    return { ...result, latestRun: null }
  }

  const latestRun = await fetchLatestSuccessfulRunWithItems(config.actorId, apiKey)
  if (!latestRun) {
    return { articles: [], rawCount: 0, latestRun: null }
  }
  if (!latestRun.datasetId) {
    throw new Error('Latest successful Apify run is missing a dataset ID')
  }

  const result = await fetchDatasetItemsByDatasetId(latestRun.datasetId, apiKey, config.limit || 0, source.language || 'en')
  return { ...result, latestRun }
}

// ── RSS fetch ─────────────────────────────────────────────────────────────

async function fetchRSS(url) {
  const nodeFetch = require('node-fetch')
  const { isSafeUrl } = require('./articleFetcher')
  if (!await isSafeUrl(url)) {
    throw new Error('RSS URL resolves to a private or reserved address')
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15000)
  try {
    const res = await nodeFetch(url, { signal: controller.signal })
    clearTimeout(timer)
    const xml = await res.text()
    const articles = parseRSSXml(xml)
    logger.info({ provider: 'rss', url: url.slice(0, 80), results: articles.length }, '[articlePipeline] RSS fetched')
    return { articles }
  } catch (e) {
    clearTimeout(timer)
    logger.error({ provider: 'rss', url: url.slice(0, 80), error: e.message }, '[articlePipeline] RSS failed')
    throw e
  }
}

function parseRSSXml(xml) {
  const items = []
  const itemRegex = /<item[\s>]([\s\S]*?)<\/item>/gi
  let match
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1]
    const get = (tag) => {
      const m = block.match(new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?(.*?)(?:\\]\\]>)?<\\/${tag}>`, 's'))
      return m ? m[1].trim() : ''
    }
    const url = get('link')
    if (!url) continue
    items.push({
      url,
      title: get('title'),
      description: get('description').replace(/<[^>]+>/g, '').slice(0, 500),
      content: get('description').replace(/<[^>]+>/g, '').slice(0, 3000),
      source: 'RSS',
      publishedAt: get('pubDate') || null,
    })
  }
  return items
}

// ── Keyword gate ──────────────────────────────────────────────────────────

function applyKeywordGate(articles, search) {
  if (!search) return { passed: articles, gated: [] }

  const include = (search.includeKeywords || []).map(k => k.toLowerCase()).filter(Boolean)
  const exclude = (search.excludeKeywords || []).map(k => k.toLowerCase()).filter(Boolean)
  const blockDomains = (search.blockDomains || []).map(d => d.toLowerCase()).filter(Boolean)
  const minTitleLen = search.minTitleLength || 0

  const passed = []
  const gated = []

  for (const a of articles) {
    const text = `${a.title || ''} ${a.description || ''}`.toLowerCase()
    const urlLower = (a.url || '').toLowerCase()

    if (minTitleLen > 0 && (a.title || '').length < minTitleLen) {
      gated.push({ ...a, _gateReason: 'title_too_short' })
      continue
    }

    if (blockDomains.length > 0) {
      const blocked = blockDomains.some(d => urlLower.includes(d))
      if (blocked) {
        gated.push({ ...a, _gateReason: 'blocked_domain' })
        continue
      }
    }

    if (exclude.length > 0) {
      const hit = exclude.find(kw => text.includes(kw))
      if (hit) {
        gated.push({ ...a, _gateReason: `exclude:${hit}` })
        continue
      }
    }

    if (include.length > 0) {
      const hasMatch = include.some(kw => text.includes(kw))
      if (!hasMatch) {
        gated.push({ ...a, _gateReason: 'no_include_match' })
        continue
      }
    }

    passed.push(a)
  }

  return { passed, gated }
}

// ── Budget check ──────────────────────────────────────────────────────────

function checkBudget(source) {
  const budget = source.config?.source || {}
  const maxPerDay = budget.maxPerDay || 0
  if (!maxPerDay) return { allowed: true, usedToday: 0, maxPerDay: 0 }

  const log = Array.isArray(source.fetchLog) ? source.fetchLog : []
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const usedToday = log.filter(entry => new Date(entry.time) >= todayStart).length
  return { allowed: usedToday < maxPerDay, usedToday, maxPerDay }
}

function checkCooldown(source) {
  const cooldownMinutes = source.config?.source?.cooldownMinutes || 0
  if (!cooldownMinutes || !source.lastPolledAt) return { allowed: true, minutesSince: null }

  const msSince = Date.now() - new Date(source.lastPolledAt).getTime()
  const minutesSince = Math.floor(msSince / 60000)
  return { allowed: minutesSince >= cooldownMinutes, minutesSince }
}

// ── FETCH: run for a single source ────────────────────────────────────────

async function ingestSource(source, project, { force = false } = {}) {
  if (source.type === 'apify_actor') {
    return ingestApifySourceWithRunTracking(source, project, { force })
  }
  return ingestNonApifySource(source, project, { force })
}

async function ingestNonApifySource(source, project, { force = false } = {}) {
  const sourceId = source.id
  const channelId = source.channelId
  const startTime = Date.now()

  if (!force) {
    const budget = checkBudget(source)
    if (!budget.allowed) {
      return { sourceId, fetched: 0, gated: 0, dupes: 0, inserted: 0, error: `Daily limit reached (${budget.usedToday}/${budget.maxPerDay})` }
    }
    const cooldown = checkCooldown(source)
    if (!cooldown.allowed) {
      return { sourceId, fetched: 0, gated: 0, dupes: 0, inserted: 0, error: `Cooldown active (${cooldown.minutesSince}min since last, need ${source.config?.source?.cooldownMinutes}min)` }
    }
  }

  let rawArticles
  try {
    const result = await fetchFromSource(source, null)
    rawArticles = result.articles || []
  } catch (e) {
    if (e.isServiceError && !e.retryable) throw e
    const logEntry = { time: new Date().toISOString(), raw: 0, gated: 0, dupes: 0, inserted: 0, error: e.message, ms: Date.now() - startTime }
    await appendFetchLog(sourceId, logEntry)
    logger.error({ sourceId, type: source.type, error: e.message }, '[articlePipeline] fetch failed')
    return { sourceId, fetched: 0, gated: 0, dupes: 0, inserted: 0, error: e.message }
  }

  const searchConfig = source.config?.search || null
  const { passed, gated } = applyKeywordGate(rawArticles, searchConfig)
  const { inserted, dupes } = await insertArticles(channelId, sourceId, source, passed)

  const logEntry = { time: new Date().toISOString(), raw: rawArticles.length, gated: gated.length, dupes, inserted, error: null, ms: Date.now() - startTime }
  await appendFetchLog(sourceId, logEntry)
  await db.articleSource.update({ where: { id: sourceId }, data: { lastPolledAt: new Date() } })

  logger.info({ sourceId, type: source.type, label: source.label, ...logEntry }, '[articlePipeline] fetch complete')
  return { sourceId, fetched: rawArticles.length, gated: gated.length, dupes, inserted, error: null }
}

async function ingestApifySourceDirectDataset(source, channel, apiKey, { force = false } = {}) {
  const sourceId = source.id
  const channelId = source.channelId
  const startTime = Date.now()

  if (!force) {
    const budget = checkBudget(source)
    if (!budget.allowed) {
      return { sourceId, fetched: 0, gated: 0, dupes: 0, inserted: 0, error: `Daily limit reached (${budget.usedToday}/${budget.maxPerDay})` }
    }
    const cooldown = checkCooldown(source)
    if (!cooldown.allowed) {
      return { sourceId, fetched: 0, gated: 0, dupes: 0, inserted: 0, error: `Cooldown active (${cooldown.minutesSince}min since last, need ${source.config?.source?.cooldownMinutes}min)` }
    }
  }

  let rawArticles
  try {
    const result = await fetchDatasetItemsByDatasetId(
      source.config.datasetId,
      apiKey,
      source.config.limit || 0,
      source.language || 'en'
    )
    rawArticles = result.articles || []
  } catch (e) {
    if (e.isServiceError && !e.retryable) throw e
    const logEntry = { time: new Date().toISOString(), raw: 0, gated: 0, dupes: 0, inserted: 0, error: e.message, ms: Date.now() - startTime }
    await appendFetchLog(sourceId, logEntry)
    logger.error({ sourceId, error: e.message }, '[articlePipeline] Apify dataset fetch failed')
    return { sourceId, fetched: 0, gated: 0, dupes: 0, inserted: 0, error: e.message }
  }

  const searchConfig = source.config?.search || null
  const { passed, gated } = applyKeywordGate(rawArticles, searchConfig)
  const { inserted, dupes } = await insertArticles(channelId, sourceId, source, passed)

  const logEntry = { time: new Date().toISOString(), raw: rawArticles.length, gated: gated.length, dupes, inserted, error: null, ms: Date.now() - startTime }
  await appendFetchLog(sourceId, logEntry)
  await db.articleSource.update({ where: { id: sourceId }, data: { lastPolledAt: new Date() } })

  logger.info({ sourceId, type: source.type, label: source.label, ...logEntry }, '[articlePipeline] fetch complete')
  return { sourceId, fetched: rawArticles.length, gated: gated.length, dupes, inserted, error: null }
}

/**
 * Apify sources: track runs in DB, import only missing runs (oldest first).
 */
async function ingestApifySourceWithRunTracking(source, channel, { force = false } = {}) {
  const sourceId = source.id
  const channelId = source.channelId
  const startTime = Date.now()

  if (!force) {
    const budget = checkBudget(source)
    if (!budget.allowed) {
      return { sourceId, fetched: 0, gated: 0, dupes: 0, inserted: 0, error: `Daily limit reached (${budget.usedToday}/${budget.maxPerDay})` }
    }
    const cooldown = checkCooldown(source)
    if (!cooldown.allowed) {
      return { sourceId, fetched: 0, gated: 0, dupes: 0, inserted: 0, error: `Cooldown active (${cooldown.minutesSince}min since last, need ${source.config?.source?.cooldownMinutes}min)` }
    }
  }

  const apiKey = getApifyToken(source)
  if (!apiKey) {
    return { sourceId, fetched: 0, gated: 0, dupes: 0, inserted: 0, error: 'No Apify API key configured for this source' }
  }

  const { config } = source
  if (config.datasetId) {
    return ingestApifySourceDirectDataset(source, project, apiKey, { force })
  }

  let apifyRuns
  try {
    apifyRuns = await listSuccessfulRuns(config.actorId, apiKey, 20)
  } catch (e) {
    if (e.isServiceError && !e.retryable) throw e
    const logEntry = { time: new Date().toISOString(), raw: 0, gated: 0, dupes: 0, inserted: 0, error: e.message, ms: Date.now() - startTime }
    await appendFetchLog(sourceId, logEntry)
    logger.error({ sourceId, error: e.message }, '[articlePipeline] Apify list runs failed')
    return { sourceId, fetched: 0, gated: 0, dupes: 0, inserted: 0, error: e.message }
  }

  const tracked = await db.apifyRun.findMany({
    where: { sourceId },
    select: { runId: true },
  })
  const trackedIds = new Set(tracked.map((r) => r.runId))
  const missingRuns = apifyRuns.filter((r) => !trackedIds.has(r.id))
  if (missingRuns.length === 0) {
    const logEntry = { time: new Date().toISOString(), raw: 0, gated: 0, dupes: 0, inserted: 0, error: null, ms: Date.now() - startTime, skipped: 'no_new_run' }
    await appendFetchLog(sourceId, logEntry)
    await db.articleSource.update({ where: { id: sourceId }, data: { lastPolledAt: new Date() } })
    return { sourceId, fetched: 0, gated: 0, dupes: 0, inserted: 0, error: null, skipped: 'no_new_run' }
  }

  const limit = config.limit || 0
  const searchConfig = config?.search || null
  const sortedMissing = [...missingRuns].sort((a, b) => {
    const ta = a.startedAt ? new Date(a.startedAt).getTime() : 0
    const tb = b.startedAt ? new Date(b.startedAt).getTime() : 0
    return ta - tb
  })

  let totalRaw = 0
  let totalGated = 0
  let totalInserted = 0
  let totalDupes = 0
  let lastImportedRunId = source.lastImportedRunId

  const pendingRunRecords = []

  for (const run of sortedMissing) {
    if (!run.datasetId) {
      pendingRunRecords.push({
        sourceId,
        runId: run.id,
        datasetId: null,
        startedAt: run.startedAt ? new Date(run.startedAt) : null,
        finishedAt: run.finishedAt ? new Date(run.finishedAt) : null,
        itemCount: 0,
        status: 'skipped_empty',
      })
      continue
    }

    let result
    try {
      result = await fetchDatasetItemsByDatasetId(run.datasetId, apiKey, limit, source.language || 'en')
    } catch (e) {
      if (e.isServiceError && !e.retryable) throw e
      pendingRunRecords.push({
        sourceId,
        runId: run.id,
        datasetId: run.datasetId,
        startedAt: run.startedAt ? new Date(run.startedAt) : null,
        finishedAt: run.finishedAt ? new Date(run.finishedAt) : null,
        itemCount: null,
        status: 'failed',
      })
      logger.error({ sourceId, runId: run.id, error: e.message }, '[articlePipeline] Apify dataset fetch failed')
      continue
    }

    const { articles: rawArticles, rawCount } = result
    const { passed, gated } = applyKeywordGate(rawArticles, searchConfig)
    const { inserted, dupes } = await insertArticles(channelId, sourceId, source, passed)

    totalRaw += rawArticles.length
    totalGated += gated.length
    totalInserted += inserted
    totalDupes += dupes

    lastImportedRunId = run.id
    pendingRunRecords.push({
      sourceId,
      runId: run.id,
      datasetId: run.datasetId,
      startedAt: run.startedAt ? new Date(run.startedAt) : null,
      finishedAt: run.finishedAt ? new Date(run.finishedAt) : null,
      itemCount: rawCount,
      status: 'imported',
      importedAt: new Date(),
    })
  }

  if (pendingRunRecords.length > 0) {
    await db.apifyRun.createMany({ data: pendingRunRecords })
  }

  const logEntry = {
    time: new Date().toISOString(),
    raw: totalRaw,
    gated: totalGated,
    dupes: totalDupes,
    inserted: totalInserted,
    error: null,
    ms: Date.now() - startTime,
    runsProcessed: sortedMissing.length,
  }
  await appendFetchLog(sourceId, logEntry)
  await db.articleSource.update({
    where: { id: sourceId },
    data: {
      lastPolledAt: new Date(),
      ...(lastImportedRunId ? { lastImportedRunId } : {}),
    },
  })

  logger.info({ sourceId, type: source.type, label: source.label, ...logEntry }, '[articlePipeline] fetch complete')
  return { sourceId, fetched: totalRaw, gated: totalGated, dupes: totalDupes, inserted: totalInserted, error: null }
}

async function insertArticles(channelId, sourceId, source, passed) {
  const seenInBatch = new Set()
  const toInsert = []
  let dupes = 0
  for (const raw of passed) {
    const canonicalUrl = canonicalizeArticleUrl(raw.url)
    if (!canonicalUrl) { dupes++; continue }
    if (seenInBatch.has(canonicalUrl)) { dupes++; continue }
    seenInBatch.add(canonicalUrl)
    toInsert.push({
      channelId,
      sourceId,
      url: canonicalUrl,
      title: sanitizeString(raw.title) || null,
      description: sanitizeString(raw.description) || null,
      content: sanitizeString(raw.content) || null,
      publishedAt: raw.publishedAt ? new Date(raw.publishedAt) : null,
      language: raw.language || source.language || 'en',
      category: sanitizeString(raw.category) || null,
      tags: raw.tags && raw.tags.length > 0 ? raw.tags.map(sanitizeString) : undefined,
      featuredImage: raw.featuredImage || null,
      images: raw.images && raw.images.length > 0 ? raw.images : undefined,
      stage: 'imported',
      status: 'queued',
    })
  }
  if (toInsert.length === 0) return { inserted: 0, dupes }
  const { count } = await db.article.createMany({ data: toInsert, skipDuplicates: true })
  return { inserted: count, dupes: dupes + (toInsert.length - count) }
}

async function appendFetchLog(sourceId, entry) {
  const source = await db.articleSource.findUnique({ where: { id: sourceId }, select: { fetchLog: true } })
  const log = Array.isArray(source?.fetchLog) ? [...source.fetchLog] : []
  log.unshift(entry)
  if (log.length > MAX_FETCH_LOG_ENTRIES) log.length = MAX_FETCH_LOG_ENTRIES
  await db.articleSource.update({ where: { id: sourceId }, data: { fetchLog: log } })
}

// ── YouTube channel ingestion ─────────────────────────────────────────────

async function ingestYouTubeSource(source) {
  const sourceId = source.id
  const channelId = source.channelId
  const startTime = Date.now()

  const { fetchRecentVideos, fetchChannel } = require('./youtube')
  const youtubeChannelId = source.config.youtubeChannelId
  if (!youtubeChannelId) {
    return { sourceId, fetched: 0, inserted: 0, dupes: 0, error: 'No youtubeChannelId in config' }
  }

  // Build a set of video IDs we already have so we can stop early
  const existingArticles = await db.article.findMany({
    where: { sourceId },
    select: { url: true },
  })
  const knownVideoIds = new Set(
    existingArticles
      .map(a => { const m = a.url.match(/[?&]v=([^&]+)/); return m ? m[1] : null })
      .filter(Boolean)
  )

  let videos
  try {
    videos = await fetchRecentVideos(youtubeChannelId, 500, channelId, knownVideoIds)
  } catch (e) {
    if (e.isServiceError && !e.retryable) throw e
    const logEntry = { time: new Date().toISOString(), raw: 0, gated: 0, dupes: 0, inserted: 0, error: e.message, ms: Date.now() - startTime }
    await appendFetchLog(sourceId, logEntry)
    logger.error({ sourceId, error: e.message }, '[articlePipeline] YouTube fetch failed')
    return { sourceId, fetched: 0, inserted: 0, dupes: 0, error: e.message }
  }

  if (!videos || videos.length === 0) {
    const logEntry = { time: new Date().toISOString(), raw: 0, gated: 0, dupes: 0, inserted: 0, error: null, ms: Date.now() - startTime }
    await appendFetchLog(sourceId, logEntry)
    await db.articleSource.update({ where: { id: sourceId }, data: { lastPolledAt: new Date() } })
    return { sourceId, fetched: 0, inserted: 0, dupes: 0, error: null }
  }

  const toInsert = videos
    .filter(v => v.videoType !== 'short')
    .map(v => ({
      channelId,
      sourceId,
      url: `https://www.youtube.com/watch?v=${v.youtubeId}`,
      title: sanitizeString(v.titleAr || v.titleEn) || null,
      description: sanitizeString((v.description || '').slice(0, 500)) || null,
      publishedAt: v.publishedAt || null,
      language: null,
      stage: 'transcript',
      status: 'queued',
    }))

  let inserted = 0
  let dupes = 0
  if (toInsert.length > 0) {
    const result = await db.article.createMany({ data: toInsert, skipDuplicates: true })
    inserted = result.count
    dupes = toInsert.length - result.count
  }

  const latestVideo = videos.find(v => v.videoType !== 'short')
  const configUpdate = { ...source.config }
  if (latestVideo?.publishedAt) {
    configUpdate.lastVideoFoundAt = latestVideo.publishedAt.toISOString()
  }

  const logEntry = {
    time: new Date().toISOString(),
    raw: toInsert.length,
    gated: 0,
    dupes,
    inserted,
    error: null,
    ms: Date.now() - startTime,
  }
  await appendFetchLog(sourceId, logEntry)
  await db.articleSource.update({
    where: { id: sourceId },
    data: { lastPolledAt: new Date(), config: configUpdate },
  })

  if (inserted > 0) {
    logger.info({ sourceId, label: source.label, fetched: toInsert.length, inserted }, '[articlePipeline] YouTube ingested')
  }
  return { sourceId, fetched: toInsert.length, inserted, dupes, error: null }
}

// ── Cadence computation ──────────────────────────────────────────────────

const DAY_MS = 86400000

function computeCheckInterval(source) {
  switch (source.type) {
    case 'rss':
      return 30 * 60 * 1000
    case 'apify_actor':
      return 5 * 60 * 1000
    case 'youtube_channel':
      return computeYouTubeCadence(source)
    default:
      return 5 * 60 * 1000
  }
}

function computeYouTubeCadence(source) {
  const lastVideoAt = source.config?.lastVideoFoundAt
    ? new Date(source.config.lastVideoFoundAt)
    : null
  if (!lastVideoAt) return 2 * DAY_MS
  const daysSince = (Date.now() - lastVideoAt.getTime()) / DAY_MS
  if (daysSince < 3)  return 2  * DAY_MS
  if (daysSince < 14) return 5  * DAY_MS
  if (daysSince < 30) return 10 * DAY_MS
  return 20 * DAY_MS
}

function deriveYouTubeStatus(source) {
  const lastVideoAt = source.config?.lastVideoFoundAt
    ? new Date(source.config.lastVideoFoundAt)
    : null
  if (!lastVideoAt) return 'active'
  const daysSince = (Date.now() - lastVideoAt.getTime()) / DAY_MS
  if (daysSince < 3)  return 'active'
  if (daysSince < 14) return 'regular'
  if (daysSince < 30) return 'slow'
  return 'inactive'
}

// ── INGEST ALL: run for all active sources in a channel ───────────────────

async function hasNicheEmbedding(channelId) {
  const profile = await db.scoreProfile.findUnique({
    where: { channelId },
    select: { nicheEmbeddingGeneratedAt: true },
  })
  return !!profile?.nicheEmbeddingGeneratedAt
}

async function ingestAll(channelId, { force = false, sourceId = null } = {}) {
  const channel = await db.channel.findUnique({
    where: { id: channelId },
    select: { id: true, type: true },
  })
  if (!channel) throw new Error('Channel not found')

  if (channel.type === 'ours') {
    const hasDna = await hasNicheEmbedding(channelId)
    if (!hasDna) {
      throw new Error('Content DNA embedding not generated. Go to Channel Settings → Content DNA and click "Generate Embedding" before running the pipeline.')
    }
  }

  const where = { channelId, isActive: true, type: { in: VALID_SOURCE_TYPES } }
  if (sourceId) where.id = sourceId
  const sources = await db.articleSource.findMany({ where })

  const results = []
  for (const source of sources) {
    if (!force && source.nextCheckAt && new Date(source.nextCheckAt) > new Date()) {
      continue
    }

    let result
    if (source.type === 'youtube_channel') {
      result = await ingestYouTubeSource(source)
    } else {
      result = await ingestSource(source, channel)
    }
    results.push({ ...result, label: source.label, type: source.type })

    const interval = computeCheckInterval(source)
    await db.articleSource.update({
      where: { id: source.id },
      data: { nextCheckAt: new Date(Date.now() + interval) },
    })
  }

  return results
}

// ── Test fetch: dry-run for a source config (no DB save) ──────────────────

async function testSourceFetch(sourceType, config, project, source = null) {
  let apiKey = null
  if (sourceType === 'apify_actor') {
    apiKey = getApifyToken(source)
    if (!apiKey) throw new Error('No Apify API key configured for this source')
  }

  const fakeSource = { type: sourceType, config, language: 'en' }
  const result = sourceType === 'apify_actor'
    ? await fetchFromApifySource(fakeSource, apiKey)
    : await fetchFromSource(fakeSource, apiKey)
  const raw = (result.articles || []).slice(0, 10)

  const searchConfig = config?.search || null
  const { passed, gated } = applyKeywordGate(raw, searchConfig)

  return [...passed, ...gated].slice(0, 10)
}

module.exports = {
  VALID_SOURCE_TYPES,
  validateConfig: validateSourceConfig,
  hasApiKey,
  hasNicheEmbedding,
  canonicalizeArticleUrl,
  sanitizeString,
  ingestSource,
  ingestYouTubeSource,
  ingestAll,
  testSourceFetch,
  applyKeywordGate,
  checkBudget,
  checkCooldown,
  computeCheckInterval,
  computeYouTubeCadence,
  deriveYouTubeStatus,
}
