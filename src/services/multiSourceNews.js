/**
 * Multi-source news aggregator with per-source query intelligence.
 *
 * Each news API source gets its own tailored query built from:
 *   1. The Brain's autoSearchQuery (central intelligence)
 *   2. Per-source feedback (what stories from THIS source got liked/passed)
 *   3. Source-specific constraints (query length, content style)
 *
 * The Brain tells you WHAT to look for.
 * Per-source learning tells you HOW to ask each source for it.
 */
const db = require('../lib/db')
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

// ── Blocklist ──────────────────────────────────────────────────────────────

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

// ── Provider registry ──────────────────────────────────────────────────────

const PROVIDERS = {
  newsapi: {
    name: 'NewsAPI',
    maxQueryLen: 400,
    style: 'Huge global index. Broad keywords work best. Returns articles from thousands of outlets worldwide.',
  },
  gnews: {
    name: 'GNews',
    maxQueryLen: 90,
    style: 'Short queries only (max 90 chars). Global coverage but smaller index. 2-3 focused keywords work best.',
  },
  guardian: {
    name: 'The Guardian',
    maxQueryLen: 400,
    style: 'UK quality journalism. Strong on investigations, politics, environment, long-form reporting. Topic phrases work well.',
  },
  nyt: {
    name: 'New York Times',
    maxQueryLen: 400,
    style: 'US quality journalism. Strong on investigations, crime, politics, science. Specific topic phrases work well.',
  },
}

// ── Per-source feedback collector ──────────────────────────────────────────

/**
 * Gather feedback from past stories grouped by source provider.
 * Returns { providerName: { liked: [...], passed: [...], scripted: [...], published: [...] } }
 */
async function collectSourceFeedback(projectId) {
  const stories = await db.story.findMany({
    where: {
      projectId,
      sourceName: { not: null },
      stage: { in: ['liked', 'scripting', 'filmed', 'publish', 'done', 'passed', 'omit'] },
    },
    select: { headline: true, sourceName: true, stage: true },
    orderBy: { updatedAt: 'desc' },
    take: 200,
  })

  const feedback = {}
  for (const s of stories) {
    const provider = (s.sourceName || '').split('/')[0].trim().toLowerCase()
    if (!provider) continue

    const mapped = mapToProvider(provider)
    if (!mapped) continue

    if (!feedback[mapped]) feedback[mapped] = { liked: [], passed: [], scripted: [], published: [] }
    const headline = (s.headline || '').slice(0, 60)

    if (s.stage === 'liked') feedback[mapped].liked.push(headline)
    else if (s.stage === 'passed' || s.stage === 'omit') feedback[mapped].passed.push(headline)
    else if (s.stage === 'scripting' || s.stage === 'filmed') feedback[mapped].scripted.push(headline)
    else if (s.stage === 'publish' || s.stage === 'done') feedback[mapped].published.push(headline)
  }

  for (const key of Object.keys(feedback)) {
    feedback[key].liked = feedback[key].liked.slice(0, 8)
    feedback[key].passed = feedback[key].passed.slice(0, 8)
    feedback[key].scripted = feedback[key].scripted.slice(0, 5)
    feedback[key].published = feedback[key].published.slice(0, 5)
  }

  return feedback
}

function mapToProvider(rawProvider) {
  const lower = rawProvider.toLowerCase()
  if (lower === 'newsapi' || lower === 'news') return 'newsapi'
  if (lower === 'gnews') return 'gnews'
  if (lower === 'the guardian' || lower === 'guardian') return 'guardian'
  if (lower === 'nyt' || lower.includes('nyt') || lower.includes('new york')) return 'nyt'
  return null
}

// ── Per-source query builder ───────────────────────────────────────────────

/**
 * Generate tailored search queries per provider using one Claude call.
 * Returns { newsapi: "query...", gnews: "query...", guardian: "query...", nyt: "query..." }
 */
async function buildPerSourceQueries(autoSearchQuery, anthropicApiKey, projectId, activeProviders, feedback) {
  const providerBlocks = activeProviders.map(provKey => {
    const prov = PROVIDERS[provKey]
    const fb = feedback[provKey]
    let feedbackText = 'No past data yet — generate a good general query.'
    if (fb) {
      const parts = []
      if (fb.published.length) parts.push(`Stories that became published videos (BEST signal): ${fb.published.join(', ')}`)
      if (fb.scripted.length) parts.push(`Stories that got scripted (good signal): ${fb.scripted.join(', ')}`)
      if (fb.liked.length) parts.push(`Stories that were liked: ${fb.liked.join(', ')}`)
      if (fb.passed.length) parts.push(`Stories that were REJECTED (avoid similar): ${fb.passed.join(', ')}`)
      feedbackText = parts.length > 0 ? parts.join('\n') : 'No past data yet.'
    }

    return `## ${prov.name} (key: ${provKey})
Max query length: ${prov.maxQueryLen} characters
Source strengths: ${prov.style}
Past performance from this source:
${feedbackText}
`
  }).join('\n')

  try {
    const raw = await callAnthropic(
      anthropicApiKey,
      'claude-sonnet-4-20250514',
      [{
        role: 'user',
        content: `You are building search queries for a YouTube channel's news discovery system.

The channel's Brain has analyzed competitors and produced this content brief:
${(autoSearchQuery || '').slice(0, 2000)}

You need to generate a SEPARATE search query for each news API source below.
Each source has different strengths and different past performance with this channel.

Use the past performance data to make each query smarter:
- If published/scripted stories exist → find MORE stories like those topics
- If passed/rejected stories exist → AVOID those topics
- If no data → use a broad query based on the channel brief

${providerBlocks}

Return ONLY a JSON object with the provider key and its search query.
Example: {"newsapi": "crime investigation fraud", "gnews": "crime fraud", "guardian": "financial crime investigation", "nyt": "criminal investigation forensic"}

Rules:
- Each query must be plain English keywords separated by spaces
- No quotes, no boolean operators, no special characters
- Respect the max query length per source
- GNews MUST be short (2-3 words max)
- Make each query DIFFERENT — tailored to what each source is good at
- Return valid JSON only, no other text`,
      }],
      {
        system: 'You generate per-source news search queries as JSON. Return only the JSON object, nothing else.',
        maxTokens: 300,
        projectId,
        action: 'Per-Source Query Builder',
      }
    )

    const clean = (raw || '').replace(/```json|```/g, '').trim()
    try {
      const queries = JSON.parse(clean)
      const result = {}
      for (const provKey of activeProviders) {
        const q = (queries[provKey] || '').trim()
        const maxLen = PROVIDERS[provKey]?.maxQueryLen || 200
        result[provKey] = q ? q.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLen) : null
      }
      logger.info({ queries: result }, '[multiSourceNews] per-source queries generated')
      return result
    } catch {
      logger.error({ snippet: clean.slice(0, 200) }, '[multiSourceNews] query JSON parse failed')
    }
  } catch (e) {
    logger.warn({ error: e.message }, '[multiSourceNews] per-source query generation failed')
  }

  const fallback = 'crime investigation mystery scandal'
  const result = {}
  for (const provKey of activeProviders) {
    const maxLen = PROVIDERS[provKey]?.maxQueryLen || 200
    result[provKey] = fallback.slice(0, maxLen)
  }
  return result
}

// ── Deduplication ──────────────────────────────────────────────────────────

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

// ── Claude structuring ─────────────────────────────────────────────────────

async function structureWithClaude(articles, autoSearchQuery, anthropicApiKey, projectId) {
  const articlesText = articles
    .map((a, i) =>
      `--- ARTICLE ${i + 1} ---\nURL: ${a.url}\nTitle: ${a.title}\nSource: ${a.source}\n\n${(a.content || a.description || '').slice(0, 1500)}`
    )
    .join('\n\n')

  const systemPrompt = `أنت محلل محتوى لقناة يوتيوب عربية. مهمتك اختيار القصص المثيرة للاهتمام التي تصلح لفيديوهات يوتيوب.

سيصلك تعليمات القناة كمرجع عام، ثم مقالات من مصادر إخبارية متعددة.

الهدف الرئيسي: اختر أي قصة مثيرة أو مفاجئة أو فيروسية تصلح لفيديو يوتيوب جذاب.
لا تكن صارماً جداً في المطابقة مع تعليمات القناة — القصة المثيرة أهم من التطابق الدقيق.

قواعد:
- أعد JSON فقط، بدون أي نص قبله أو بعده، بدون backticks
- sourceUrl يجب أن يكون مأخوذاً حرفياً من حقل URL في المقال — لا تخترع أو تعدّل أي رابط
- لا تستخدم روابط YouTube أو وسائل التواصل الاجتماعي أو ويكيبيديا
- إذا كان المقال من موقع غير إخباري (مكتب محاماة، متجر، إلخ)، تجاهله
- summary جملتان بالعربية
- اقبل القصة بأي لغة كانت — المهم أن تكون مثيرة للاهتمام

أعد مصفوفة JSON بهذا الشكل:
[
  {
    "headline": "عنوان القصة بالعربية",
    "summary": "جملتان بالعربية تلخصان القصة",
    "sourceUrl": "الرابط الكامل للمقال الإخباري",
    "sourceName": "اسم الموقع الإخباري",
    "sourceDate": "YYYY-MM-DD أو null"
  }
]

إذا لم تجد أي مقال إخباري حقيقي على الإطلاق، أعد مصفوفة فارغة: []
لكن كن كريماً في الاختيار — القصة لا تحتاج تطابق 100% مع تعليمات القناة.`

  const userContent =
    `## تعليمات القناة (مرجع عام):\n${autoSearchQuery}\n\n` +
    `## المقالات من مصادر إخبارية متعددة:\n${articlesText}\n\n` +
    `اختر القصص المثيرة والمفاجئة التي تصلح لفيديوهات يوتيوب. كن كريماً — لا تتجاهل قصة جيدة لمجرد أنها لا تتطابق تماماً مع تعليمات القناة.`

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

// ── Main entry point ───────────────────────────────────────────────────────

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
  const _debug = []

  // 1. Determine active providers
  const activeProviders = Object.keys(newsApiKeys).filter(k => newsApiKeys[k] && PROVIDERS[k])

  if (activeProviders.length === 0) {
    return { stories: [], searchMeta: { error: 'No news API keys configured' } }
  }

  // 2. Collect per-source feedback from past stories
  const feedback = await collectSourceFeedback(projectId)

  _debug.push({
    step: 'feedback',
    providers: activeProviders,
    feedbackSummary: Object.fromEntries(
      activeProviders.map(p => [p, feedback[p]
        ? { liked: feedback[p].liked.length, passed: feedback[p].passed.length, scripted: feedback[p].scripted.length, published: feedback[p].published.length }
        : { liked: 0, passed: 0, scripted: 0, published: 0 }
      ])
    ),
  })

  // 3. Build per-source queries via Claude
  const queries = await buildPerSourceQueries(
    autoSearchQuery, anthropicApiKey, projectId, activeProviders, feedback
  )

  _debug.push({ step: 'queries', queries })

  logger.info({ projectId, queries, providers: activeProviders }, '[multiSourceNews] starting per-source searches')

  // 4. Execute searches with per-source queries
  const searches = []
  const providerNames = []

  if (newsApiKeys.newsapi && queries.newsapi) {
    searches.push(searchNewsAPI(queries.newsapi, newsApiKeys.newsapi, { pageSize: 20 }))
    providerNames.push('newsapi')
  }
  if (newsApiKeys.gnews && queries.gnews) {
    searches.push(searchGNews(queries.gnews, newsApiKeys.gnews, { max: 10 }))
    providerNames.push('gnews')
  }
  if (newsApiKeys.guardian && queries.guardian) {
    searches.push(searchGuardian(queries.guardian, newsApiKeys.guardian, { pageSize: 15 }))
    providerNames.push('guardian')
  }
  if (newsApiKeys.nyt && queries.nyt) {
    searches.push(searchNYT(queries.nyt, newsApiKeys.nyt))
    providerNames.push('nyt-search')
    searches.push(fetchNYTTopStories(newsApiKeys.nyt, 'world'))
    providerNames.push('nyt-top')
  }

  const results = await Promise.allSettled(searches)

  let rawArticles = []
  const providerStats = {}

  for (let i = 0; i < results.length; i++) {
    const name = providerNames[i]
    const result = results[i]
    const baseService = name.startsWith('nyt') ? 'nyt' : name
    const queryUsed = queries[baseService] || queries[name] || ''
    if (result.status === 'fulfilled') {
      const articles = result.value?.articles || []
      const count = articles.length
      providerStats[name] = { status: 'ok', count, query: queryUsed }
      rawArticles.push(...articles)
      trackUsage({ projectId, service: baseService, action: `search: ${queryUsed.slice(0, 60)}`, tokensUsed: count, status: 'ok' })
    } else {
      const errMsg = result.reason?.message || 'Unknown error'
      providerStats[name] = { status: 'fail', error: errMsg, query: queryUsed }
      trackUsage({ projectId, service: baseService, action: `search: ${queryUsed.slice(0, 60)}`, status: 'fail', error: errMsg })
    }
  }

  _debug.push({
    step: 'providers',
    providerStats,
    totalRaw: rawArticles.length,
    sampleTitles: rawArticles.slice(0, 5).map(a => ({ title: (a.title || '').slice(0, 80), source: a.source })),
  })

  logger.info({ providerStats, totalRaw: rawArticles.length }, '[multiSourceNews] all providers done')

  if (rawArticles.length === 0) {
    logger.warn({ projectId }, '[multiSourceNews] all providers returned 0 articles')
    return { stories: [], searchMeta: { queries, providerStats, totalArticles: 0, structured: 0, _debug } }
  }

  // 5. Deduplicate and filter
  const { articles: filteredArticles, blocked } = deduplicateArticles(rawArticles, dynamicBlocklist)

  logger.info(
    { raw: rawArticles.length, blocked, filtered: filteredArticles.length },
    '[multiSourceNews] articles after filter+dedup'
  )

  if (filteredArticles.length === 0) {
    return { stories: [], searchMeta: { queries, providerStats, totalArticles: rawArticles.length, blocked, structured: 0, _debug } }
  }

  // 6. Structure with Claude
  const structured = await structureWithClaude(
    filteredArticles,
    autoSearchQuery,
    anthropicApiKey,
    projectId,
  )

  _debug.push({
    step: 'claude',
    filteredIn: filteredArticles.length,
    structuredOut: structured.length,
    sample: structured.slice(0, 3).map(s => ({ headline: (s.headline || '').slice(0, 60), sourceName: s.sourceName })),
  })

  // 7. Build stories with provider source preserved
  const urlToSource = new Map()
  for (const a of filteredArticles) {
    if (a.url) urlToSource.set(normalizeUrl(a.url), a.source || 'News')
  }

  const stories = structured
    .filter(s => s.headline && s.sourceUrl && !isBlockedUrl(s.sourceUrl, dynamicBlocklist))
    .map(s => {
      const providerSource = urlToSource.get(normalizeUrl(s.sourceUrl))
      return {
        projectId,
        headline: s.headline,
        sourceUrl: s.sourceUrl,
        sourceName: providerSource || s.sourceName || 'News',
        sourceDate: s.sourceDate ? new Date(s.sourceDate) : null,
        stage: 'suggestion',
        brief: {
          summary: s.summary || '',
          articleContent: null,
        },
        queryVersion: queryVersion || 'v3-multi-source',
      }
    })

  const searchMeta = {
    queries,
    providerStats,
    totalArticles: rawArticles.length,
    blocked,
    filteredArticles: filteredArticles.length,
    structured: structured.length,
    accepted: stories.length,
    _debug,
  }

  logger.info(searchMeta, '[multiSourceNews] fetch complete')

  return { stories, searchMeta }
}

module.exports = { fetchStoriesMultiSource }
