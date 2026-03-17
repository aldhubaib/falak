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
  fetchGNewsTopHeadlines,
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

// ── Provider registry (derived from actual API documentation) ───────────────

const PROVIDERS = {
  newsapi: {
    name: 'NewsAPI',
    maxQueryLen: 500,
    queryFormat: 'structured',
    apiDoc: `NewsAPI /v2/everything — 150,000+ sources worldwide.
Query syntax: supports AND, OR, NOT, +/- operators, "exact phrases", parentheses grouping.
Example: crypto AND (ethereum OR litecoin) NOT bitcoin
Max query: 500 chars. searchIn param: title, description, content (we use title,description).
sortBy: relevancy | popularity | publishedAt. language param available but we don't restrict it.
Returns: up to 100 articles per page with title, description, content (truncated to 200 chars), source name, publishedAt.`,
  },
  gnews: {
    name: 'GNews',
    maxQueryLen: 200,
    queryFormat: 'structured',
    apiDoc: `GNews /v4/search — 80,000+ sources, powered by Google News index.
Query syntax: supports AND, OR, NOT operators, "exact phrases", parentheses grouping.
Example: (Apple AND iPhone) OR Microsoft
Max query: 200 chars. in param: title, description, content (we use title,description).
sortby: relevance | publishedAt. lang/country params available.
Returns: up to 10 articles (free tier) with title, description, content, source name, publishedAt.
IMPORTANT: special characters MUST be inside quotes. Keep queries clean.`,
  },
  gnews_top: {
    name: 'GNews Top Headlines',
    maxQueryLen: 200,
    queryFormat: 'category',
    apiDoc: `GNews /v4/top-headlines — trending articles based on Google News ranking.
Categories: general, world, nation, business, technology, entertainment, sports, science, health.
Optional q param for keyword filtering within the category.
Returns: top trending articles ranked by Google News algorithm.
Best for: discovering what's trending RIGHT NOW in a specific topic area.`,
    categories: ['general', 'world', 'nation', 'business', 'technology', 'entertainment', 'sports', 'science', 'health'],
  },
  guardian: {
    name: 'The Guardian',
    maxQueryLen: 400,
    queryFormat: 'plain',
    apiDoc: `Guardian Content API /search — all Guardian content.
Query: plain keywords in q param, no boolean operators needed (the API handles relevance internally).
Filters: tag, section, from-date, to-date (YYYY-MM-DD), order-by (newest|oldest|relevance).
show-fields: headline, trailText, bodyText (we request all three — gives full article text).
Returns: up to 50 articles per page with full bodyText (up to 3000 chars), trailText, webUrl, section, tags.
Strength: full article body text available, good for in-depth stories.`,
  },
  nyt_search: {
    name: 'NYT Article Search',
    maxQueryLen: 400,
    queryFormat: 'lucene',
    apiDoc: `NYT Article Search API v2 — full NYT archive.
Query: q param for keyword search (body, headline, byline).
Filter query (fq): Lucene syntax — field-name:("value1" "value2"). Fields include:
  news_desk, section_name, subject, glocations, organizations, persons, type_of_material.
  Example fq: news_desk:("Foreign" "Investigations") AND glocations:("MIDDLE EAST")
sort: newest | oldest | relevance. Date range: begin_date, end_date (YYYYMMDD format).
Returns: 10 articles per page (max 100 pages). Fields: headline, abstract, lead_paragraph, web_url, section_name, news_desk, keywords.
Strength: powerful Lucene filtering by desk, section, location, organization, person.`,
  },
  nyt_top: {
    name: 'NYT Top Stories',
    maxQueryLen: 0,
    queryFormat: 'section',
    apiDoc: `NYT Top Stories API v2 — current editorial picks by section.
Sections: arts, automobiles, books/review, business, fashion, food, health, home, insider, magazine, movies, nyregion, obituaries, opinion, politics, realestate, science, sports, sundayreview, technology, theater, t-magazine, travel, upshot, us, world.
No keyword search — returns whatever editors have placed on that section page.
Returns: ~30-40 articles with title, abstract, section, subsection, des_facet (topic tags), geo_facet (locations), org_facet (organizations), per_facet (people).
Strength: editorial curation — these are what NYT editors consider the most important stories right now.`,
    sections: ['arts', 'automobiles', 'books/review', 'business', 'fashion', 'food', 'health', 'home', 'insider', 'magazine', 'movies', 'nyregion', 'obituaries', 'opinion', 'politics', 'realestate', 'science', 'sports', 'sundayreview', 'technology', 'theater', 't-magazine', 'travel', 'upshot', 'us', 'world'],
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
 * Claude receives:
 *   - Full API documentation for each source (query syntax, filter capabilities, sections)
 *   - Brain intelligence (learned tags, competitor topics, demand gaps)
 *   - Per-source feedback (what stories from THAT source were liked/rejected/published)
 * Returns a structured object where each key's format matches that API's native syntax.
 */
async function buildPerSourceQueries({
  autoSearchQuery,
  anthropicApiKey,
  projectId,
  activeProviders,
  feedback,
  learnedTags,
  tier1Topics,
  tier2Topics,
  topCompTopics,
}) {
  // Build Brain context from learned signals
  const brainSignals = []
  if (learnedTags && learnedTags.length > 0) {
    brainSignals.push(`Topics with highest audience demand (from competitor analysis): ${learnedTags.slice(0, 8).join(', ')}`)
  }
  if (topCompTopics && topCompTopics.length > 0) {
    brainSignals.push(`Winning story patterns from top competitors: ${topCompTopics.slice(0, 5).join(', ')}`)
  }
  if (tier1Topics && tier1Topics.length > 0) {
    brainSignals.push(`Proven topics (historically successful): ${tier1Topics.slice(0, 5).join(', ')}`)
  }
  if (tier2Topics && tier2Topics.length > 0) {
    brainSignals.push(`Demand gaps (competitors get views, we haven't covered): ${tier2Topics.slice(0, 3).join(', ')}`)
  }
  const brainContext = brainSignals.length > 0
    ? `\nBrain intelligence from competitor analysis:\n${brainSignals.join('\n')}`
    : ''

  // Build per-provider blocks with full API docs + feedback
  const providerBlocks = activeProviders.map(provKey => {
    const prov = PROVIDERS[provKey]
    if (!prov) return ''
    const fb = feedback[provKey] || feedback[provKey.replace(/_.*/, '')]
    const fbParts = []
    if (fb) {
      if (fb.published.length) fbParts.push(`Published videos (strongest signal — find MORE like these): ${fb.published.join(', ')}`)
      if (fb.scripted.length) fbParts.push(`Scripted stories (strong signal): ${fb.scripted.join(', ')}`)
      if (fb.liked.length) fbParts.push(`Liked stories: ${fb.liked.join(', ')}`)
      if (fb.passed.length) fbParts.push(`REJECTED stories (AVOID similar topics): ${fb.passed.join(', ')}`)
    }
    const feedbackText = fbParts.length > 0
      ? fbParts.join('\n')
      : 'No history yet — derive query entirely from Brain intelligence and channel brief.'

    return `## ${prov.name} (key: "${provKey}", format: ${prov.queryFormat})
API Documentation:
${prov.apiDoc}

User history from this source:
${feedbackText}
`
  }).filter(Boolean).join('\n')

  try {
    const raw = await callAnthropic(
      anthropicApiKey,
      'claude-sonnet-4-20250514',
      [{
        role: 'user',
        content: `You are an expert at crafting optimal search queries for different news APIs.

## Channel Brief (from Brain analysis):
${(autoSearchQuery || '').slice(0, 2000)}
${brainContext}

## Your Task:
Generate the BEST possible query for each news API below. Each API has DIFFERENT query syntax and capabilities — use them properly.

${providerBlocks}

## Output Format:
Return a JSON object where each key is the provider key (in quotes above) and value is the query object for that API.

Each provider's query format depends on its type:

For "structured" format APIs (newsapi, gnews):
  Return a string using that API's native boolean syntax.
  NewsAPI supports: AND, OR, NOT, +/-, "exact phrases", parentheses. Max 500 chars.
  GNews supports: AND, OR, NOT, "exact phrases", parentheses. Max 200 chars. Keep it shorter and cleaner.
  Example: { "newsapi": "keyword1 AND (keyword2 OR keyword3) NOT avoidword" }

For "plain" format APIs (guardian):
  Return a string of keywords (Guardian handles relevance internally).
  Example: { "guardian": "keyword1 keyword2 keyword3" }

For "lucene" format APIs (nyt_search):
  Return an object with "q" (keyword query) and optional "fq" (Lucene filter query).
  Available fq fields: news_desk, section_name, subject, glocations, organizations, persons.
  Example: { "nyt_search": { "q": "keyword1 keyword2", "fq": "section_name:(\\"World\\" \\"Science\\")" } }

For "section" format APIs (nyt_top):
  Return an array of 1-3 section names most relevant to the channel brief.
  Example: { "nyt_top": ["world", "science", "technology"] }

For "category" format APIs (gnews_top):
  Return a category string from: general, world, nation, business, technology, entertainment, sports, science, health.
  Example: { "gnews_top": "world" }

## Rules:
- ALL query content must be derived from the channel brief and Brain intelligence above
- If a source has published/scripted stories → find MORE of those exact topics from that source
- If a source has rejected stories → AVOID those topics from that source
- Each source should explore a DIFFERENT angle of the channel's interests
- Use each API's full query capabilities (boolean operators, filters, sections)
- English keywords only
- Return valid JSON only, no other text`,
      }],
      {
        system: 'You are a news API query expert. You understand the exact query syntax for NewsAPI, GNews, Guardian, and NYT APIs. Generate optimal queries using each API\'s native capabilities. Return only valid JSON.',
        maxTokens: 600,
        projectId,
        action: 'Per-Source Query Builder (API-aware)',
      }
    )

    const clean = (raw || '').replace(/```json|```/g, '').trim()
    try {
      const queries = JSON.parse(clean)
      const result = {}
      for (const provKey of activeProviders) {
        const prov = PROVIDERS[provKey]
        if (!prov) continue
        const q = queries[provKey]

        if (prov.queryFormat === 'section' && Array.isArray(q)) {
          // NYT Top Stories — array of sections, validated
          result[provKey] = q.filter(s => prov.sections?.includes(s)).slice(0, 3)
          if (result[provKey].length === 0) result[provKey] = ['world']
        } else if (prov.queryFormat === 'category' && typeof q === 'string') {
          // GNews Top Headlines — single category, validated
          result[provKey] = prov.categories?.includes(q) ? q : 'general'
        } else if (prov.queryFormat === 'lucene' && typeof q === 'object' && q !== null) {
          // NYT Article Search — { q, fq }
          result[provKey] = {
            q: sanitizeQuery(q.q || '', prov.maxQueryLen),
            fq: typeof q.fq === 'string' ? q.fq.slice(0, 500) : undefined,
          }
        } else if (typeof q === 'string') {
          // structured or plain — sanitize to max length
          result[provKey] = sanitizeQuery(q, prov.maxQueryLen)
        } else {
          result[provKey] = null
        }
      }
      logger.info({ queries: result }, '[multiSourceNews] per-source queries generated (API-aware)')
      return result
    } catch {
      logger.error({ snippet: clean.slice(0, 300) }, '[multiSourceNews] query JSON parse failed')
    }
  } catch (e) {
    logger.warn({ error: e.message }, '[multiSourceNews] per-source query generation failed')
  }

  // Dynamic fallback: use Brain's learned tags, or extract keywords from autoSearchQuery
  const fallbackKeywords = (learnedTags && learnedTags.length > 0)
    ? learnedTags.slice(0, 4).join(' ')
    : extractKeywordsFromBrief(autoSearchQuery)

  const result = {}
  for (const provKey of activeProviders) {
    const prov = PROVIDERS[provKey]
    if (!prov) continue
    if (prov.queryFormat === 'section') {
      result[provKey] = ['world']
    } else if (prov.queryFormat === 'category') {
      result[provKey] = 'general'
    } else if (prov.queryFormat === 'lucene') {
      result[provKey] = { q: fallbackKeywords.slice(0, prov.maxQueryLen) }
    } else {
      result[provKey] = fallbackKeywords.slice(0, prov.maxQueryLen)
    }
  }
  logger.warn({ fallbackKeywords }, '[multiSourceNews] using dynamic fallback queries')
  return result
}

function sanitizeQuery(q, maxLen) {
  if (!q || typeof q !== 'string') return null
  return q.replace(/\s+/g, ' ').trim().slice(0, maxLen) || null
}

/**
 * Extract English-ish keywords from the Arabic brief as a last resort.
 */
function extractKeywordsFromBrief(brief) {
  if (!brief || typeof brief !== 'string') return 'news today'
  const latinWords = brief.match(/[a-zA-Z]{3,}/g)
  if (latinWords && latinWords.length >= 2) {
    return [...new Set(latinWords)].slice(0, 5).join(' ')
  }
  return 'news today'
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

async function structureWithClaude(articles, autoSearchQuery, anthropicApiKey, projectId, feedback) {
  // Group articles by provider for source-aware presentation
  const byProvider = {}
  for (const a of articles) {
    const prov = a._provider || 'unknown'
    if (!byProvider[prov]) byProvider[prov] = []
    byProvider[prov].push(a)
  }

  // Build source-aware article blocks
  let articleIdx = 0
  const articleSections = Object.entries(byProvider).map(([prov, provArticles]) => {
    const provName = PROVIDERS[prov.replace(/-.*/, '')]?.name || prov
    const fb = feedback?.[prov.replace(/-.*/, '')]
    let trackRecord = ''
    if (fb) {
      const signals = []
      if (fb.published.length) signals.push(`أنتج ${fb.published.length} فيديو منشور (أفضل مصدر — أعطِ أولوية لمقالاته)`)
      if (fb.scripted.length) signals.push(`${fb.scripted.length} قصة وصلت لمرحلة السكربت`)
      if (fb.liked.length) signals.push(`${fb.liked.length} قصة أعجبت المستخدم`)
      if (fb.passed.length) signals.push(`${fb.passed.length} قصة تم تجاهلها`)
      if (signals.length > 0) trackRecord = `\n⚡ سجل ${provName}: ${signals.join('، ')}`
    }

    const provArticlesText = provArticles.map(a => {
      articleIdx++
      return `--- مقال ${articleIdx} ---\nURL: ${a.url}\nTitle: ${a.title}\nSource: ${a.source}\n\n${(a.content || a.description || '').slice(0, 1500)}`
    }).join('\n\n')

    return `\n═══ من ${provName} ═══${trackRecord}\n\n${provArticlesText}`
  }).join('\n\n')

  const systemPrompt = `أنت محلل محتوى لقناة يوتيوب عربية.

مهمتك: حوّل كل مقال إخباري حقيقي إلى اقتراح قصة. اقبل أي مقال إخباري — لا ترفض إلا إذا كان:
- رابط يوتيوب أو سوشيال ميديا أو ويكيبيديا
- موقع غير إخباري (مكتب محاماة، متجر، إلخ)
- مقال مكرر لمقال آخر في نفس القائمة

كل مصدر له سجل أداء — أعطِ أولوية أعلى للمصادر التي أنتجت فيديوهات منشورة.

قواعد الإخراج:
- أعد JSON فقط، بدون أي نص أو backticks
- sourceUrl: انسخه حرفياً من حقل URL — لا تخترع روابط
- headline و summary بالعربية
- sourceName: اسم الـ API / اسم الموقع الإخباري

الشكل:
[{"headline":"...","summary":"جملتان","sourceUrl":"...","sourceName":"...","sourceDate":"YYYY-MM-DD أو null"}]

مهم جداً: لا تُرجع مصفوفة فارغة إلا إذا كانت كل المقالات غير إخبارية. إذا وصلك 44 مقال، يجب أن ترجع على الأقل 15-30 قصة.`

  const userContent =
    `## تعليمات القناة (مرجع عام فقط — لا تستخدمها لرفض مقالات):\n${autoSearchQuery}\n\n` +
    `## المقالات حسب المصدر:\n${articleSections}\n\n` +
    `حوّل كل مقال إخباري إلى قصة. لا تتجاهل أي مقال إخباري حقيقي.`

  const raw = await callAnthropic(
    anthropicApiKey,
    'claude-sonnet-4-20250514',
    [{ role: 'user', content: userContent }],
    { system: systemPrompt, maxTokens: 4000, projectId, action: 'Multi-Source Stories Structure' }
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

  // 1. Determine active providers — expand API keys into all supported providers
  const expandedProviders = []
  if (newsApiKeys.newsapi) expandedProviders.push('newsapi')
  if (newsApiKeys.gnews) {
    expandedProviders.push('gnews')
    expandedProviders.push('gnews_top')
  }
  if (newsApiKeys.guardian) expandedProviders.push('guardian')
  if (newsApiKeys.nyt) {
    expandedProviders.push('nyt_search')
    expandedProviders.push('nyt_top')
  }
  const activeProviders = expandedProviders.filter(k => PROVIDERS[k])

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

  // 3. Build per-source queries via Claude (using Brain signals + source feedback)
  const queries = await buildPerSourceQueries({
    autoSearchQuery,
    anthropicApiKey,
    projectId,
    activeProviders,
    feedback,
    learnedTags,
    tier1Topics,
    tier2Topics,
    topCompTopics,
  })

  _debug.push({ step: 'queries', queries })

  logger.info({ projectId, queries, providers: activeProviders }, '[multiSourceNews] starting per-source searches')

  // 4. Execute searches — dispatch based on each provider's query format
  const searches = []
  const providerNames = []

  for (const provKey of activeProviders) {
    const q = queries[provKey]
    if (!q) continue

    if (provKey === 'newsapi') {
      searches.push(searchNewsAPI(q, newsApiKeys.newsapi, { pageSize: 20 }))
      providerNames.push('newsapi')
    } else if (provKey === 'gnews') {
      searches.push(searchGNews(q, newsApiKeys.gnews, { max: 10 }))
      providerNames.push('gnews')
    } else if (provKey === 'gnews_top') {
      const category = typeof q === 'string' ? q : 'general'
      searches.push(fetchGNewsTopHeadlines(newsApiKeys.gnews, category, { max: 10 }))
      providerNames.push('gnews_top')
    } else if (provKey === 'guardian') {
      searches.push(searchGuardian(q, newsApiKeys.guardian, { pageSize: 15 }))
      providerNames.push('guardian')
    } else if (provKey === 'nyt_search') {
      searches.push(searchNYT(q, newsApiKeys.nyt))
      providerNames.push('nyt_search')
    } else if (provKey === 'nyt_top') {
      const sections = Array.isArray(q) ? q : ['world']
      for (const section of sections) {
        searches.push(fetchNYTTopStories(newsApiKeys.nyt, section))
        providerNames.push(`nyt_top/${section}`)
      }
    }
  }

  const results = await Promise.allSettled(searches)

  let rawArticles = []
  const providerStats = {}

  for (let i = 0; i < results.length; i++) {
    const name = providerNames[i]
    const result = results[i]
    const baseService = name.split('/')[0].replace(/_.*/, '') || name
    const queryUsed = queries[name] || queries[name.split('/')[0]] || ''
    const queryLabel = typeof queryUsed === 'object' ? JSON.stringify(queryUsed).slice(0, 60) : String(queryUsed).slice(0, 60)
    if (result.status === 'fulfilled') {
      const articles = (result.value?.articles || []).map(a => ({ ...a, _provider: name }))
      const count = articles.length
      providerStats[name] = { status: 'ok', count, query: queryUsed }
      rawArticles.push(...articles)
      trackUsage({ projectId, service: baseService, action: `search: ${queryLabel}`, tokensUsed: count, status: 'ok' })
    } else {
      const errMsg = result.reason?.message || 'Unknown error'
      providerStats[name] = { status: 'fail', error: errMsg, query: queryUsed }
      trackUsage({ projectId, service: baseService, action: `search: ${queryLabel}`, status: 'fail', error: errMsg })
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

  // 6. Structure with Claude (source-aware — uses per-provider feedback)
  const structured = await structureWithClaude(
    filteredArticles,
    autoSearchQuery,
    anthropicApiKey,
    projectId,
    feedback,
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
