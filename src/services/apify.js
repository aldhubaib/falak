const fetch = require('node-fetch')
const logger = require('../lib/logger')
const { decrypt } = require('./crypto')

const APIFY_API_BASE = 'https://api.apify.com/v2'
const PAGE_SIZE = 1000
const FETCH_TIMEOUT_MS = 60_000

function fetchWithTimeout(url, opts = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  return fetch(url, { ...opts, signal: controller.signal }).finally(() => clearTimeout(timer))
}

function getApifyToken(source) {
  const encrypted = source?.apiKeyEncrypted
  if (!encrypted) return null
  try {
    return decrypt(encrypted)
  } catch (error) {
    logger.error({ error: error.message }, '[apify] failed to decrypt token')
    return null
  }
}

function normalizeText(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function firstString(...values) {
  for (const value of values) {
    const text = normalizeText(value)
    if (text) return text
  }
  return null
}

function normalizeApifyItem(item, defaultLanguage = 'en') {
  if (!item || typeof item !== 'object') return null
  const url = firstString(item?.url, item?.link, item?.articleUrl, item?.pageUrl, item?.href)
  if (!url) return null

  return {
    url,
    title: firstString(item?.title, item?.headline),
    description: firstString(item?.description, item?.summary, item?.excerpt),
    content: firstString(item?.content, item?.text, item?.body, item?.articleBody, item?.description, item?.summary),
    tags: Array.isArray(item?.tags) ? item.tags.filter(Boolean) : (typeof item?.tags === 'string' ? [item.tags] : []),
    category: firstString(item?.category),
    publishedAt: firstString(item?.publishedAt, item?.date, item?.pubDate, item?.published_at),
    language: firstString(item?.language, defaultLanguage),
    author: firstString(item?.author, item?.authorName),
    imageUrl: firstString(item?.imageUrl, item?.image, item?.thumbnailUrl),
    externalId: firstString(item?.externalId, item?.id),
    rawPayload: item,
  }
}

function normalizeActorId(actorId) {
  const text = normalizeText(actorId)
  if (!text) return null
  if (text.includes('~')) return text
  const firstSlash = text.indexOf('/')
  if (firstSlash === -1) return text
  return `${text.slice(0, firstSlash)}~${text.slice(firstSlash + 1)}`
}

function buildLatestRunUrl(actorId, token) {
  const normalizedActorId = normalizeActorId(actorId)
  return `${APIFY_API_BASE}/acts/${encodeURIComponent(normalizedActorId)}/runs/last?status=SUCCEEDED&token=${encodeURIComponent(token)}`
}

function buildActorRunsListUrl(actorId, token, limit = 10) {
  const normalizedActorId = normalizeActorId(actorId)
  const params = new URLSearchParams({
    status: 'SUCCEEDED',
    limit: String(limit),
    desc: '1',
    token,
  })
  return `${APIFY_API_BASE}/acts/${encodeURIComponent(normalizedActorId)}/runs?${params.toString()}`
}

async function listSuccessfulRuns(actorId, token, limit = 10) {
  const normalizedActorId = normalizeActorId(actorId)
  if (!normalizedActorId) return []
  const url = buildActorRunsListUrl(normalizedActorId, token, limit)
  const response = await fetchWithTimeout(url, { headers: { Accept: 'application/json' } })
  if (!response.ok) return []
  const payload = await response.json()
  const items = payload?.data?.items || []
  return items.map((run) => ({
    id: run.id,
    datasetId: run.defaultDatasetId || null,
    status: run.status || null,
    startedAt: run.startedAt || null,
    finishedAt: run.finishedAt || null,
  }))
}

async function fetchLatestSuccessfulRun(actorId, token) {
  const normalizedActorId = normalizeActorId(actorId)
  if (!normalizedActorId) {
    throw new Error('Apify source is missing actorId')
  }
  const response = await fetchWithTimeout(buildLatestRunUrl(normalizedActorId, token), { headers: { Accept: 'application/json' } })
  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Apify latest run request failed (${response.status}): ${body.slice(0, 300)}`)
  }

  const payload = await response.json()
  const run = payload?.data
  if (!run?.id) return null

  return {
    id: run.id,
    datasetId: run.defaultDatasetId || null,
    status: run.status || null,
    startedAt: run.startedAt || null,
    finishedAt: run.finishedAt || null,
  }
}

/**
 * Fetches the latest successful run that has items in its dataset.
 * If the most recent run has 0 items (e.g. empty test run), falls back to the
 * previous successful run that has data.
 */
async function fetchLatestSuccessfulRunWithItems(actorId, token) {
  const runs = await listSuccessfulRuns(actorId, token, 10)
  for (const run of runs) {
    if (!run.datasetId) continue
    const { rawCount } = await fetchDatasetItemsByDatasetId(run.datasetId, token, 1, 'en')
    if (rawCount > 0) return run
  }
  return runs[0] || null
}

function buildDatasetItemsUrl(datasetId, token, { limit = PAGE_SIZE, offset = 0 } = {}) {
  const params = new URLSearchParams({
    token,
    format: 'json',
    limit: String(limit),
    offset: String(offset),
  })
  return `${APIFY_API_BASE}/datasets/${encodeURIComponent(datasetId)}/items?${params.toString()}`
}

async function fetchDatasetPage(datasetId, token, offset, pageSize) {
  const url = buildDatasetItemsUrl(datasetId, token, { limit: pageSize, offset })
  const response = await fetchWithTimeout(url, { headers: { Accept: 'application/json' } })
  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Apify request failed (${response.status}): ${body.slice(0, 300)}`)
  }
  const items = await response.json()
  if (!Array.isArray(items)) throw new Error('Apify response was not a dataset item array')
  return items
}

/**
 * Fetch ALL items from an Apify dataset, paginating in chunks of PAGE_SIZE.
 * If maxItems is provided and > 0, cap total items fetched.
 */
async function fetchDatasetItemsByDatasetId(datasetId, token, maxItems = 0, defaultLanguage = 'en') {
  const allItems = []
  let offset = 0

  while (true) {
    const remaining = maxItems > 0 ? maxItems - allItems.length : PAGE_SIZE
    const pageSize = maxItems > 0 ? Math.min(PAGE_SIZE, remaining) : PAGE_SIZE
    if (pageSize <= 0) break

    const page = await fetchDatasetPage(datasetId, token, offset, pageSize)
    allItems.push(...page)
    offset += page.length

    if (page.length < pageSize) break
    if (maxItems > 0 && allItems.length >= maxItems) break
  }

  const articles = allItems
    .map((item) => normalizeApifyItem(item, defaultLanguage))
    .filter(Boolean)

  logger.info({ datasetId, totalFetched: allItems.length, normalized: articles.length }, '[apify] dataset fetched')
  return { articles, rawCount: allItems.length }
}

module.exports = {
  getApifyToken,
  listSuccessfulRuns,
  fetchLatestSuccessfulRun,
  fetchLatestSuccessfulRunWithItems,
  fetchDatasetItemsByDatasetId,
}
