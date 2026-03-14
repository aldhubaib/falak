/**
 * Fetch a URL and extract main article text from HTML.
 * Used to populate story "full article" from sourceUrl.
 */
const fetch = require('node-fetch')

const MAX_ARTICLE_LENGTH = 120000
const FETCH_TIMEOUT_MS = 15000
const USER_AGENT = 'Falak/1.0 (article extractor)'

/**
 * Extract plain text from HTML: remove script/style, then strip tags and normalize whitespace.
 * @param {string} html
 * @returns {string}
 */
function extractTextFromHtml(html) {
  if (!html || typeof html !== 'string') return ''
  let text = html
  text = text.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
  text = text.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
  text = text.replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, '')
  text = text.replace(/<[^>]+>/g, ' ')
  text = text.replace(/\s+/g, ' ').trim()
  text = text.replace(/\s*\.\s*/g, '. ')
  return text
}

/**
 * Fetch URL and return extracted article text (or null on failure).
 * @param {string} url - Full URL to fetch
 * @returns {Promise<{ text: string } | { error: string }>}
 */
async function fetchArticleText(url) {
  if (!url || typeof url !== 'string' || !url.startsWith('http')) {
    return { error: 'Invalid URL' }
  }
  try {
    const controller = new AbortController()
    const to = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal,
    })
    clearTimeout(to)
    if (!res.ok) return { error: `HTTP ${res.status}` }
    const contentType = (res.headers.get('content-type') || '').toLowerCase()
    if (!contentType.includes('text/html')) return { error: 'Not HTML' }
    const html = await res.text()
    const text = extractTextFromHtml(html)
    if (!text || text.length < 50) return { error: 'No extractable text' }
    const truncated = text.length > MAX_ARTICLE_LENGTH ? text.slice(0, MAX_ARTICLE_LENGTH) + '…' : text
    return { text: truncated }
  } catch (e) {
    return { error: e.message || 'Fetch failed' }
  }
}

module.exports = { fetchArticleText, extractTextFromHtml }
