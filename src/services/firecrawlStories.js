/**
 * Firecrawl + Claude for story discovery.
 *
 * Architecture:
 *   1. Brain v2 provides rich signals (learnedTags, tier1/2 topics, patterns, region)
 *   2. buildSearchQueries() turns those into 1-3 focused Firecrawl search queries
 *   3. Searches run in parallel with timeout + retry
 *   4. Results are merged, deduped, and sent to Claude for structuring
 *   5. Stories are returned even without scraped article content (lazy-fetched later)
 */
const fetch = require('node-fetch')
const { callAnthropic } = require('./pipelineProcessor')
const logger = require('../lib/logger')

const SEARCH_TIMEOUT_MS = 30000
const RETRY_DELAY_MS = 2000
const MAX_RETRIES = 1

/**
 * Build 1-3 targeted Firecrawl search queries from Brain v2 signals.
 * Each query focuses on a different signal to maximize source diversity.
 */
function buildSearchQueries({ learnedTags, regionHints, tier1Topics, tier2Topics, topCompTopics }) {
  const queries = []
  const region = (regionHints || []).slice(0, 1).join(' ')

  const mainTags = (learnedTags || []).slice(0, 5)
  if (mainTags.length > 0) {
    const q = [mainTags.join(' '), region].filter(Boolean).join(' ').trim()
    queries.push({ label: 'demand', query: q, limit: 7 })
  }

  const proven = (tier1Topics || []).slice(0, 3)
  if (proven.length > 0) {
    const q = [proven.join(' '), region].filter(Boolean).join(' ').trim()
    if (!queries.some(existing => existing.query === q)) {
      queries.push({ label: 'proven', query: q, limit: 5 })
    }
  }

  const patterns = [
    ...(topCompTopics || []).slice(0, 2),
    ...(tier2Topics || []).slice(0, 2),
  ].filter(Boolean)
  if (patterns.length > 0) {
    const q = [patterns.join(' '), region].filter(Boolean).join(' ').trim()
    if (!queries.some(existing => existing.query === q)) {
      queries.push({ label: 'patterns', query: q, limit: 5 })
    }
  }

  if (queries.length === 0) {
    queries.push({
      label: 'fallback',
      query: region ? `جريمة حقيقية تحقيق جنائي ${region}` : 'جريمة حقيقية تحقيق جنائي',
      limit: 10,
    })
  }

  return queries
}

/** For backward compat — single query builder used when no rich signals available. */
function buildFirecrawlSearchQuery(learnedTags, regionHints) {
  const tags = (learnedTags || []).slice(0, 4).join(' ')
  const region = (regionHints || []).slice(0, 1).join(' ')
  return [tags, region].filter(Boolean).join(' ').trim() || 'جريمة حقيقية تحقيق جنائي'
}

async function searchWithFirecrawl(searchQuery, firecrawlApiKey, limit = 10) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS)

  try {
    const res = await fetch('https://api.firecrawl.dev/v2/search', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${firecrawlApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: searchQuery,
        limit,
        scrapeOptions: {
          formats: ['markdown'],
          onlyMainContent: true,
        },
      }),
      signal: controller.signal,
    })

    clearTimeout(timeout)

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Firecrawl search failed: ${res.status} ${err}`)
    }

    const data = await res.json()
    const raw = data.data || {}
    const web = Array.isArray(raw.web) ? raw.web : []
    const news = Array.isArray(raw.news) ? raw.news : []
    const results = Array.isArray(data.data) ? data.data : [...web, ...news]
    return results
  } catch (e) {
    clearTimeout(timeout)
    throw e
  }
}

/**
 * Search with retry for transient failures (429, 503, network errors).
 */
async function searchWithRetry(searchQuery, firecrawlApiKey, limit = 10) {
  let lastError
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await searchWithFirecrawl(searchQuery, firecrawlApiKey, limit)
    } catch (e) {
      lastError = e
      const isRetryable = e.name === 'AbortError' ||
        /429|503|timeout|ECONNRESET|ETIMEDOUT/i.test(e.message)
      if (!isRetryable || attempt >= MAX_RETRIES) throw e
      logger.warn({ query: searchQuery.slice(0, 80), attempt, error: e.message }, '[firecrawlStories] retrying search')
      await new Promise(r => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)))
    }
  }
  throw lastError
}

const MIN_ARTICLE_LENGTH = 100
const MAX_ARTICLE_LENGTH = 120000

function normalizeUrl(u) {
  if (!u || typeof u !== 'string') return ''
  try {
    const x = new URL(u)
    const path = x.pathname.replace(/\/$/, '') || '/'
    return x.origin + path + x.search
  } catch {
    return u
  }
}

function buildUrlToContent(articles) {
  const map = new Map()
  for (const a of articles) {
    const url = a.url || a.metadata?.sourceURL || a.metadata?.url
    const content = (a.markdown || a.content || a.description || a.snippet || '').trim()
    if (!url || content.length < MIN_ARTICLE_LENGTH) continue
    const key = normalizeUrl(url)
    if (!map.has(key)) map.set(key, content)
  }
  return map
}

function findContentForSourceUrl(urlToContent, sourceUrl) {
  if (!sourceUrl) return null
  const key = normalizeUrl(sourceUrl)
  const exact = urlToContent.get(key)
  if (exact) return exact
  for (const [url, content] of urlToContent) {
    if (sourceUrl === url || sourceUrl.startsWith(url) || url.startsWith(sourceUrl)) return content
  }
  return null
}

/** Deduplicate articles by normalized URL. */
function deduplicateArticles(articles) {
  const seen = new Map()
  for (const a of articles) {
    const url = a.url || a.metadata?.sourceURL || a.metadata?.url
    if (!url) continue
    const key = normalizeUrl(url)
    if (!seen.has(key)) seen.set(key, a)
  }
  return [...seen.values()]
}

async function structureWithClaude(articles, autoSearchQuery, anthropicApiKey, projectId) {
  const articlesText = articles
    .map((a, i) => {
      const url = a.url || a.metadata?.sourceURL || a.metadata?.url || ''
      const title = (a.metadata?.title ?? a.title ?? '').slice(0, 200)
      const body = (a.markdown || a.content || a.description || a.snippet || '').slice(0, 1500)
      return `--- ARTICLE ${i + 1} ---\nURL: ${url}\nTitle: ${title}\n\n${body}`
    })
    .join('\n\n')

  const systemPrompt = `أنت محلل محتوى لقناة يوتيوب عربية.

سيصلك أولاً تعليمات القناة التفصيلية (ما تريده وما تتجنبه)، ثم مقالات من الويب.
مهمتك: طابق المقالات مع تعليمات القناة واستخرج القصص المناسبة فقط.

قواعد صارمة:
- أعد JSON فقط، بدون أي نص قبله أو بعده، بدون backticks
- sourceUrl يجب أن يكون مأخوذاً حرفياً من URL المقال — لا تخترع روابط أبداً
- إذا لم يناسب المقال تعليمات القناة، تجاهله تماماً
- summary جملتان بالعربية فقط

أعد مصفوفة JSON بهذا الشكل بالضبط:
[
  {
    "headline": "عنوان القصة بالعربية",
    "summary": "جملتان بالعربية تلخصان القصة",
    "sourceUrl": "الرابط الكامل للمقال",
    "sourceName": "اسم الموقع",
    "sourceDate": "YYYY-MM-DD أو null"
  }
]`

  const userContent =
    `## تعليمات القناة:\n${autoSearchQuery}\n\n` +
    `## المقالات التي وجدها Firecrawl:\n${articlesText}\n\n` +
    `طابق المقالات مع تعليمات القناة واستخرج القصص المناسبة.`

  const raw = await callAnthropic(
    anthropicApiKey,
    'claude-sonnet-4-20250514',
    [{ role: 'user', content: userContent }],
    { system: systemPrompt, maxTokens: 2000, projectId, action: 'Firecrawl Stories Structure' }
  )

  const clean = (raw && typeof raw === 'string' ? raw : '').replace(/```json|```/g, '').trim()
  try {
    return JSON.parse(clean)
  } catch {
    const arrayMatch = clean.match(/\[[\s\S]*\]/)
    if (arrayMatch) {
      try {
        return JSON.parse(arrayMatch[0])
      } catch (_) {}
    }
    logger.error({ snippet: clean.slice(0, 300) }, '[firecrawlStories] Claude JSON parse failed')
    return []
  }
}

/**
 * Fetch story suggestions via Firecrawl (search) + Claude (structure).
 * @param {object} opts
 * @param {string} opts.autoSearchQuery - Full brain query → Claude context only
 * @param {string[]} opts.learnedTags - From queryMeta → Firecrawl search keywords
 * @param {string[]} opts.regionHints - From queryMeta → appended to Firecrawl search
 * @param {string[]} opts.tier1Topics - Proven winner topics from topic memory
 * @param {string[]} opts.tier2Topics - High-demand untouched topics
 * @param {string[]} opts.topCompTopics - Competitor winning patterns
 * @param {string} opts.projectId
 * @param {string} opts.queryVersion
 * @param {string} opts.firecrawlApiKey
 * @param {string} opts.anthropicApiKey
 */
async function fetchStoriesViaFirecrawl({
  autoSearchQuery,
  learnedTags,
  regionHints,
  tier1Topics,
  tier2Topics,
  topCompTopics,
  projectId,
  queryVersion,
  firecrawlApiKey,
  anthropicApiKey,
}) {
  const queries = buildSearchQueries({ learnedTags, regionHints, tier1Topics, tier2Topics, topCompTopics })

  logger.info(
    { projectId, queryCount: queries.length, queries: queries.map(q => ({ label: q.label, query: q.query.slice(0, 80) })) },
    '[firecrawlStories] starting parallel searches'
  )

  const searchResults = await Promise.allSettled(
    queries.map(q => searchWithRetry(q.query, firecrawlApiKey, q.limit))
  )

  let allArticles = []
  let totalSearched = 0
  for (let i = 0; i < searchResults.length; i++) {
    const result = searchResults[i]
    const q = queries[i]
    if (result.status === 'fulfilled') {
      const count = result.value.length
      totalSearched += count
      logger.info({ label: q.label, resultCount: count }, '[firecrawlStories] search completed')
      allArticles.push(...result.value)
    } else {
      logger.error({ label: q.label, error: result.reason?.message }, '[firecrawlStories] search failed')
    }
  }

  if (allArticles.length === 0) {
    logger.warn({ projectId }, '[firecrawlStories] all searches returned 0 articles')
    return { stories: [], searchMeta: { queryCount: queries.length, totalArticles: 0, structured: 0 } }
  }

  allArticles = deduplicateArticles(allArticles)
  logger.info({ deduped: allArticles.length, raw: totalSearched }, '[firecrawlStories] articles after dedup')

  const structured = await structureWithClaude(
    allArticles,
    autoSearchQuery,
    anthropicApiKey,
    projectId
  )

  const urlToContent = buildUrlToContent(allArticles)

  const stories = structured
    .filter((s) => s.headline && s.sourceUrl)
    .map((s) => {
      const content = findContentForSourceUrl(urlToContent, s.sourceUrl)
      const articleContent =
        content && content.length >= MIN_ARTICLE_LENGTH
          ? content.length > MAX_ARTICLE_LENGTH
            ? content.slice(0, MAX_ARTICLE_LENGTH) + '…'
            : content
          : null
      return {
        projectId,
        headline: s.headline,
        sourceUrl: s.sourceUrl,
        sourceName: s.sourceName || 'Firecrawl',
        sourceDate: s.sourceDate ? new Date(s.sourceDate) : null,
        stage: 'suggestion',
        brief: {
          summary: s.summary || '',
          articleContent,
        },
        queryVersion: queryVersion || 'v2-dynamic',
      }
    })

  const searchMeta = {
    queryCount: queries.length,
    queries: queries.map(q => q.label),
    totalArticles: totalSearched,
    dedupedArticles: allArticles.length,
    structured: structured.length,
    withContent: stories.filter(s => s.brief.articleContent != null).length,
    withoutContent: stories.filter(s => s.brief.articleContent == null).length,
  }

  logger.info(searchMeta, '[firecrawlStories] fetch complete')

  return { stories, searchMeta }
}

module.exports = { fetchStoriesViaFirecrawl, buildFirecrawlSearchQuery, buildSearchQueries }
