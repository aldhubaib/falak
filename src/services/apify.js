const fetch = require('node-fetch')
const logger = require('../lib/logger')
const { decrypt } = require('./crypto')

const APIFY_API_BASE = 'https://api.apify.com/v2'
const DEFAULT_ITEM_LIMIT = 100

function getApifyToken(project) {
  if (!project?.apifyApiKeyEncrypted) return null
  try {
    return decrypt(project.apifyApiKeyEncrypted)
  } catch (error) {
    logger.error({ error: error.message }, '[apify] failed to decrypt project token')
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

function buildDatasetItemsUrl(config, token) {
  const params = new URLSearchParams({
    token,
    clean: '1',
    format: 'json',
    desc: '1',
    limit: String(config.limit || DEFAULT_ITEM_LIMIT),
  })

  if (config.datasetId) {
    return `${APIFY_API_BASE}/datasets/${encodeURIComponent(config.datasetId)}/items?${params.toString()}`
  }

  return `${APIFY_API_BASE}/acts/${encodeURIComponent(config.actorId)}/runs/last/dataset/items?status=SUCCEEDED&${params.toString()}`
}

async function fetchLatestDatasetItems(config, token, defaultLanguage = 'en') {
  const url = buildDatasetItemsUrl(config, token)
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
  fetchLatestDatasetItems,
}
