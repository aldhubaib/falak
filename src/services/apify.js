const fetch = require('node-fetch')
const logger = require('../lib/logger')
const { decrypt } = require('./crypto')

const APIFY_API_BASE = 'https://api.apify.com/v2'
const DEFAULT_ITEM_LIMIT = 100

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
  const url = firstString(item?.url, item?.link)
  if (!url) return null

  return {
    url,
    title: firstString(item?.title, item?.headline),
    description: firstString(item?.description, item?.summary, item?.excerpt),
    content: firstString(item?.content, item?.text, item?.body, item?.articleBody, item?.description, item?.summary),
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

async function fetchLatestSuccessfulRun(actorId, token) {
  const normalizedActorId = normalizeActorId(actorId)
  if (!normalizedActorId) {
    throw new Error('Apify source is missing actorId')
  }
  const response = await fetch(buildLatestRunUrl(normalizedActorId, token), { headers: { Accept: 'application/json' } })
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

function buildDatasetItemsUrl(datasetId, token, limit = DEFAULT_ITEM_LIMIT) {
  const params = new URLSearchParams({
    token,
    clean: '1',
    format: 'json',
    desc: '1',
    limit: String(limit),
  })
  return `${APIFY_API_BASE}/datasets/${encodeURIComponent(datasetId)}/items?${params.toString()}`
}

async function fetchDatasetItemsByDatasetId(datasetId, token, limit = DEFAULT_ITEM_LIMIT, defaultLanguage = 'en') {
  const url = buildDatasetItemsUrl(datasetId, token, limit)
  const response = await fetch(url, { headers: { Accept: 'application/json' } })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Apify request failed (${response.status}): ${body.slice(0, 300)}`)
  }

  const items = await response.json()
  if (!Array.isArray(items)) {
    throw new Error('Apify response was not a dataset item array')
  }

  const articles = items
    .map((item) => normalizeApifyItem(item, defaultLanguage))
    .filter(Boolean)

  return { articles, rawCount: items.length }
}

module.exports = {
  getApifyToken,
  fetchLatestSuccessfulRun,
  fetchDatasetItemsByDatasetId,
}
