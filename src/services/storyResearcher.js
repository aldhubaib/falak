/**
 * Story Researcher — enriches an article with multi-source research.
 *
 * Runs BEFORE translation so all web searches use the article's original language.
 *
 * Pipeline:
 *   1. SerpAPI Google Search — find related news articles (original language)
 *      SerpAPI Google Images — find article images (runs in parallel with search)
 *   2. Perplexity Sonar — background context, fed with URLs from step 1
 *   3. Claude Synthesis — combine everything into a structured research brief
 *
 * The brief answers the core storytelling questions:
 *   - What happened?
 *   - How did it happen?
 *   - What was the result?
 */
const db = require('../lib/db')
const { decrypt } = require('./crypto')
const { queryPerplexity } = require('./perplexity')
const { callAnthropic } = require('./pipelineProcessor')
const logger = require('../lib/logger')
const registry = require('../lib/serviceRegistry')

const SERPAPI_RESULT_LIMIT = 5
const SERPAPI_IMAGE_LIMIT = 10
const PERPLEXITY_MAX_TOKENS = 2048
const SYNTHESIS_MAX_TOKENS = 4096
const SERPAPI_TIMEOUT_MS = 30_000
const TRANSIENT_RETRY_DELAY_MS = 2_000
const MAX_TRANSIENT_RETRIES = 1

/**
 * Determine if an article needs deep research.
 * Called after classify (analysis exists) but before translation.
 */
async function needsResearch(article) {
  const [hasGoogleSearch, hasPerplexity, hasAnthropic] = await Promise.all([
    registry.hasKey('google_search'),
    registry.hasKey('perplexity'),
    registry.hasKey('anthropic'),
  ])

  if (!hasGoogleSearch && !hasPerplexity) {
    return { needed: false, reason: 'No research API keys (SerpAPI/Perplexity) configured' }
  }
  if (!hasAnthropic) {
    return { needed: false, reason: 'No Anthropic key for synthesis' }
  }

  const analysis = article.analysis
  if (!analysis || analysis.parseError) {
    return { needed: false, reason: 'No valid classification — cannot build search query' }
  }

  const SKIP_TYPES = ['opinion']
  if (SKIP_TYPES.includes(analysis.contentType)) {
    return { needed: false, reason: 'Opinion pieces rely on the author\'s perspective — external research adds noise' }
  }

  const REASON_BY_TYPE = {
    breaking:  'Breaking news needs background context and related coverage to build a complete picture',
    analysis:  'Analysis benefits from supporting data and multiple perspectives',
    report:    'Reports benefit from cross-referencing with other sources',
    feature:   'Feature stories benefit from deeper background and related angles',
    interview: 'Interviews benefit from subject background and fact-checking context',
  }
  const reason = REASON_BY_TYPE[analysis.contentType] || 'News article benefits from additional context and related sources'
  return { needed: true, reason }
}

// ── SerpAPI helpers ─────────────────────────────────────────────────────────

async function getSerpApiKey() {
  const keys = await db.googleSearchKey.findMany({
    where: { isActive: true },
    orderBy: [{ lastUsedAt: { sort: 'asc', nulls: 'first' } }, { sortOrder: 'asc' }],
  })
  if (!keys.length) return null
  const keyEntry = keys[0]
  await db.googleSearchKey.update({
    where: { id: keyEntry.id },
    data: { lastUsedAt: new Date(), usageCount: { increment: 1 } },
  })
  return { apiKey: decrypt(keyEntry.encryptedKey), label: keyEntry.label }
}

async function fetchWithRetry(url, opts = {}) {
  let lastError
  for (let attempt = 0; attempt <= MAX_TRANSIENT_RETRIES; attempt++) {
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(SERPAPI_TIMEOUT_MS), ...opts })
      if (resp.status >= 500 && attempt < MAX_TRANSIENT_RETRIES) {
        lastError = new Error(`SerpAPI HTTP ${resp.status}`)
        await new Promise(r => setTimeout(r, TRANSIENT_RETRY_DELAY_MS))
        continue
      }
      return resp
    } catch (e) {
      lastError = e
      if (attempt < MAX_TRANSIENT_RETRIES && (e.name === 'AbortError' || e.name === 'TimeoutError')) {
        await new Promise(r => setTimeout(r, TRANSIENT_RETRY_DELAY_MS))
        continue
      }
      throw e
    }
  }
  throw lastError
}

async function serpApiGoogleSearch(apiKey, query, lang) {
  const url = new URL('https://serpapi.com/search')
  url.searchParams.set('engine', 'google')
  url.searchParams.set('q', query)
  url.searchParams.set('tbm', 'nws')
  url.searchParams.set('num', String(SERPAPI_RESULT_LIMIT))
  url.searchParams.set('api_key', apiKey)
  if (lang === 'ar') {
    url.searchParams.set('hl', 'ar')
    url.searchParams.set('gl', 'sa')
  }

  const resp = await fetchWithRetry(url.toString())
  if (!resp.ok) throw new Error(`SerpAPI Google Search responded ${resp.status}: ${resp.statusText}`)
  const data = await resp.json()

  return (data.news_results || []).slice(0, SERPAPI_RESULT_LIMIT).map(r => ({
    title: r.title || '',
    url: r.link || '',
    snippet: r.snippet || '',
    source: r.source || '',
    date: r.date || '',
  }))
}

async function serpApiImageSearch(apiKey, query) {
  const url = new URL('https://serpapi.com/search')
  url.searchParams.set('engine', 'google_images_light')
  url.searchParams.set('q', query)
  url.searchParams.set('api_key', apiKey)

  const resp = await fetchWithRetry(url.toString())
  if (!resp.ok) throw new Error(`SerpAPI Images responded ${resp.status}: ${resp.statusText}`)
  const data = await resp.json()

  return (data.images_results || []).slice(0, SERPAPI_IMAGE_LIMIT).map(img => ({
    thumbnail: img.thumbnail || null,
    original: img.original || null,
    title: img.title || null,
    source: img.source || null,
    link: img.link || null,
  }))
}

// ── Perplexity with retry ───────────────────────────────────────────────────

async function queryPerplexityWithRetry(apiKey, prompt, opts) {
  let lastError
  for (let attempt = 0; attempt <= MAX_TRANSIENT_RETRIES; attempt++) {
    try {
      return await queryPerplexity(apiKey, prompt, opts)
    } catch (e) {
      lastError = e
      const isTransient = e.retryable || (e.message && /50[0-9]|timeout|abort/i.test(e.message))
      if (isTransient && attempt < MAX_TRANSIENT_RETRIES) {
        await new Promise(r => setTimeout(r, TRANSIENT_RETRY_DELAY_MS))
        continue
      }
      throw e
    }
  }
  throw lastError
}

/**
 * Run the full research pipeline for an article.
 * Returns research data + images to be stored on article.analysis.
 */
async function researchStory(article, channelId) {
  const log = []
  const analysis = article.analysis || {}

  const topic = analysis.topic || article.title || ''
  const region = analysis.region || ''
  const tags = Array.isArray(analysis.tags) ? analysis.tags : []
  const title = (article.title || '').trim()
  const lang = (article.language === 'ar') ? 'ar' : 'en'

  const searchQuery = buildSearchQuery(topic, region, article.title)

  // ── Step 1: SerpAPI Google Search + Image Search (parallel) ──
  let newsResults = []
  let images = []
  const serpKey = await getSerpApiKey()

  if (serpKey) {
    const [newsOutcome, imageOutcome] = await Promise.allSettled([
      serpApiGoogleSearch(serpKey.apiKey, searchQuery, lang),
      title ? serpApiImageSearch(serpKey.apiKey, title) : Promise.resolve([]),
    ])

    if (newsOutcome.status === 'fulfilled') {
      newsResults = newsOutcome.value
      log.push({
        step: 'serpapi_search', stage: 'research', label: 'Web Search', icon: 'search',
        subtitle: 'Related news via Google Search',
        processor: 'api', service: 'SerpAPI Google News',
        status: 'ok',
        query: searchQuery,
        resultsCount: newsResults.length,
        titles: newsResults.map(r => r.title).filter(Boolean),
        snippets: newsResults.map(r => (r.snippet || '').slice(0, 200)).filter(Boolean),
        keyLabel: serpKey.label,
        at: new Date().toISOString(),
      })
    } else {
      log.push({
        step: 'serpapi_search', stage: 'research', label: 'Web Search', icon: 'search',
        subtitle: 'Related news via Google Search',
        processor: 'api', service: 'SerpAPI Google News',
        status: 'failed', error: newsOutcome.reason?.message || 'Unknown error',
        query: searchQuery, keyLabel: serpKey.label,
        at: new Date().toISOString(),
      })
    }

    if (imageOutcome.status === 'fulfilled') {
      images = imageOutcome.value
      log.push({
        step: 'images', stage: 'research', label: 'Image Search', icon: 'image',
        subtitle: 'SerpAPI Google Images',
        processor: 'api', service: 'SerpAPI Google Images Light',
        status: 'ok',
        query: title,
        resultCount: images.length,
        keyLabel: serpKey.label,
        at: new Date().toISOString(),
      })
    } else {
      log.push({
        step: 'images', stage: 'research', label: 'Image Search', icon: 'image',
        subtitle: 'SerpAPI Google Images',
        processor: 'api', service: 'SerpAPI Google Images Light',
        status: 'failed', error: imageOutcome.reason?.message || 'Unknown error',
        keyLabel: serpKey.label,
        at: new Date().toISOString(),
      })
    }
  } else {
    log.push({
      step: 'serpapi_search', stage: 'research', label: 'Web Search', icon: 'search',
      subtitle: 'Related news via Google Search',
      processor: 'api', service: 'SerpAPI Google News',
      status: 'skipped', reason: 'No active Google Search API key',
      at: new Date().toISOString(),
    })
    log.push({
      step: 'images', stage: 'research', label: 'Image Search', icon: 'image',
      subtitle: 'SerpAPI Google Images',
      processor: 'api', service: 'SerpAPI Google Images Light',
      status: 'skipped', reason: 'No active Google Search API key',
      at: new Date().toISOString(),
    })
  }

  // ── Step 2: Perplexity Background Context (fed with SerpAPI URLs) ──
  let perplexityContext = null
  let perplexityCitations = []
  const pxApiKey = await registry.getKey('perplexity')
  if (pxApiKey) {
    try {
      const bgPrompt = buildBackgroundPrompt(topic, tags, region, analysis.summary, newsResults)
      const result = await queryPerplexityWithRetry(pxApiKey, bgPrompt, { maxTokens: PERPLEXITY_MAX_TOKENS })
      perplexityContext = result.text || null
      perplexityCitations = result.citations || []
      const pxQuality = evaluatePerplexityQuality(perplexityContext, perplexityCitations)
      log.push({
        step: 'perplexity_context', stage: 'research', label: 'Background', icon: 'globe', subtitle: 'Context from Perplexity',
        processor: 'ai', service: 'Perplexity Sonar',
        status: perplexityContext ? 'ok' : 'empty',
        promptSent: bgPrompt.slice(0, 1500),
        rawResponse: (perplexityContext || '').slice(0, 1500),
        chars: (perplexityContext || '').length,
        citations: perplexityCitations.length,
        inputTokens: result.usage?.prompt_tokens || null,
        outputTokens: result.usage?.completion_tokens || null,
        totalTokens: result.usage?.total_tokens || null,
        quality: pxQuality,
        at: new Date().toISOString(),
      })
    } catch (e) {
      log.push({ step: 'perplexity_context', stage: 'research', label: 'Background', icon: 'globe', subtitle: 'Context from Perplexity', processor: 'ai', service: 'Perplexity Sonar', status: 'failed', error: e.message, at: new Date().toISOString() })
    }
  } else {
    log.push({ step: 'perplexity_context', stage: 'research', label: 'Background', icon: 'globe', subtitle: 'Context from Perplexity', processor: 'ai', service: 'Perplexity Sonar', status: 'skipped', reason: 'No Perplexity key', at: new Date().toISOString() })
  }

  // ── Step 3: Claude Synthesis ──
  let researchBrief = null
  const anthropicKey = await registry.getKey('anthropic')
  if (anthropicKey) {
    try {
      const synthesisPrompt = buildSynthesisPrompt({
        topic,
        summary: analysis.summary,
        uniqueAngle: analysis.uniqueAngle,
        tags,
        region,
        originalArticle: (article.contentClean || article.content || '').slice(0, 8000),
        newsResults,
        perplexityContext,
        perplexityCitations,
      })

      const raw = await callAnthropic(anthropicKey, 'claude-sonnet-4-6', [
        { role: 'user', content: synthesisPrompt },
      ], {
        maxTokens: SYNTHESIS_MAX_TOKENS,
        channelId,
        action: 'story-research-synthesis',
      })
      const synthesisUsage = callAnthropic._lastUsage || {}

      researchBrief = parseSynthesisResponse(raw)
      const synthQuality = evaluateSynthesisQuality(researchBrief)
      log.push({
        step: 'synthesis', stage: 'synthesis', label: 'Synthesis', icon: 'brain', subtitle: 'AI brief (hook, narrative, facts)',
        processor: 'ai', service: 'Anthropic Claude Sonnet',
        status: researchBrief ? 'ok' : 'parse_error',
        model: 'claude-sonnet-4-6',
        briefKeys: researchBrief ? Object.keys(researchBrief) : [],
        inputTokens: synthesisUsage.inputTokens || null,
        outputTokens: synthesisUsage.outputTokens || null,
        totalTokens: synthesisUsage.totalTokens || null,
        promptSent: synthesisPrompt.slice(0, 1500),
        rawResponse: (raw || '').slice(0, 1500),
        quality: synthQuality,
        at: new Date().toISOString(),
      })
    } catch (e) {
      log.push({ step: 'synthesis', stage: 'synthesis', label: 'Synthesis', icon: 'brain', subtitle: 'AI brief (hook, narrative, facts)', processor: 'ai', service: 'Anthropic Claude Sonnet', status: 'failed', error: e.message, at: new Date().toISOString() })
    }
  }

  const researchData = {
    relatedArticles: newsResults.map(r => ({
      title: r.title,
      url: r.url,
      snippet: r.snippet,
      source: r.source,
    })),
    backgroundContext: perplexityContext,
    citations: perplexityCitations,
    brief: researchBrief,
    researchedAt: new Date().toISOString(),
  }

  return { log, researchBrief, researchData, images }
}

// ── Prompt builders ──

function buildSearchQuery(topic, region, title) {
  const parts = []
  if (topic && topic !== title) parts.push(topic)
  if (title) parts.push(title)
  if (region) parts.push(region)
  const query = parts.join(' ').slice(0, 200)
  return query || title || ''
}

function buildBackgroundPrompt(topic, tags, region, summary, newsResults) {
  const lines = [
    `Provide comprehensive background context for this news story.`,
    `Include: timeline of events, key people involved, causes, consequences, and any ongoing developments.`,
    ``,
    `Topic: ${topic}`,
    region ? `Region: ${region}` : '',
    tags.length > 0 ? `Tags: ${tags.join(', ')}` : '',
    summary ? `Summary: ${summary}` : '',
  ]

  if (newsResults.length > 0) {
    lines.push(``)
    lines.push(`Here are related articles found via Google News — please read them for additional context:`)
    for (const r of newsResults) {
      if (r.url) lines.push(`- ${r.title}: ${r.url}`)
    }
  }

  lines.push(``)
  lines.push(`Write in English. Be factual and detailed. Focus on answering:`)
  lines.push(`1. What happened?`)
  lines.push(`2. How did it happen?`)
  lines.push(`3. What was the result?`)

  return lines.filter(Boolean).join('\n')
}

function buildSynthesisPrompt({ topic, summary, uniqueAngle, tags, region, originalArticle, newsResults, perplexityContext, perplexityCitations }) {
  const relatedArticlesText = newsResults.map((r, i) =>
    `[Article ${i + 1}] ${r.title}\nURL: ${r.url}\nSource: ${r.source}\n${r.snippet}`
  ).join('\n\n')

  return `You are a senior researcher for an Arabic YouTube news channel.
Synthesize ALL the following sources into a structured research brief for a video script writer.

═══ ORIGINAL ARTICLE ═══
Topic: ${topic}
${summary ? `Summary: ${summary}` : ''}
${uniqueAngle ? `Unique Angle: ${uniqueAngle}` : ''}
${tags.length ? `Tags: ${tags.join(', ')}` : ''}
${region ? `Region: ${region}` : ''}

Article text (original language, truncated):
${originalArticle}

═══ RELATED ARTICLES (from Google News) ═══
${relatedArticlesText || 'No related articles found.'}

═══ BACKGROUND CONTEXT (from Perplexity) ═══
${perplexityContext || 'No background context available.'}
${perplexityCitations.length > 0 ? `\nCitations: ${perplexityCitations.join(', ')}` : ''}

═══ OUTPUT FORMAT ═══
Reply ONLY with valid JSON (no markdown fences, no extra text). Output all text fields in English (the article's original language). Use this exact structure:

{
  "whatHappened": "2-4 sentences in English — the core event",
  "howItHappened": "3-5 sentences in English — the process, causes, chain of events",
  "whatWasTheResult": "2-4 sentences in English — consequences, current status, future outlook",
  "keyFacts": ["fact 1 in English", "fact 2", "...up to 8 key facts"],
  "timeline": [{"date": "...", "event": "description in English"}],
  "mainCharacters": [{"name": "...", "role": "description in English"}],
  "sources": [{"title": "...", "url": "..."}],
  "competitionInsight": "1-2 sentences in English — leave blank or generic if no competition data available",
  "suggestedHook": "1 sentence — a compelling opening hook for the video in English",
  "narrativeStrength": 1-10
}`
}

function parseSynthesisResponse(raw) {
  if (!raw || typeof raw !== 'string') return null
  try {
    const trimmed = raw.trim()
    const start = trimmed.indexOf('{')
    const end = trimmed.lastIndexOf('}') + 1
    if (start === -1 || end <= start) return null
    return JSON.parse(trimmed.slice(start, end))
  } catch (e) {
    logger.warn({ error: e.message, snippet: (raw || '').slice(0, 200) }, '[storyResearcher] Failed to parse synthesis')
    return null
  }
}

// ── Quality evaluators ──

function evaluatePerplexityQuality(text, citations) {
  const issues = []
  const chars = (text || '').length
  if (!text || chars < 100) issues.push('Response too short')
  if (!citations || citations.length === 0) issues.push('No citations provided')
  if (chars < 500) issues.push('Brief response (< 500 chars)')
  const score = Math.max(0, 10 - issues.length * 3)
  return { score, chars, citationCount: (citations || []).length, issues: issues.length ? issues : null }
}

function evaluateSynthesisQuality(brief) {
  if (!brief) return { score: 0, issues: ['Failed to parse synthesis response'] }
  const issues = []
  const expectedKeys = ['whatHappened', 'howItHappened', 'whatWasTheResult', 'keyFacts', 'timeline', 'mainCharacters', 'suggestedHook', 'narrativeStrength']
  const filledKeys = expectedKeys.filter(k => brief[k] != null && brief[k] !== '' && !(Array.isArray(brief[k]) && brief[k].length === 0)).length
  if (filledKeys < 5) issues.push(`Only ${filledKeys}/8 key sections filled`)
  if (!brief.whatHappened) issues.push('Missing core: whatHappened')
  if (!brief.suggestedHook) issues.push('Missing suggestedHook')
  if (!Array.isArray(brief.keyFacts) || brief.keyFacts.length < 2) issues.push('Too few key facts')
  if (typeof brief.narrativeStrength === 'number' && brief.narrativeStrength < 4) issues.push(`Low narrative strength (${brief.narrativeStrength}/10)`)
  const score = Math.max(0, 10 - issues.length * 2)
  return { score, filled: filledKeys, total: expectedKeys.length, narrativeStrength: brief.narrativeStrength || null, issues: issues.length ? issues : null }
}

module.exports = { needsResearch, researchStory }
