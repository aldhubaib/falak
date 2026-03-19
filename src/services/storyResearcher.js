/**
 * Story Researcher — enriches an article with multi-source research.
 *
 * Runs BEFORE translation so all web searches use the article's original language.
 *
 * Pipeline:
 *   1. Firecrawl Search — find related news articles on the web (original language)
 *   2. Perplexity Sonar — get background context & timeline
 *   3. DB Similarity — find similar videos via embeddings
 *   4. Claude Synthesis — combine everything into a structured research brief
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
const { findSimilarVideos } = require('./embeddings')
const logger = require('../lib/logger')

const FIRECRAWL_RESULT_LIMIT = 5
const PERPLEXITY_MAX_TOKENS = 2048
const SYNTHESIS_MAX_TOKENS = 4096

/**
 * Determine if an article needs deep research.
 * Called after classify (analysis exists) but before translation.
 */
function needsResearch(article, project) {
  const hasFirecrawl = !!project.firecrawlApiKeyEncrypted
  const hasPerplexity = !!project.perplexityApiKeyEncrypted
  const hasAnthropic = !!project.anthropicApiKeyEncrypted

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
    return { needed: false, reason: `Content type "${analysis.contentType}" does not benefit from research` }
  }

  return { needed: true, reason: 'Classified article ready for research' }
}

/**
 * Run the full research pipeline for an article.
 * Returns research data to be stored on article.analysis.research and later
 * included in the Story brief when the score stage creates it.
 */
async function researchStory(article, project) {
  const log = []
  const analysis = article.analysis || {}

  // Classification is now in original language — use directly
  const topic = analysis.topic || article.title || ''
  const region = analysis.region || ''
  const tags = Array.isArray(analysis.tags) ? analysis.tags : []

  const searchQuery = buildSearchQuery(topic, region, article.title)

  // ── Step 1: Firecrawl Search (original language) ──
  let firecrawlResults = []
  if (project.firecrawlApiKeyEncrypted) {
    try {
      const fcKey = decrypt(project.firecrawlApiKeyEncrypted)
      const lang = (article.language === 'ar') ? 'ar' : 'en'
      const result = await searchNews(fcKey, searchQuery, {
        limit: FIRECRAWL_RESULT_LIMIT,
        lang,
      })
      if (result.error) {
        log.push({ step: 'firecrawl_search', processor: 'api', service: 'Firecrawl Search API', status: 'failed', error: result.error, query: searchQuery, at: new Date().toISOString() })
      } else {
        firecrawlResults = result.results || []
        log.push({
          step: 'firecrawl_search', processor: 'api', service: 'Firecrawl Search API',
          status: 'ok',
          query: searchQuery,
          resultsCount: firecrawlResults.length,
          titles: firecrawlResults.map(r => r.title).filter(Boolean),
          snippets: firecrawlResults.map(r => (r.snippet || '').slice(0, 200)).filter(Boolean),
          at: new Date().toISOString(),
        })
      }
    } catch (e) {
      log.push({ step: 'firecrawl_search', processor: 'api', service: 'Firecrawl Search API', status: 'failed', error: e.message, at: new Date().toISOString() })
    }
  } else {
    log.push({ step: 'firecrawl_search', processor: 'api', service: 'Firecrawl Search API', status: 'skipped', reason: 'No Firecrawl key', at: new Date().toISOString() })
  }

  // ── Step 2: Perplexity Background Context ──
  let perplexityContext = null
  let perplexityCitations = []
  if (project.perplexityApiKeyEncrypted) {
    try {
      const pxKey = decrypt(project.perplexityApiKeyEncrypted)
      const bgPrompt = buildBackgroundPrompt(topic, tags, region, analysis.summary)
      const result = await queryPerplexity(pxKey, bgPrompt, { maxTokens: PERPLEXITY_MAX_TOKENS })
      perplexityContext = result.text || null
      perplexityCitations = result.citations || []
      const pxQuality = evaluatePerplexityQuality(perplexityContext, perplexityCitations)
      log.push({
        step: 'perplexity_context', processor: 'ai', service: 'Perplexity Sonar',
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
      log.push({ step: 'perplexity_context', processor: 'ai', service: 'Perplexity Sonar', status: 'failed', error: e.message, at: new Date().toISOString() })
    }
  } else {
    log.push({ step: 'perplexity_context', processor: 'ai', service: 'Perplexity Sonar', status: 'skipped', reason: 'No Perplexity key', at: new Date().toISOString() })
  }

  // ── Step 3: DB Similarity (find related competition videos) ──
  let similarVideos = []
  if (project.embeddingApiKeyEncrypted) {
    try {
      const { generateEmbedding, buildEmbeddingText } = require('./embeddings')
      const embText = buildEmbeddingText({
        topic: analysis.topic,
        tags: analysis.tags,
        summary: analysis.summary,
        contentType: analysis.contentType,
        region: analysis.region,
        uniqueAngle: analysis.uniqueAngle,
      })
      if (embText.length > 10) {
        const emb = await generateEmbedding(embText, project)
        const raw = await findSimilarVideos(emb, project.id, 5)
        similarVideos = (raw || []).map(v => ({
          title: v.titleAr || '',
          views: v.viewCount || 0,
          channel: v.channelName || '',
          similarity: typeof v.similarity === 'number' ? Math.round(v.similarity * 100) / 100 : null,
          type: v.videoType || '',
        }))
        log.push({
          step: 'db_similarity',
          processor: 'api', service: 'OpenAI Embeddings + pgvector',
          status: 'ok',
          embeddingInputChars: embText.length,
          matchCount: similarVideos.length,
          topMatch: similarVideos[0]?.title || null,
          at: new Date().toISOString(),
        })
      } else {
        log.push({ step: 'db_similarity', processor: 'server', service: 'Local check', status: 'skipped', reason: 'Not enough text for embedding', at: new Date().toISOString() })
      }
    } catch (e) {
      log.push({ step: 'db_similarity', processor: 'api', service: 'OpenAI Embeddings + pgvector', status: 'failed', error: e.message, at: new Date().toISOString() })
    }
  } else {
    log.push({ step: 'db_similarity', processor: 'api', service: 'OpenAI Embeddings', status: 'skipped', reason: 'No embedding key', at: new Date().toISOString() })
  }

  // ── Step 4: Claude Synthesis ──
  let researchBrief = null
  if (project.anthropicApiKeyEncrypted) {
    try {
      const anthropicKey = decrypt(project.anthropicApiKeyEncrypted)
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
        similarVideos,
      })

      const raw = await callAnthropic(anthropicKey, 'claude-sonnet-4-6', [
        { role: 'user', content: synthesisPrompt },
      ], {
        maxTokens: SYNTHESIS_MAX_TOKENS,
        projectId: project.id,
        action: 'story-research-synthesis',
      })
      const synthesisUsage = callAnthropic._lastUsage || {}

      researchBrief = parseSynthesisResponse(raw)
      const synthQuality = evaluateSynthesisQuality(researchBrief)
      log.push({
        step: 'synthesis', processor: 'ai', service: 'Anthropic Claude Sonnet',
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
      log.push({ step: 'synthesis', processor: 'ai', service: 'Anthropic Claude Sonnet', status: 'failed', error: e.message, at: new Date().toISOString() })
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
    similarVideos,
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
    `Write in Arabic. Be factual and detailed. Focus on answering:`,
    `1. ماذا حدث؟ (What happened?)`,
    `2. كيف حدث؟ (How did it happen?)`,
    `3. ما النتيجة؟ (What was the result?)`,
  ].filter(Boolean).join('\n')
}

function buildSynthesisPrompt({ topic, summary, uniqueAngle, tags, region, originalArticle, firecrawlResults, perplexityContext, perplexityCitations, similarVideos }) {
  const relatedArticlesText = firecrawlResults.map((r, i) =>
    `[Article ${i + 1}] ${r.title}\nURL: ${r.url}\n${r.markdown ? r.markdown.slice(0, 3000) : r.snippet}`
  ).join('\n\n')

  const competitionText = similarVideos.length > 0
    ? similarVideos.map(v => `- "${v.title}" (${v.views.toLocaleString()} views, ${v.channel}, similarity: ${v.similarity})`).join('\n')
    : 'No similar competition videos found.'

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

═══ COMPETITION ANALYSIS ═══
${competitionText}

═══ OUTPUT FORMAT ═══
Reply ONLY with valid JSON (no markdown fences, no extra text). Use this exact structure:

{
  "whatHappened": "2-4 sentences in Arabic — the core event",
  "howItHappened": "3-5 sentences in Arabic — the process, causes, chain of events",
  "whatWasTheResult": "2-4 sentences in Arabic — consequences, current status, future outlook",
  "keyFacts": ["fact 1 in Arabic", "fact 2", "...up to 8 key facts"],
  "timeline": [{"date": "...", "event": "description in Arabic"}],
  "mainCharacters": [{"name": "...", "role": "description in Arabic"}],
  "sources": [{"title": "...", "url": "..."}],
  "competitionInsight": "1-2 sentences in Arabic about how competitors covered this or similar topics",
  "suggestedHook": "1 sentence — a compelling opening hook for the video in Arabic",
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
