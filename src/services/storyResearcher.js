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

  // Use original-language fields for web search (topicOriginal, title)
  // and Arabic fields for Perplexity/synthesis context
  const topicOriginal = analysis.topicOriginal || article.title || analysis.topic || ''
  const regionOriginal = analysis.regionOriginal || analysis.region || ''
  const topicArabic = analysis.topic || ''
  const tags = Array.isArray(analysis.tags) ? analysis.tags : []
  const region = analysis.region || ''

  const searchQuery = buildSearchQuery(topicOriginal, regionOriginal, article.title)

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
        log.push({ step: 'firecrawl_search', status: 'failed', error: result.error, query: searchQuery, at: new Date().toISOString() })
      } else {
        firecrawlResults = result.results || []
        log.push({
          step: 'firecrawl_search', status: 'ok',
          query: searchQuery,
          resultsCount: firecrawlResults.length,
          titles: firecrawlResults.map(r => r.title).filter(Boolean),
          at: new Date().toISOString(),
        })
      }
    } catch (e) {
      log.push({ step: 'firecrawl_search', status: 'failed', error: e.message, at: new Date().toISOString() })
    }
  } else {
    log.push({ step: 'firecrawl_search', status: 'skipped', reason: 'No Firecrawl key', at: new Date().toISOString() })
  }

  // ── Step 2: Perplexity Background Context ──
  let perplexityContext = null
  let perplexityCitations = []
  if (project.perplexityApiKeyEncrypted) {
    try {
      const pxKey = decrypt(project.perplexityApiKeyEncrypted)
      const bgPrompt = buildBackgroundPrompt(topicOriginal, topicArabic, tags, regionOriginal, analysis.summary)
      const result = await queryPerplexity(pxKey, bgPrompt, { maxTokens: PERPLEXITY_MAX_TOKENS })
      perplexityContext = result.text || null
      perplexityCitations = result.citations || []
      log.push({
        step: 'perplexity_context', status: perplexityContext ? 'ok' : 'empty',
        chars: (perplexityContext || '').length,
        citations: perplexityCitations.length,
        at: new Date().toISOString(),
      })
    } catch (e) {
      log.push({ step: 'perplexity_context', status: 'failed', error: e.message, at: new Date().toISOString() })
    }
  } else {
    log.push({ step: 'perplexity_context', status: 'skipped', reason: 'No Perplexity key', at: new Date().toISOString() })
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
          step: 'db_similarity', status: 'ok',
          matchCount: similarVideos.length,
          topMatch: similarVideos[0]?.title || null,
          at: new Date().toISOString(),
        })
      } else {
        log.push({ step: 'db_similarity', status: 'skipped', reason: 'Not enough text for embedding', at: new Date().toISOString() })
      }
    } catch (e) {
      log.push({ step: 'db_similarity', status: 'failed', error: e.message, at: new Date().toISOString() })
    }
  } else {
    log.push({ step: 'db_similarity', status: 'skipped', reason: 'No embedding key', at: new Date().toISOString() })
  }

  // ── Step 4: Claude Synthesis ──
  let researchBrief = null
  if (project.anthropicApiKeyEncrypted) {
    try {
      const anthropicKey = decrypt(project.anthropicApiKeyEncrypted)
      const synthesisPrompt = buildSynthesisPrompt({
        topicOriginal,
        topicArabic,
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

      researchBrief = parseSynthesisResponse(raw)
      log.push({
        step: 'synthesis', status: researchBrief ? 'ok' : 'parse_error',
        model: 'claude-sonnet-4-6',
        briefKeys: researchBrief ? Object.keys(researchBrief) : [],
        at: new Date().toISOString(),
      })
    } catch (e) {
      log.push({ step: 'synthesis', status: 'failed', error: e.message, at: new Date().toISOString() })
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

function buildSearchQuery(topicOriginal, regionOriginal, title) {
  const parts = []
  if (topicOriginal && topicOriginal !== title) parts.push(topicOriginal)
  if (title) parts.push(title)
  if (regionOriginal) parts.push(regionOriginal)
  const query = parts.join(' ').slice(0, 200)
  return query || title || ''
}

function buildBackgroundPrompt(topicOriginal, topicArabic, tags, regionOriginal, summary) {
  return [
    `Provide comprehensive background context for this news story.`,
    `Include: timeline of events, key people involved, causes, consequences, and any ongoing developments.`,
    ``,
    `Topic: ${topicOriginal}`,
    topicArabic ? `Topic (Arabic): ${topicArabic}` : '',
    regionOriginal ? `Region: ${regionOriginal}` : '',
    tags.length > 0 ? `Tags: ${tags.join(', ')}` : '',
    summary ? `Summary: ${summary}` : '',
    ``,
    `Write in Arabic. Be factual and detailed. Focus on answering:`,
    `1. ماذا حدث؟ (What happened?)`,
    `2. كيف حدث؟ (How did it happen?)`,
    `3. ما النتيجة؟ (What was the result?)`,
  ].filter(Boolean).join('\n')
}

function buildSynthesisPrompt({ topicOriginal, topicArabic, summary, uniqueAngle, tags, region, originalArticle, firecrawlResults, perplexityContext, perplexityCitations, similarVideos }) {
  const relatedArticlesText = firecrawlResults.map((r, i) =>
    `[Article ${i + 1}] ${r.title}\nURL: ${r.url}\n${r.markdown ? r.markdown.slice(0, 3000) : r.snippet}`
  ).join('\n\n')

  const competitionText = similarVideos.length > 0
    ? similarVideos.map(v => `- "${v.title}" (${v.views.toLocaleString()} views, ${v.channel}, similarity: ${v.similarity})`).join('\n')
    : 'No similar competition videos found.'

  return `You are a senior researcher for an Arabic YouTube news channel.
Synthesize ALL the following sources into a structured research brief for a video script writer.

═══ ORIGINAL ARTICLE ═══
Topic: ${topicOriginal}
${topicArabic ? `Topic (Arabic): ${topicArabic}` : ''}
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

module.exports = { needsResearch, researchStory }
