/**
 * Individual news API provider functions.
 * Each returns { articles: [...], error?: string }.
 * articles: normalized array of { url, title, description, content, source, publishedAt }.
 * On API failure, articles is [] and error is set — the caller decides how to track it.
 */
const fetch = require('node-fetch')
const logger = require('../lib/logger')

const TIMEOUT_MS = 15000

function withTimeout(ms) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  return { signal: controller.signal, clear: () => clearTimeout(timer) }
}

// ── NewsAPI (newsapi.org) ─────────────────────────────────────────────────

async function searchNewsAPI(query, apiKey, { pageSize = 20, sortBy = 'relevancy' } = {}) {
  const { signal, clear } = withTimeout(TIMEOUT_MS)
  try {
    const params = new URLSearchParams({
      q: query,
      searchIn: 'title,description',
      sortBy,
      pageSize: String(pageSize),
      apiKey,
    })
    const res = await fetch(`https://newsapi.org/v2/everything?${params}`, { signal })
    clear()
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      const errMsg = data?.message || `HTTP ${res.status}`
      logger.error({ provider: 'newsapi', error: errMsg, status: res.status }, '[newsProviders] API error')
      throw new Error(`NewsAPI: ${errMsg}`)
    }
    if (data?.status === 'error') {
      logger.error({ provider: 'newsapi', code: data.code, message: data.message }, '[newsProviders] API returned error status')
      throw new Error(`NewsAPI: ${data.message || data.code}`)
    }
    const articles = (data?.articles || []).map(a => ({
      url: a.url,
      title: a.title || '',
      description: a.description || '',
      content: a.content || a.description || '',
      source: `NewsAPI/${a.source?.name || 'unknown'}`,
      publishedAt: a.publishedAt || null,
    }))
    logger.info({ provider: 'newsapi', query: query.slice(0, 80), results: articles.length, totalResults: data?.totalResults }, '[newsProviders] search done')
    return { articles }
  } catch (e) {
    clear()
    logger.error({ provider: 'newsapi', error: e.message }, '[newsProviders] search failed')
    throw e
  }
}

// ── GNews (gnews.io) ──────────────────────────────────────────────────────

async function searchGNews(query, apiKey, { max = 10, sortby = 'relevance' } = {}) {
  const { signal, clear } = withTimeout(TIMEOUT_MS)
  try {
    // GNews: max 200 chars, supports AND/OR/NOT, "quotes", parentheses
    const cleanQ = query.replace(/[^\w\s"()]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200)
    const params = new URLSearchParams({
      q: cleanQ,
      in: 'title,description',
      max: String(max),
      sortby,
      apikey: apiKey,
    })
    const res = await fetch(`https://gnews.io/api/v4/search?${params}`, { signal })
    clear()
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      const errMsg = data?.errors?.[0] || data?.message || `HTTP ${res.status}`
      logger.error({ provider: 'gnews', error: errMsg, status: res.status }, '[newsProviders] API error')
      throw new Error(`GNews: ${errMsg}`)
    }
    const articles = (data?.articles || []).map(a => ({
      url: a.url,
      title: a.title || '',
      description: a.description || '',
      content: a.content || a.description || '',
      source: `GNews/${a.source?.name || 'unknown'}`,
      publishedAt: a.publishedAt || null,
    }))
    logger.info({ provider: 'gnews', query: query.slice(0, 80), results: articles.length, totalArticles: data?.totalArticles }, '[newsProviders] search done')
    return { articles }
  } catch (e) {
    clear()
    logger.error({ provider: 'gnews', error: e.message }, '[newsProviders] search failed')
    throw e
  }
}

// ── The Guardian (content.guardianapis.com) ────────────────────────────────

async function searchGuardian(query, apiKey, { pageSize = 15 } = {}) {
  const { signal, clear } = withTimeout(TIMEOUT_MS)
  try {
    const params = new URLSearchParams({
      q: query,
      'show-fields': 'headline,trailText,bodyText,shortUrl,thumbnail',
      'page-size': String(pageSize),
      'order-by': 'relevance',
      'api-key': apiKey,
    })
    const res = await fetch(`https://content.guardianapis.com/search?${params}`, { signal })
    clear()
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      const errMsg = data?.response?.message || data?.message || `HTTP ${res.status}`
      logger.error({ provider: 'guardian', error: errMsg, status: res.status }, '[newsProviders] API error')
      throw new Error(`Guardian: ${errMsg}`)
    }
    const results = data?.response?.results || []
    const articles = results.map(a => ({
      url: a.webUrl,
      title: a.fields?.headline || a.webTitle || '',
      description: a.fields?.trailText || '',
      content: a.fields?.bodyText?.slice(0, 3000) || a.fields?.trailText || '',
      source: 'The Guardian',
      publishedAt: a.webPublicationDate || null,
    }))
    logger.info({ provider: 'guardian', query: query.slice(0, 80), results: articles.length, total: data?.response?.total }, '[newsProviders] search done')
    return { articles }
  } catch (e) {
    clear()
    logger.error({ provider: 'guardian', error: e.message }, '[newsProviders] search failed')
    throw e
  }
}

// ── NYT Article Search (api.nytimes.com) ──────────────────────────────────

async function searchNYT(query, apiKey, { page = 0 } = {}) {
  const { signal, clear } = withTimeout(TIMEOUT_MS)
  try {
    const q = typeof query === 'object' ? query.q : query
    const fq = typeof query === 'object' ? query.fq : undefined
    const params = new URLSearchParams({
      q: q || '',
      sort: 'newest',
      page: String(page),
      'api-key': apiKey,
    })
    if (fq) params.set('fq', fq)
    const res = await fetch(`https://api.nytimes.com/svc/search/v2/articlesearch.json?${params}`, { signal })
    clear()
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      const errMsg = data?.fault?.faultstring || data?.message || `HTTP ${res.status}`
      logger.error({ provider: 'nyt', error: errMsg, status: res.status }, '[newsProviders] API error')
      throw new Error(`NYT: ${errMsg}`)
    }
    const docs = data?.response?.docs || []
    const articles = docs.map(a => ({
      url: a.web_url,
      title: a.headline?.main || '',
      description: a.abstract || a.snippet || '',
      content: a.lead_paragraph || a.abstract || a.snippet || '',
      source: `NYT/${a.section_name || 'News'}`,
      publishedAt: a.pub_date || null,
    }))
    logger.info({ provider: 'nyt', query: query.slice(0, 80), results: articles.length, hits: data?.response?.meta?.hits }, '[newsProviders] search done')
    return { articles }
  } catch (e) {
    clear()
    logger.error({ provider: 'nyt', error: e.message }, '[newsProviders] search failed')
    throw e
  }
}

// ── NYT Top Stories ───────────────────────────────────────────────────────

async function fetchNYTTopStories(apiKey, section = 'world') {
  const { signal, clear } = withTimeout(TIMEOUT_MS)
  try {
    const res = await fetch(
      `https://api.nytimes.com/svc/topstories/v2/${section}.json?api-key=${apiKey}`,
      { signal }
    )
    clear()
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      const errMsg = data?.fault?.faultstring || data?.message || `HTTP ${res.status}`
      logger.error({ provider: 'nyt-top', error: errMsg, status: res.status }, '[newsProviders] API error')
      throw new Error(`NYT TopStories: ${errMsg}`)
    }
    const results = (data?.results || []).slice(0, 15)
    const articles = results.map(a => ({
      url: a.url,
      title: a.title || '',
      description: a.abstract || '',
      content: a.abstract || '',
      source: `NYT/TopStories/${section}`,
      publishedAt: a.published_date || null,
    }))
    logger.info({ provider: 'nyt-top', section, results: articles.length }, '[newsProviders] top stories done')
    return { articles }
  } catch (e) {
    clear()
    logger.error({ provider: 'nyt-top', error: e.message }, '[newsProviders] top stories failed')
    throw e
  }
}

// ── GNews Top Headlines ─────────────────────────────────────────────────

async function fetchGNewsTopHeadlines(apiKey, category = 'general', { max = 10 } = {}) {
  const { signal, clear } = withTimeout(TIMEOUT_MS)
  try {
    const params = new URLSearchParams({
      category,
      max: String(max),
      apikey: apiKey,
    })
    const res = await fetch(`https://gnews.io/api/v4/top-headlines?${params}`, { signal })
    clear()
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      const errMsg = data?.errors?.[0] || data?.message || `HTTP ${res.status}`
      logger.error({ provider: 'gnews-top', error: errMsg, status: res.status }, '[newsProviders] API error')
      throw new Error(`GNews Top: ${errMsg}`)
    }
    const articles = (data?.articles || []).map(a => ({
      url: a.url,
      title: a.title || '',
      description: a.description || '',
      content: a.content || a.description || '',
      source: `GNews/${a.source?.name || 'trending'}`,
      publishedAt: a.publishedAt || null,
    }))
    logger.info({ provider: 'gnews-top', category, results: articles.length }, '[newsProviders] top headlines done')
    return { articles }
  } catch (e) {
    clear()
    logger.error({ provider: 'gnews-top', error: e.message }, '[newsProviders] top headlines failed')
    throw e
  }
}

module.exports = {
  searchNewsAPI,
  searchGNews,
  searchGuardian,
  searchNYT,
  fetchNYTTopStories,
  fetchGNewsTopHeadlines,
}
