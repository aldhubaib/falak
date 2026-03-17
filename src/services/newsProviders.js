/**
 * Individual news API provider functions.
 * Each returns a normalized array of { url, title, description, content, source, publishedAt }.
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
      sortBy,
      pageSize: String(pageSize),
      apiKey,
    })
    const res = await fetch(`https://newsapi.org/v2/everything?${params}`, { signal })
    clear()
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`NewsAPI ${res.status}: ${body.slice(0, 200)}`)
    }
    const data = await res.json()
    const articles = (data.articles || []).map(a => ({
      url: a.url,
      title: a.title || '',
      description: a.description || '',
      content: a.content || a.description || '',
      source: `NewsAPI/${a.source?.name || 'unknown'}`,
      publishedAt: a.publishedAt || null,
    }))
    logger.info({ provider: 'newsapi', query: query.slice(0, 80), results: articles.length }, '[newsProviders] search done')
    return articles
  } catch (e) {
    clear()
    logger.error({ provider: 'newsapi', error: e.message }, '[newsProviders] search failed')
    return []
  }
}

// ── GNews (gnews.io) ──────────────────────────────────────────────────────

async function searchGNews(query, apiKey, { max = 10, sortby = 'relevance' } = {}) {
  const { signal, clear } = withTimeout(TIMEOUT_MS)
  try {
    const params = new URLSearchParams({
      q: query,
      max: String(max),
      sortby,
      apikey: apiKey,
    })
    const res = await fetch(`https://gnews.io/api/v4/search?${params}`, { signal })
    clear()
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`GNews ${res.status}: ${body.slice(0, 200)}`)
    }
    const data = await res.json()
    const articles = (data.articles || []).map(a => ({
      url: a.url,
      title: a.title || '',
      description: a.description || '',
      content: a.content || a.description || '',
      source: `GNews/${a.source?.name || 'unknown'}`,
      publishedAt: a.publishedAt || null,
    }))
    logger.info({ provider: 'gnews', query: query.slice(0, 80), results: articles.length }, '[newsProviders] search done')
    return articles
  } catch (e) {
    clear()
    logger.error({ provider: 'gnews', error: e.message }, '[newsProviders] search failed')
    return []
  }
}

// ── The Guardian (content.guardianapis.com) ────────────────────────────────

async function searchGuardian(query, apiKey, { pageSize = 10 } = {}) {
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
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Guardian ${res.status}: ${body.slice(0, 200)}`)
    }
    const data = await res.json()
    const results = data.response?.results || []
    const articles = results.map(a => ({
      url: a.webUrl,
      title: a.fields?.headline || a.webTitle || '',
      description: a.fields?.trailText || '',
      content: a.fields?.bodyText?.slice(0, 3000) || a.fields?.trailText || '',
      source: 'The Guardian',
      publishedAt: a.webPublicationDate || null,
    }))
    logger.info({ provider: 'guardian', query: query.slice(0, 80), results: articles.length }, '[newsProviders] search done')
    return articles
  } catch (e) {
    clear()
    logger.error({ provider: 'guardian', error: e.message }, '[newsProviders] search failed')
    return []
  }
}

// ── NYT Article Search (api.nytimes.com) ──────────────────────────────────

async function searchNYT(query, apiKey, { page = 0 } = {}) {
  const { signal, clear } = withTimeout(TIMEOUT_MS)
  try {
    const params = new URLSearchParams({
      q: query,
      fq: 'typeOfMaterials:News',
      page: String(page),
      'api-key': apiKey,
    })
    const res = await fetch(`https://api.nytimes.com/svc/search/v2/articlesearch.json?${params}`, { signal })
    clear()
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`NYT ${res.status}: ${body.slice(0, 200)}`)
    }
    const data = await res.json()
    const docs = data.response?.docs || []
    const articles = docs.map(a => ({
      url: a.web_url,
      title: a.headline?.main || '',
      description: a.abstract || a.snippet || '',
      content: a.lead_paragraph || a.abstract || a.snippet || '',
      source: `NYT/${a.section_name || 'News'}`,
      publishedAt: a.pub_date || null,
    }))
    logger.info({ provider: 'nyt', query: query.slice(0, 80), results: articles.length }, '[newsProviders] search done')
    return articles
  } catch (e) {
    clear()
    logger.error({ provider: 'nyt', error: e.message }, '[newsProviders] search failed')
    return []
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
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`NYT TopStories ${res.status}: ${body.slice(0, 200)}`)
    }
    const data = await res.json()
    const results = (data.results || []).slice(0, 10)
    const articles = results.map(a => ({
      url: a.url,
      title: a.title || '',
      description: a.abstract || '',
      content: a.abstract || '',
      source: `NYT/TopStories/${section}`,
      publishedAt: a.published_date || null,
    }))
    logger.info({ provider: 'nyt-top', section, results: articles.length }, '[newsProviders] top stories done')
    return articles
  } catch (e) {
    clear()
    logger.error({ provider: 'nyt-top', error: e.message }, '[newsProviders] top stories failed')
    return []
  }
}

module.exports = {
  searchNewsAPI,
  searchGNews,
  searchGuardian,
  searchNYT,
  fetchNYTTopStories,
}
