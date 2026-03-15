/**
 * Firecrawl API client — scrape URL to markdown.
 * https://docs.firecrawl.dev — API key is per project (Settings → API Keys).
 */
const fetch = require('node-fetch')

const FIRECRAWL_SCRAPE_URL = 'https://api.firecrawl.dev/v2/scrape'
const SCRAPE_TIMEOUT_MS = 30000

/**
 * Strip garbage from raw scraped text before saving or sending to AI.
 * Removes markdown links (keeps link text), bare URLs, image markdown, and collapses whitespace.
 * @param {string} raw
 * @returns {string}
 */
function preClean(raw) {
  if (!raw || typeof raw !== 'string') return ''
  return raw
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{3,}/g, ' ')
    .trim()
}

/**
 * Scrape a URL with Firecrawl and return markdown (or error).
 * Uses onlyMainContent and excludeTags to reduce UI chrome (nav, footer, etc.).
 * @param {string} apiKey - Firecrawl API key (Bearer)
 * @param {string} url - Full URL to scrape
 * @returns {Promise<{ text: string } | { error: string }>}
 */
async function scrapeUrl(apiKey, url) {
  if (!apiKey || !apiKey.trim()) return { error: 'Firecrawl API key not set' }
  if (!url || typeof url !== 'string' || !url.startsWith('http')) {
    return { error: 'Invalid URL' }
  }
  try {
    const controller = new AbortController()
    const to = setTimeout(() => controller.abort(), SCRAPE_TIMEOUT_MS)
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
      const msg = data.error || data.message || `HTTP ${res.status}`
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
    return { error: e.message || 'Firecrawl request failed' }
  }
}

module.exports = { scrapeUrl, preClean }
