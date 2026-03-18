/**
 * Firecrawl API client — scrape URL to markdown.
 * https://docs.firecrawl.dev — API key is per project (Settings → API Keys).
 */
const fetch = require('node-fetch')

const FIRECRAWL_SCRAPE_URL = 'https://api.firecrawl.dev/v2/scrape'
const SCRAPE_TIMEOUT_MS = 30000
const RETRY_DELAY_MS = 2000
const MAX_RETRIES = 1

/**
 * Strip garbage from raw scraped text before saving or sending to AI.
 * Removes navigation-style markdown links but preserves bare reference URLs
 * that appear in article body context. Removes image markdown and collapses whitespace.
 * @param {string} raw
 * @returns {string}
 */
function preClean(raw) {
  if (!raw || typeof raw !== 'string') return ''
  return raw
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/(?:^|\n)(?:https?:\/\/\S+\s*){3,}/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{3,}/g, ' ')
    .trim()
}

/**
 * Scrape a URL with Firecrawl and return markdown (or error).
 * Includes retry logic for transient failures (429, 503, timeouts).
 * @param {string} apiKey - Firecrawl API key (Bearer)
 * @param {string} url - Full URL to scrape
 * @returns {Promise<{ text: string } | { error: string }>}
 */
async function scrapeUrl(apiKey, url) {
  if (!apiKey || !apiKey.trim()) return { error: 'Firecrawl API key not set' }
  if (!url || typeof url !== 'string' || !url.startsWith('http')) {
    return { error: 'Invalid URL' }
  }

  let lastError
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await _scrapeOnce(apiKey, url)
      return result
    } catch (e) {
      lastError = e
      const isRetryable = e.name === 'AbortError' ||
        /429|503|timeout|ECONNRESET|ETIMEDOUT/i.test(e.message)
      if (!isRetryable || attempt >= MAX_RETRIES) {
        return { error: e.message || 'Firecrawl request failed' }
      }
      await new Promise(r => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)))
    }
  }
  return { error: lastError?.message || 'Firecrawl request failed' }
}

async function _scrapeOnce(apiKey, url) {
  const controller = new AbortController()
  const to = setTimeout(() => controller.abort(), SCRAPE_TIMEOUT_MS)
  try {
    const res = await fetch(FIRECRAWL_SCRAPE_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey.trim()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url,
        formats: ['markdown'],
        onlyMainContent: true,
        removeBase64Images: true,
        excludeTags: ['nav', 'footer', 'header', 'aside', 'script', 'style', 'form', 'select', 'noscript'],
      }),
      signal: controller.signal,
    })
    clearTimeout(to)
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      const status = res.status
      if (status === 429 || status === 503) {
        throw new Error(`HTTP ${status}`)
      }
      const msg = data.error || data.message || `HTTP ${status}`
      return { error: msg }
    }
    if (!data.success || !data.data) return { error: 'Invalid Firecrawl response' }
    const markdown = data.data.markdown
    if (!markdown || typeof markdown !== 'string') return { error: 'No markdown in response' }
    const text = markdown.trim()
    if (text.length < 50) return { error: 'No extractable text' }
    const MAX_LENGTH = 120000
    const truncated = text.length > MAX_LENGTH ? text.slice(0, MAX_LENGTH) + '…' : text
    return { text: truncated }
  } catch (e) {
    clearTimeout(to)
    throw e
  }
}

/**
 * Search the web for related articles using Firecrawl's /v2/search endpoint.
 * Returns an array of { title, url, snippet, markdown } objects.
 * @param {string} apiKey
 * @param {string} query - search query
 * @param {{ limit?: number, lang?: string }} [opts]
 * @returns {Promise<{ results: Array<{ title: string, url: string, snippet: string, markdown: string }> } | { error: string }>}
 */
async function searchNews(apiKey, query, opts = {}) {
  if (!apiKey || !apiKey.trim()) return { error: 'Firecrawl API key not set' }
  if (!query || typeof query !== 'string') return { error: 'Invalid query' }

  const limit = opts.limit ?? 5
  const controller = new AbortController()
  const to = setTimeout(() => controller.abort(), 60000)

  try {
    const res = await fetch('https://api.firecrawl.dev/v1/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey.trim()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        limit,
        lang: opts.lang || 'en',
        scrapeOptions: {
          formats: ['markdown'],
          onlyMainContent: true,
        },
      }),
      signal: controller.signal,
    })
    clearTimeout(to)

    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      return { error: data.error || data.message || `HTTP ${res.status}` }
    }

    if (!data.success || !Array.isArray(data.data)) {
      return { error: 'Invalid Firecrawl search response' }
    }

    const results = data.data.map(item => ({
      title: item.title || item.metadata?.title || '',
      url: item.url || '',
      snippet: item.description || item.metadata?.description || '',
      markdown: typeof item.markdown === 'string' ? item.markdown.slice(0, 15000) : '',
    })).filter(r => r.url)

    return { results }
  } catch (e) {
    clearTimeout(to)
    return { error: e.message || 'Firecrawl search failed' }
  }
}

module.exports = { scrapeUrl, preClean, searchNews }
