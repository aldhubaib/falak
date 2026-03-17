/**
 * Brain v3 — Article Pipeline: INGEST stage.
 *
 * Each ArticleSource stores its own native API params.
 * Ingest reads those params and calls the appropriate provider directly — no AI.
 */
const db = require('../lib/db')
const logger = require('../lib/logger')
const { decrypt } = require('./crypto')
const {
  searchNewsAPI,
  searchGNews,
  searchGuardian,
  searchNYT,
  fetchNYTTopStories,
  fetchGNewsTopHeadlines,
} = require('./newsProviders')

const VALID_SOURCE_TYPES = ['newsapi', 'gnews', 'gnews_top', 'guardian', 'nyt_search', 'nyt_top', 'rss']

const GNEWS_CATEGORIES = ['general', 'world', 'nation', 'business', 'technology', 'entertainment', 'sports', 'science', 'health']
const NYT_SECTIONS = ['arts', 'automobiles', 'books/review', 'business', 'fashion', 'food', 'health', 'home', 'insider', 'magazine', 'movies', 'nyregion', 'obituaries', 'opinion', 'politics', 'realestate', 'science', 'sports', 'sundayreview', 'technology', 'theater', 't-magazine', 'travel', 'upshot', 'us', 'world']

// ── Config validation per source type ─────────────────────────────────────

function validateConfig(type, config) {
  if (!config || typeof config !== 'object') return 'config must be a JSON object'
  switch (type) {
    case 'newsapi':
      if (!config.q || typeof config.q !== 'string') return 'newsapi requires config.q (string, max 500 chars)'
      if (config.q.length > 500) return 'newsapi config.q max 500 chars'
      break
    case 'gnews':
      if (!config.q || typeof config.q !== 'string') return 'gnews requires config.q (string, max 200 chars)'
      if (config.q.length > 200) return 'gnews config.q max 200 chars'
      break
    case 'gnews_top':
      if (!config.category || !GNEWS_CATEGORIES.includes(config.category)) return `gnews_top requires config.category: one of ${GNEWS_CATEGORIES.join(', ')}`
      break
    case 'guardian':
      if (!config.q || typeof config.q !== 'string') return 'guardian requires config.q (string)'
      break
    case 'nyt_search':
      if (!config.q || typeof config.q !== 'string') return 'nyt_search requires config.q (string)'
      break
    case 'nyt_top':
      if (!config.section || !NYT_SECTIONS.includes(config.section)) return `nyt_top requires config.section: one of ${NYT_SECTIONS.join(', ')}`
      break
    case 'rss':
      if (!config.url || typeof config.url !== 'string') return 'rss requires config.url (valid URL)'
      try { new URL(config.url) } catch { return 'rss config.url must be a valid URL' }
      break
    default:
      return `Unknown source type: ${type}`
  }
  return null
}

// ── Resolve API key for a source type ─────────────────────────────────────

function resolveApiKey(project, sourceType) {
  const keyMap = {
    newsapi: 'newsapiApiKeyEncrypted',
    gnews: 'gnewsApiKeyEncrypted',
    gnews_top: 'gnewsApiKeyEncrypted',
    guardian: 'guardianApiKeyEncrypted',
    nyt_search: 'nytApiKeyEncrypted',
    nyt_top: 'nytApiKeyEncrypted',
  }
  const field = keyMap[sourceType]
  if (!field || !project[field]) return null
  try { return decrypt(project[field]) } catch { return null }
}

// ── Fetch articles from a single source ───────────────────────────────────

async function fetchFromSource(source, apiKey) {
  const { type, config } = source
  switch (type) {
    case 'newsapi':
      return searchNewsAPI(config.q, apiKey, { pageSize: config.pageSize || 20, sortBy: config.sortBy || 'relevancy' })
    case 'gnews':
      return searchGNews(config.q, apiKey, { max: config.max || 10, sortby: config.sortby || 'relevance' })
    case 'gnews_top':
      return fetchGNewsTopHeadlines(apiKey, config.category, { max: config.max || 10 })
    case 'guardian': {
      const params = { pageSize: config.pageSize || 15 }
      return searchGuardian(config.q, apiKey, params)
    }
    case 'nyt_search':
      return searchNYT({ q: config.q, fq: config.fq }, apiKey)
    case 'nyt_top':
      return fetchNYTTopStories(apiKey, config.section)
    case 'rss':
      return fetchRSS(config.url)
    default:
      throw new Error(`Unknown source type: ${type}`)
  }
}

// ── RSS fetch (lightweight, no external dep) ──────────────────────────────

async function fetchRSS(url) {
  const nodeFetch = require('node-fetch')
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

// ── INGEST: run for a single source ───────────────────────────────────────

async function ingestSource(source, project) {
  const sourceId = source.id
  const projectId = source.projectId

  if (source.type === 'rss') {
    // RSS needs no API key
  } else {
    var apiKey = resolveApiKey(project, source.type)
    if (!apiKey) {
      return { sourceId, fetched: 0, inserted: 0, skipped: 0, error: `No API key for ${source.type}` }
    }
  }

  let rawArticles
  try {
    const result = await fetchFromSource(source, apiKey)
    rawArticles = result.articles || []
  } catch (e) {
    logger.error({ sourceId, type: source.type, error: e.message }, '[articlePipeline] ingest fetch failed')
    return { sourceId, fetched: 0, inserted: 0, skipped: 0, error: e.message }
  }

  let inserted = 0
  let skipped = 0

  for (const raw of rawArticles) {
    if (!raw.url) { skipped++; continue }
    try {
      await db.article.create({
        data: {
          projectId,
          sourceId,
          url: raw.url,
          title: raw.title || null,
          description: raw.description || null,
          publishedAt: raw.publishedAt ? new Date(raw.publishedAt) : null,
          language: source.language || 'en',
          stage: 'clean',
          status: 'queued',
        },
      })
      inserted++
    } catch (e) {
      if (e.code === 'P2002') {
        skipped++
      } else {
        logger.error({ sourceId, url: raw.url, error: e.message }, '[articlePipeline] insert failed')
        skipped++
      }
    }
  }

  await db.articleSource.update({
    where: { id: sourceId },
    data: { lastPolledAt: new Date() },
  })

  logger.info({ sourceId, type: source.type, label: source.label, fetched: rawArticles.length, inserted, skipped }, '[articlePipeline] ingest complete')
  return { sourceId, fetched: rawArticles.length, inserted, skipped, error: null }
}

// ── INGEST ALL: run for all active sources in a project ───────────────────

async function ingestAll(projectId) {
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      newsapiApiKeyEncrypted: true,
      gnewsApiKeyEncrypted: true,
      guardianApiKeyEncrypted: true,
      nytApiKeyEncrypted: true,
    },
  })
  if (!project) throw new Error('Project not found')

  const sources = await db.articleSource.findMany({
    where: { projectId, isActive: true },
  })

  const results = []
  for (const source of sources) {
    const result = await ingestSource(source, project)
    results.push({ ...result, label: source.label, type: source.type })
  }

  return results
}

// ── Test fetch: dry-run for a source config (no DB save) ──────────────────

async function testSourceFetch(sourceType, config, project) {
  if (sourceType === 'rss') {
    var apiKey = null
  } else {
    var apiKey = resolveApiKey(project, sourceType)
    if (!apiKey) throw new Error(`No API key configured for ${sourceType}`)
  }

  const fakeSource = { type: sourceType, config, language: 'en' }
  const result = await fetchFromSource(fakeSource, apiKey)
  return (result.articles || []).slice(0, 5)
}

module.exports = {
  VALID_SOURCE_TYPES,
  GNEWS_CATEGORIES,
  NYT_SECTIONS,
  validateConfig,
  ingestSource,
  ingestAll,
  testSourceFetch,
}
