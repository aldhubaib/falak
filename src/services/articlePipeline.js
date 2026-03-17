/**
 * Brain v3 — Article Pipeline: SOURCE → SEARCH → FETCH
 *
 * SOURCE: API selection, key status, language, budget
 * SEARCH: Per-API native params + keyword gate + dedup rules
 * FETCH:  Execute fetch, apply gates, dedup, save, audit log
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

const MAX_FETCH_LOG_ENTRIES = 30

// ── Config validation per source type ─────────────────────────────────────

function validateSourceConfig(type, config) {
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

function hasApiKey(project, sourceType) {
  if (sourceType === 'rss') return true
  return !!resolveApiKey(project, sourceType)
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
    case 'guardian':
      return searchGuardian(config.q, apiKey, { pageSize: config.pageSize || 15 })
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

// ── RSS fetch ─────────────────────────────────────────────────────────────

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
  const sourceId = source.id
  const projectId = source.projectId
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

  let apiKey = null
  if (source.type !== 'rss') {
    apiKey = resolveApiKey(project, source.type)
    if (!apiKey) {
      return { sourceId, fetched: 0, gated: 0, dupes: 0, inserted: 0, error: `No API key for ${source.type}` }
    }
  }

  let rawArticles
  try {
    const result = await fetchFromSource(source, apiKey)
    rawArticles = result.articles || []
  } catch (e) {
    const logEntry = { time: new Date().toISOString(), raw: 0, gated: 0, dupes: 0, inserted: 0, error: e.message, ms: Date.now() - startTime }
    await appendFetchLog(sourceId, logEntry)
    logger.error({ sourceId, type: source.type, error: e.message }, '[articlePipeline] fetch failed')
    return { sourceId, fetched: 0, gated: 0, dupes: 0, inserted: 0, error: e.message }
  }

  const searchConfig = source.config?.search || null
  const { passed, gated } = applyKeywordGate(rawArticles, searchConfig)

  let inserted = 0
  let dupes = 0

  for (const raw of passed) {
    if (!raw.url) { dupes++; continue }
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
        dupes++
      } else {
        logger.error({ sourceId, url: raw.url, error: e.message }, '[articlePipeline] insert failed')
        dupes++
      }
    }
  }

  const logEntry = {
    time: new Date().toISOString(),
    raw: rawArticles.length,
    gated: gated.length,
    dupes,
    inserted,
    error: null,
    ms: Date.now() - startTime,
  }
  await appendFetchLog(sourceId, logEntry)

  await db.articleSource.update({
    where: { id: sourceId },
    data: { lastPolledAt: new Date() },
  })

  logger.info({ sourceId, type: source.type, label: source.label, ...logEntry }, '[articlePipeline] fetch complete')
  return { sourceId, fetched: rawArticles.length, gated: gated.length, dupes, inserted, error: null }
}

async function appendFetchLog(sourceId, entry) {
  const source = await db.articleSource.findUnique({ where: { id: sourceId }, select: { fetchLog: true } })
  const log = Array.isArray(source?.fetchLog) ? [...source.fetchLog] : []
  log.unshift(entry)
  if (log.length > MAX_FETCH_LOG_ENTRIES) log.length = MAX_FETCH_LOG_ENTRIES
  await db.articleSource.update({ where: { id: sourceId }, data: { fetchLog: log } })
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
  let apiKey = null
  if (sourceType !== 'rss') {
    apiKey = resolveApiKey(project, sourceType)
    if (!apiKey) throw new Error(`No API key configured for ${sourceType}`)
  }

  const fakeSource = { type: sourceType, config, language: 'en' }
  const result = await fetchFromSource(fakeSource, apiKey)
  const raw = (result.articles || []).slice(0, 10)

  const searchConfig = config?.search || null
  const { passed, gated } = applyKeywordGate(raw, searchConfig)

  return { passed, gated, total: raw.length }
}

module.exports = {
  VALID_SOURCE_TYPES,
  GNEWS_CATEGORIES,
  NYT_SECTIONS,
  validateConfig: validateSourceConfig,
  resolveApiKey,
  hasApiKey,
  ingestSource,
  ingestAll,
  testSourceFetch,
  applyKeywordGate,
  checkBudget,
  checkCooldown,
}
