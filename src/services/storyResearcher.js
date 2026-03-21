/**
 * Story Researcher — enriches an article with multi-source research.
 *
 * Runs BEFORE translation so all web searches use the article's original language.
 *
 * Pipeline:
 *   1. Firecrawl Search — find related news articles on the web (original language)
 *   2. Perplexity Sonar — get background context & timeline
 *   3. Claude Synthesis — combine everything into a structured research brief
 * (DB Similarity runs in the scoring stage after translation, Arabic vs Arabic.)
 *
 * The brief answers the core storytelling questions:
 *   - What happened?
 *   - How did it happen?
 *   - What was the result?
 */
const db = require('../lib/db')
const { decrypt } = require('./crypto')
const { searchNews } = require('./firecrawl')
const { queryPerplexity } = require('./perplexity')
const { callAnthropic } = require('./pipelineProcessor')
const logger = require('../lib/logger')

const FIRECRAWL_RESULT_LIMIT = 5
const PERPLEXITY_MAX_TOKENS = 2048
const SYNTHESIS_MAX_TOKENS = 4096

/**
 * Determine if an article needs deep research.
 * Called after classify (analysis exists) but before translation.
 */
async function needsResearch(article) {
  const [fcKey, pxKey, anKey] = await Promise.all([
    db.apiKey.findUnique({ where: { service: 'firecrawl' } }),
    db.apiKey.findUnique({ where: { service: 'perplexity' } }),
    db.apiKey.findUnique({ where: { service: 'anthropic' } }),
  ])
  const hasFirecrawl = !!fcKey?.encryptedKey
  const hasPerplexity = !!pxKey?.encryptedKey
  const hasAnthropic = !!anKey?.encryptedKey

  if (!hasFirecrawl && !hasPerplexity) {
    return { needed: false, reason: 'No research API keys (Firecrawl/Perplexity) configured' }
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

/**
 * Run the full research pipeline for an article.
 * Returns research data to be stored on article.analysis.research and later
 * included in the Story brief when the score stage creates it.
 */
async function researchStory(article, channelId) {
  const log = []
  const analysis = article.analysis || {}

  // Classification is now in original language — use directly
  const topic = analysis.topic || article.title || ''
  const region = analysis.region || ''
  const tags = Array.isArray(analysis.tags) ? analysis.tags : []

  const searchQuery = buildSearchQuery(topic, region, article.title)

  // ── Step 1: Firecrawl Search (original language) ──
  let firecrawlResults = []
  const fcKey = await db.apiKey.findUnique({ where: { service: 'firecrawl' } })
  if (fcKey?.encryptedKey) {
    try {
      const fcApiKey = decrypt(fcKey.encryptedKey)
      const lang = (article.language === 'ar') ? 'ar' : 'en'
      const result = await searchNews(fcApiKey, searchQuery, {
        limit: FIRECRAWL_RESULT_LIMIT,
        lang,
      })
      if (result.error) {
        log.push({ step: 'firecrawl_search', stage: 'research', label: 'Web Search', icon: 'search', subtitle: 'Related articles via search', processor: 'api', service: 'Firecrawl Search API', status: 'failed', error: result.error, query: searchQuery, at: new Date().toISOString() })
      } else {
        firecrawlResults = result.results || []
        log.push({
          step: 'firecrawl_search', stage: 'research', label: 'Web Search', icon: 'search', subtitle: 'Related articles via search',
          processor: 'api', service: 'Firecrawl Search API',
          status: 'ok',
          query: searchQuery,
          resultsCount: firecrawlResults.length,
          titles: firecrawlResults.map(r => r.title).filter(Boolean),
          snippets: firecrawlResults.map(r => (r.snippet || '').slice(0, 200)).filter(Boolean),
          at: new Date().toISOString(),
        })
      }
    } catch (e) {
      log.push({ step: 'firecrawl_search', stage: 'research', label: 'Web Search', icon: 'search', subtitle: 'Related articles via search', processor: 'api', service: 'Firecrawl Search API', status: 'failed', error: e.message, at: new Date().toISOString() })
    }
  } else {
    log.push({ step: 'firecrawl_search', stage: 'research', label: 'Web Search', icon: 'search', subtitle: 'Related articles via search', processor: 'api', service: 'Firecrawl Search API', status: 'skipped', reason: 'No Firecrawl key', at: new Date().toISOString() })
  }

  // ── Step 2: Perplexity Background Context ──
  let perplexityContext = null
  let perplexityCitations = []
  const pxKey = await db.apiKey.findUnique({ where: { service: 'perplexity' } })
  if (pxKey?.encryptedKey) {
    try {
      const pxApiKey = decrypt(pxKey.encryptedKey)
      const bgPrompt = buildBackgroundPrompt(topic, tags, region, analysis.summary)
      const result = await queryPerplexity(pxApiKey, bgPrompt, { maxTokens: PERPLEXITY_MAX_TOKENS })
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
  const anKey = await db.apiKey.findUnique({ where: { service: 'anthropic' } })
  if (anKey?.encryptedKey) {
    try {
      const anthropicKey = decrypt(anKey.encryptedKey)
      const synthesisPrompt = buildSynthesisPrompt({
        topic,
        summary: analysis.summary,
        uniqueAngle: analysis.uniqueAngle,
        tags,
        region,
        originalArticle: (article.contentClean || article.content || '').slice(0, 8000),
        firecrawlResults,
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

  // Build research data package (will be stored on article.analysis.research,
  // then included in story brief when score stage promotes)
  const researchData = {
    relatedArticles: firecrawlResults.map(r => ({
      title: r.title,
      url: r.url,
      snippet: r.snippet,
    })),
    backgroundContext: perplexityContext,
    citations: perplexityCitations,
    brief: researchBrief,
    researchedAt: new Date().toISOString(),
  }

  return { log, researchBrief, researchData }
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

function buildBackgroundPrompt(topic, tags, region, summary) {
  return [
    `Provide comprehensive background context for this news story.`,
    `Include: timeline of events, key people involved, causes, consequences, and any ongoing developments.`,
    ``,
    `Topic: ${topic}`,
    region ? `Region: ${region}` : '',
    tags.length > 0 ? `Tags: ${tags.join(', ')}` : '',
    summary ? `Summary: ${summary}` : '',
    ``,
    `Write in English. Be factual and detailed. Focus on answering:`,
    `1. What happened?`,
    `2. How did it happen?`,
    `3. What was the result?`,
  ].filter(Boolean).join('\n')
}

function buildSynthesisPrompt({ topic, summary, uniqueAngle, tags, region, originalArticle, firecrawlResults, perplexityContext, perplexityCitations }) {
  const relatedArticlesText = firecrawlResults.map((r, i) =>
    `[Article ${i + 1}] ${r.title}\nURL: ${r.url}\n${r.markdown ? r.markdown.slice(0, 3000) : r.snippet}`
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

═══ RELATED ARTICLES (from web search) ═══
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
