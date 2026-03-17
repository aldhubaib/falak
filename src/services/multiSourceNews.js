/**
 * Multi-source news aggregator for story discovery.
 *
 * Queries all available news APIs in parallel, merges results,
 * deduplicates, filters, and sends to Claude for structuring.
 * Falls back to Firecrawl if no news API keys are configured.
 */
const logger = require('../lib/logger')
const { trackUsage } = require('./usageTracker')
const { callAnthropic } = require('./pipelineProcessor')
const {
  searchNewsAPI,
  searchGNews,
  searchGuardian,
  searchNYT,
  fetchNYTTopStories,
} = require('./newsProviders')

// Reuse blocklist and helpers from firecrawlStories
const BLOCKED_DOMAINS = [
  'youtube.com', 'youtu.be', 'facebook.com', 'fb.com', 'instagram.com',
  'twitter.com', 'x.com', 'tiktok.com', 'linkedin.com', 'reddit.com',
  'pinterest.com', 'snapchat.com', 'whatsapp.com', 'telegram.org', 't.me',
  'play.google.com', 'apps.apple.com', 'amazon.com',
  'wikipedia.org',
]

const BLOCKED_PATH_PATTERNS = [
  /\/contact/i, /\/about/i, /\/privacy/i, /\/terms/i, /\/login/i,
  /\/signup/i, /\/register/i, /\/cart/i, /\/checkout/i, /\/shop\//i,
]

function isBlockedUrl(url, dynamicBlocklist) {
  if (!url || typeof url !== 'string') return true
  try {
    const parsed = new URL(url)
    const host = parsed.hostname.replace(/^www\./, '')
    if (BLOCKED_DOMAINS.some(d => host === d || host.endsWith('.' + d))) return true
    if (dynamicBlocklist && dynamicBlocklist.some(d => host === d || host.endsWith('.' + d))) return true
    if (BLOCKED_PATH_PATTERNS.some(p => p.test(parsed.pathname))) return true
    return false
  } catch {
    return true
  }
}

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

/**
 * Use Claude to generate English search keywords from the Brain's channel brief.
 * All 4 news APIs get the same English query — language doesn't matter, only interesting stories.
 */
async function buildSearchQuery(autoSearchQuery, anthropicApiKey, projectId) {
  try {
    const raw = await callAnthropic(
      anthropicApiKey,
      'claude-sonnet-4-20250514',
      [{
        role: 'user',
        content: `You are helping a YouTube channel find interesting news stories to cover.\n\nHere is the channel's content brief:\n${(autoSearchQuery || '').slice(0, 1500)}\n\nGenerate 5-8 English search keywords/phrases that would find the most interesting, viral, and compelling stories for this channel across global news sources. Focus on topics that make great YouTube videos.\n\nReturn ONLY the search query string — no quotes, no explanation, just keywords separated by spaces.`,
      }],
      { system: 'You generate English news search queries. Return only the query string, nothing else.', maxTokens: 150, projectId, action: 'News Search Query' }
    )
    const keywords = (raw || '').trim().replace(/["'\n]/g, ' ').replace(/\s+/g, ' ').slice(0, 250)
    if (keywords.length > 5) return keywords
  } catch (e) {
    logger.warn({ error: e.message }, '[multiSourceNews] query generation failed, using fallback')
  }
  return 'true crime investigation murder cold case fraud scandal mystery'
}

/**
 * Deduplicate articles by normalized URL. Keeps first occurrence (preserves source priority).
 */
function deduplicateArticles(articles, dynamicBlocklist) {
  const seen = new Map()
  let blocked = 0
  for (const a of articles) {
    if (!a.url) continue
    if (isBlockedUrl(a.url, dynamicBlocklist)) { blocked++; continue }
    const key = normalizeUrl(a.url)
    if (!seen.has(key)) seen.set(key, a)
  }
  return { articles: [...seen.values()], blocked }
}

/**
 * Structure articles with Claude — same prompt as firecrawlStories but source-agnostic.
 */
async function structureWithClaude(articles, autoSearchQuery, anthropicApiKey, projectId) {
  const articlesText = articles
    .map((a, i) =>
      `--- ARTICLE ${i + 1} ---\nURL: ${a.url}\nTitle: ${a.title}\nSource: ${a.source}\n\n${(a.content || a.description || '').slice(0, 1500)}`
    )
    .join('\n\n')

  const systemPrompt = `أنت محلل محتوى لقناة يوتيوب عربية.

سيصلك أولاً تعليمات القناة التفصيلية (ما تريده وما تتجنبه)، ثم مقالات من مصادر إخبارية متعددة.
مهمتك: طابق المقالات مع تعليمات القناة واستخرج القصص المناسبة فقط.

قواعد صارمة:
- أعد JSON فقط، بدون أي نص قبله أو بعده، بدون backticks
- sourceUrl يجب أن يكون مأخوذاً حرفياً من حقل URL في المقال — لا تخترع أو تعدّل أي رابط
- لا تستخدم أبداً روابط YouTube أو وسائل التواصل الاجتماعي أو ويكيبيديا كمصدر
- يجب أن يكون المصدر مقالاً إخبارياً أو تحقيقاً صحفياً فقط
- إذا لم يناسب المقال تعليمات القناة، تجاهله تماماً
- إذا كان المقال من موقع غير إخباري (مكتب محاماة، متجر، إلخ)، تجاهله
- summary جملتان بالعربية فقط

أعد مصفوفة JSON بهذا الشكل بالضبط:
[
  {
    "headline": "عنوان القصة بالعربية",
    "summary": "جملتان بالعربية تلخصان القصة",
    "sourceUrl": "الرابط الكامل للمقال الإخباري",
    "sourceName": "اسم الموقع الإخباري",
    "sourceDate": "YYYY-MM-DD أو null"
  }
]

إذا لم تجد أي مقال مناسب، أعد مصفوفة فارغة: []`

  const userContent =
    `## تعليمات القناة:\n${autoSearchQuery}\n\n` +
    `## المقالات من مصادر إخبارية متعددة:\n${articlesText}\n\n` +
    `طابق المقالات مع تعليمات القناة واستخرج القصص الإخبارية المناسبة فقط. تجاهل أي مصدر ليس مقالاً إخبارياً.`

  const raw = await callAnthropic(
    anthropicApiKey,
    'claude-sonnet-4-20250514',
    [{ role: 'user', content: userContent }],
    { system: systemPrompt, maxTokens: 2000, projectId, action: 'Multi-Source Stories Structure' }
  )

  const clean = (raw && typeof raw === 'string' ? raw : '').replace(/```json|```/g, '').trim()
  try {
    return JSON.parse(clean)
  } catch {
    const arrayMatch = clean.match(/\[[\s\S]*\]/)
    if (arrayMatch) {
      try { return JSON.parse(arrayMatch[0]) } catch (_) {}
    }
    logger.error({ snippet: clean.slice(0, 300) }, '[multiSourceNews] Claude JSON parse failed')
    return []
  }
}

/**
 * Main entry point: fetch stories from all available news APIs in parallel.
 */
async function fetchStoriesMultiSource({
  autoSearchQuery,
  learnedTags,
  regionHints,
  tier1Topics,
  tier2Topics,
  topCompTopics,
  omitDomains,
  projectId,
  queryVersion,
  anthropicApiKey,
  newsApiKeys,
}) {
  const dynamicBlocklist = (omitDomains || []).filter(d => d && typeof d === 'string')
  const query = await buildSearchQuery(autoSearchQuery, anthropicApiKey, projectId)

  logger.info({
    projectId,
    query: query.slice(0, 120),
    providers: Object.keys(newsApiKeys).filter(k => newsApiKeys[k]),
  }, '[multiSourceNews] starting parallel searches')

  const searches = []
  const providerNames = []

  if (newsApiKeys.newsapi) {
    searches.push(searchNewsAPI(query, newsApiKeys.newsapi, { pageSize: 20 }))
    providerNames.push('newsapi')
  }
  if (newsApiKeys.gnews) {
    searches.push(searchGNews(query, newsApiKeys.gnews, { max: 10 }))
    providerNames.push('gnews')
  }
  if (newsApiKeys.guardian) {
    searches.push(searchGuardian(query, newsApiKeys.guardian, { pageSize: 15 }))
    providerNames.push('guardian')
  }
  if (newsApiKeys.nyt) {
    searches.push(searchNYT(query, newsApiKeys.nyt))
    providerNames.push('nyt-search')
    searches.push(fetchNYTTopStories(newsApiKeys.nyt, 'world'))
    providerNames.push('nyt-top')
  }

  if (searches.length === 0) {
    return { stories: [], searchMeta: { error: 'No news API keys configured' } }
  }

  const results = await Promise.allSettled(searches)

  let rawArticles = []
  const providerStats = {}

  for (let i = 0; i < results.length; i++) {
    const name = providerNames[i]
    const result = results[i]
    if (result.status === 'fulfilled') {
      const count = result.value.length
      providerStats[name] = { status: 'ok', count }
      rawArticles.push(...result.value)

      const baseService = name.startsWith('nyt') ? 'nyt' : name
      trackUsage({ projectId, service: baseService, action: `search: ${query.slice(0, 60)}`, tokensUsed: count, status: 'ok' })
    } else {
      providerStats[name] = { status: 'fail', error: result.reason?.message }
      const baseService = name.startsWith('nyt') ? 'nyt' : name
      trackUsage({ projectId, service: baseService, action: `search: ${query.slice(0, 60)}`, status: 'fail', error: result.reason?.message })
    }
  }

  logger.info({ providerStats, totalRaw: rawArticles.length }, '[multiSourceNews] all providers done')

  if (rawArticles.length === 0) {
    logger.warn({ projectId }, '[multiSourceNews] all providers returned 0 articles')
    return { stories: [], searchMeta: { query, providerStats, totalArticles: 0, structured: 0 } }
  }

  const { articles: filteredArticles, blocked } = deduplicateArticles(rawArticles, dynamicBlocklist)

  logger.info(
    { raw: rawArticles.length, blocked, filtered: filteredArticles.length },
    '[multiSourceNews] articles after filter+dedup'
  )

  if (filteredArticles.length === 0) {
    return { stories: [], searchMeta: { query, providerStats, totalArticles: rawArticles.length, blocked, structured: 0 } }
  }

  const structured = await structureWithClaude(
    filteredArticles,
    autoSearchQuery,
    anthropicApiKey,
    projectId,
  )

  const stories = structured
    .filter(s => s.headline && s.sourceUrl && !isBlockedUrl(s.sourceUrl, dynamicBlocklist))
    .map(s => ({
      projectId,
      headline: s.headline,
      sourceUrl: s.sourceUrl,
      sourceName: s.sourceName || 'News',
      sourceDate: s.sourceDate ? new Date(s.sourceDate) : null,
      stage: 'suggestion',
      brief: {
        summary: s.summary || '',
        articleContent: null,
      },
      queryVersion: queryVersion || 'v3-multi-source',
    }))

  const searchMeta = {
    query,
    providerStats,
    totalArticles: rawArticles.length,
    blocked,
    filteredArticles: filteredArticles.length,
    structured: structured.length,
    accepted: stories.length,
  }

  logger.info(searchMeta, '[multiSourceNews] fetch complete')

  return { stories, searchMeta }
}

module.exports = { fetchStoriesMultiSource }
