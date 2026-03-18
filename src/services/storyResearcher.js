/**
 * Story Researcher — enriches a promoted story with multi-source research.
 *
 * Pipeline:
 *   1. Firecrawl Search — find related news articles on the web
 *   2. Perplexity Sonar — get background context & timeline
 *   3. DB Similarity — find similar stories already in our database
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
 * Determine if an article/story needs deep research.
 * @param {object} article - must have analysis, storyId
 * @param {object} project - must have API key fields
 * @returns {{ needed: boolean, reason: string }}
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

  if (!article.storyId) {
    return { needed: false, reason: 'Article was not promoted to a story' }
  }

  const analysis = article.analysis
  if (!analysis || analysis.parseError) {
    return { needed: false, reason: 'No valid classification — cannot build search query' }
  }

  const SKIP_TYPES = ['opinion']
  if (SKIP_TYPES.includes(analysis.contentType)) {
    return { needed: false, reason: `Content type "${analysis.contentType}" does not benefit from research` }
  }

  return { needed: true, reason: 'Story promoted with valid classification' }
}

/**
 * Run the full research pipeline for an article's associated story.
 * Returns a log array of sub-step results.
 *
 * @param {object} article - full article record (must have storyId, analysis, etc.)
 * @param {object} project - full project record with encrypted keys
 * @returns {Promise<{ log: Array<object>, researchBrief: object | null }>}
 */
async function researchStory(article, project) {
  const log = []
  const analysis = article.analysis || {}
  const topic = analysis.topic || article.title || ''
  const tags = Array.isArray(analysis.tags) ? analysis.tags : []
  const region = analysis.region || ''

  const searchQuery = buildSearchQuery(topic, tags, region, article.title)

  // ── Step 1: Firecrawl Search ──
  let firecrawlResults = []
  if (project.firecrawlApiKeyEncrypted) {
    try {
      const fcKey = decrypt(project.firecrawlApiKeyEncrypted)
      const result = await searchNews(fcKey, searchQuery, {
        limit: FIRECRAWL_RESULT_LIMIT,
        lang: article.language === 'ar' ? 'ar' : 'en',
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
      const bgPrompt = buildBackgroundPrompt(topic, tags, region, analysis.summary)
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
      const story = await db.story.findUnique({ where: { id: article.storyId }, select: { embedding: true } })
      if (story?.embedding) {
        const raw = await findSimilarVideos(story.embedding, project.id, 5)
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
        log.push({ step: 'db_similarity', status: 'skipped', reason: 'Story has no embedding', at: new Date().toISOString() })
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
        topic,
        summary: analysis.summary,
        uniqueAngle: analysis.uniqueAngle,
        tags,
        region,
        originalArticle: (article.contentAr || article.contentClean || '').slice(0, 8000),
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

  // ── Save research to Story ──
  if (article.storyId && (researchBrief || firecrawlResults.length > 0 || perplexityContext)) {
    try {
      const existing = await db.story.findUnique({ where: { id: article.storyId }, select: { brief: true } })
      const currentBrief = (existing?.brief && typeof existing.brief === 'object') ? existing.brief : {}

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

      await db.story.update({
        where: { id: article.storyId },
        data: {
          brief: { ...currentBrief, research: researchData },
        },
      })
      log.push({ step: 'save_research', status: 'ok', storyId: article.storyId, at: new Date().toISOString() })
    } catch (e) {
      log.push({ step: 'save_research', status: 'failed', error: e.message, at: new Date().toISOString() })
    }
  }

  return { log, researchBrief }
}

// ── Prompt builders ──

function buildSearchQuery(topic, tags, region, title) {
  const parts = []
  if (topic) parts.push(topic)
  else if (title) parts.push(title)
  if (region) parts.push(region)
  if (tags.length > 0) parts.push(tags.slice(0, 3).join(' '))
  return parts.join(' ').slice(0, 200)
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

Article text (truncated):
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
