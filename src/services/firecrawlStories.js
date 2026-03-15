/**
 * Firecrawl + Claude for story discovery. Replaces Perplexity.
 * Firecrawl uses SHORT keyword search to find articles.
 * Claude uses the FULL brain query as context to structure results correctly.
 */
const fetch = require('node-fetch')
const { callAnthropic } = require('./pipelineProcessor')

function buildFirecrawlSearchQuery(learnedTags, regionHints) {
  const tags = (learnedTags || []).slice(0, 4).join(' ')
  const region = (regionHints || []).slice(0, 1).join(' ')
  return [tags, region].filter(Boolean).join(' ').trim() || 'جريمة حقيقية تحقيق جنائي'
}

async function searchWithFirecrawl(searchQuery, firecrawlApiKey) {
  const res = await fetch('https://api.firecrawl.dev/v2/search', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${firecrawlApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: searchQuery,
      limit: 10,
      sources: [
        { type: 'web', tbs: 'qdr:w' },
        { type: 'news' },
      ],
      scrapeOptions: {
        formats: [{ type: 'markdown' }],
        onlyMainContent: true,
      },
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Firecrawl search failed: ${res.status} ${err}`)
  }

  const data = await res.json()
  const raw = data.data || {}
  const web = Array.isArray(raw.web) ? raw.web : []
  const news = Array.isArray(raw.news) ? raw.news : []
  const articles = [...web, ...news]
  if (articles.length === 0) {
    console.warn('[firecrawlStories] Search returned 0 articles. query:', searchQuery.slice(0, 80), 'response keys:', Object.keys(raw))
  }
  return articles
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

/** Build map: normalized URL -> scraped markdown (only when length >= MIN_ARTICLE_LENGTH). */
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
    console.error('[firecrawlStories] Claude JSON parse failed:', clean.slice(0, 300))
    return []
  }
}

/**
 * Fetch story suggestions via Firecrawl (search) + Claude (structure).
 * @param {object} opts
 * @param {string} opts.autoSearchQuery - Full brain query → Claude context only (never sent to Firecrawl)
 * @param {string[]} opts.learnedTags - From queryMeta → Firecrawl search keywords
 * @param {string[]} opts.regionHints - From queryMeta → appended to Firecrawl search
 * @param {string} opts.projectId
 * @param {string} opts.queryVersion
 * @param {string} opts.firecrawlApiKey
 * @param {string} opts.anthropicApiKey
 */
async function fetchStoriesViaFirecrawl({
  autoSearchQuery,
  learnedTags,
  regionHints,
  projectId,
  queryVersion,
  firecrawlApiKey,
  anthropicApiKey,
}) {
  const firecrawlQuery = buildFirecrawlSearchQuery(learnedTags, regionHints)

  const articles = await searchWithFirecrawl(firecrawlQuery, firecrawlApiKey)
  if (!articles.length) return []

  const structured = await structureWithClaude(
    articles,
    autoSearchQuery,
    anthropicApiKey,
    projectId
  )
  if (!structured.length) return []

  const urlToContent = buildUrlToContent(articles)

  return structured
    .filter((s) => s.headline && s.sourceUrl)
    .map((s) => {
      const content = findContentForSourceUrl(urlToContent, s.sourceUrl)
      const articleContent =
        content && content.length >= MIN_ARTICLE_LENGTH
          ? content.length > MAX_ARTICLE_LENGTH
            ? content.slice(0, MAX_ARTICLE_LENGTH) + '…'
            : content
          : null
      return { ...s, articleContent }
    })
    .filter((s) => s.articleContent != null)
    .map((s) => ({
      projectId,
      headline: s.headline,
      sourceUrl: s.sourceUrl,
      sourceName: s.sourceName || 'Firecrawl',
      sourceDate: s.sourceDate ? new Date(s.sourceDate) : null,
      stage: 'suggestion',
      brief: {
        summary: s.summary || '',
        articleContent: s.articleContent,
      },
      queryVersion: queryVersion || 'v2-dynamic',
    }))
}

module.exports = { fetchStoriesViaFirecrawl, buildFirecrawlSearchQuery }
