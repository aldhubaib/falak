/**
 * Article pipeline stage processors.
 * Each function receives { article, project } and returns { nextStage } or { nextStage, reviewStatus }.
 *
 * Stages: imported → content → translated → ai_analysis → done
 */
const db = require('../lib/db')
const { decrypt } = require('./crypto')
const { scrapeUrl, preClean } = require('./firecrawl')
const { fetchArticleText } = require('./articleFetcher')
const { callAnthropic } = require('./pipelineProcessor')
const { trackUsage } = require('./usageTracker')
const logger = require('../lib/logger')

const MIN_CONTENT_LENGTH = 300
const ARABIC_CHAR_REGEX = /[\u0600-\u06FF]/g

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

function stripHtml(text) {
  if (!text || typeof text !== 'string') return ''
  return text
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function detectLanguage(text) {
  if (!text) return 'unknown'
  const cleaned = text.replace(/\s/g, '')
  if (cleaned.length === 0) return 'unknown'
  const arabicChars = (text.match(ARABIC_CHAR_REGEX) || []).length
  if (arabicChars / cleaned.length > 0.3) return 'ar'
  return 'other'
}

// ── Stage 1: imported → content ──────────────────────────────────────────────

async function doStageImported(article, project) {
  return { nextStage: 'content' }
}

// ── Stage 2: content ─────────────────────────────────────────────────────────

async function doStageContent(article, project) {
  const rawContent = article.content || ''
  const cleanedContent = stripHtml(rawContent).trim()

  if (cleanedContent.length >= MIN_CONTENT_LENGTH) {
    await db.article.update({
      where: { id: article.id },
      data: { contentClean: cleanedContent },
    })
    return { nextStage: 'translated' }
  }

  // Content is short/missing — try to fetch the full article
  let fetchedText = null

  if (project.firecrawlApiKeyEncrypted) {
    try {
      const apiKey = decrypt(project.firecrawlApiKeyEncrypted)
      const result = await scrapeUrl(apiKey, article.url)
      if (result.text) {
        fetchedText = preClean(result.text)
      }
    } catch (e) {
      logger.warn({ articleId: article.id, error: e.message }, '[articleProcessor] Firecrawl failed, trying fallback')
    }
  }

  if (!fetchedText) {
    try {
      const result = await fetchArticleText(article.url)
      if (result.text) fetchedText = result.text
    } catch (e) {
      logger.warn({ articleId: article.id, error: e.message }, '[articleProcessor] fallback fetch failed')
    }
  }

  if (fetchedText && fetchedText.length >= MIN_CONTENT_LENGTH) {
    await db.article.update({
      where: { id: article.id },
      data: { contentClean: fetchedText },
    })
    return { nextStage: 'translated' }
  }

  // Still too short — check if we have at least title + description to work with
  const fallbackText = [article.title, article.description, cleanedContent].filter(Boolean).join('\n\n').trim()
  if (fallbackText.length >= 100) {
    await db.article.update({
      where: { id: article.id },
      data: { contentClean: fallbackText },
    })
    return { nextStage: 'translated' }
  }

  // Nothing usable — send to review
  return { nextStage: 'content', reviewStatus: 'review', reviewReason: 'No usable content found' }
}

// ── Stage 3: translated ──────────────────────────────────────────────────────

async function doStageTranslated(article, project) {
  const text = article.contentClean || article.content || ''
  if (!text.trim()) {
    return { nextStage: 'translated', reviewStatus: 'review', reviewReason: 'No content to translate' }
  }

  const sourceLang = article.language || detectLanguage(text)

  if (sourceLang === 'ar') {
    await db.article.update({
      where: { id: article.id },
      data: {
        contentAr: text,
        language: 'ar',
      },
    })
    return { nextStage: 'ai_analysis' }
  }

  if (!project.anthropicApiKeyEncrypted) {
    throw new Error('Anthropic API key not configured. Go to Settings to add it.')
  }
  const apiKey = decrypt(project.anthropicApiKeyEncrypted)

  const truncated = text.slice(0, 30000)
  const translated = await callAnthropic(apiKey, 'claude-haiku-4-5-20251001', [
    {
      role: 'user',
      content: `Translate this news article to Arabic.\n` +
        `Preserve all names, dates, locations, and facts exactly.\n` +
        `Keep a journalistic tone. Output the Arabic text only, no commentary.\n\n` +
        truncated,
    },
  ], {
    maxTokens: 4096,
    projectId: article.projectId,
    action: 'article-translate',
  })

  if (!translated || translated.trim().length < 50) {
    throw new Error('Translation returned empty or too short result')
  }

  await db.article.update({
    where: { id: article.id },
    data: {
      contentAr: translated.trim(),
      language: sourceLang === 'unknown' ? 'other' : sourceLang,
    },
  })

  return { nextStage: 'ai_analysis' }
}

// ── Stage 4: ai_analysis ─────────────────────────────────────────────────────

async function doStageAiAnalysis(article, project) {
  if (!project.anthropicApiKeyEncrypted) {
    throw new Error('Anthropic API key not configured. Go to Settings to add it.')
  }
  const apiKey = decrypt(project.anthropicApiKeyEncrypted)

  const articleText = (article.contentAr || article.contentClean || article.content || '').slice(0, 20000)
  const title = article.title || ''
  const existingTags = Array.isArray(article.analysis?.tags) ? article.analysis.tags : []
  const category = article.analysis?.category || ''

  const prompt = `You are a news analyst for an Arabic YouTube channel. Classify this article.\n` +
    `Reply in JSON only, no markdown fences, no explanation.\n\n` +
    `Keys:\n` +
    `- topic: one short sentence in Arabic describing what this article is about\n` +
    `- tags: 4 to 8 tags in Arabic (noun form, 1-3 words each, reusable across articles)\n` +
    `- sentiment: "positive" | "negative" | "neutral"\n` +
    `- contentType: "news" | "investigation" | "feature" | "opinion" | "human_interest" | "crime" | "politics" | "technology" | "other"\n` +
    `- region: the country or city in Arabic where the main event takes place, or null\n` +
    `- viralPotential: 0.0 to 1.0 — how likely this will get views on Arabic YouTube\n` +
    `- relevance: 0.0 to 1.0 — how relevant is this to Arabic audiences interested in true crime, mysteries, investigations, and untold stories\n` +
    `- summary: 2-3 sentence summary in Arabic\n` +
    `- isBreaking: true if the event happened in the last 48 hours\n` +
    `- uniqueAngle: one sentence in Arabic about what makes this story unique, or null\n\n` +
    `Title: ${title}\n` +
    (existingTags.length ? `Scraper tags: ${existingTags.join(', ')}\n` : '') +
    (category ? `Category: ${category}\n` : '') +
    `\nArticle:\n${articleText}`

  const raw = await callAnthropic(apiKey, 'claude-haiku-4-5-20251001', [
    { role: 'user', content: prompt },
  ], {
    maxTokens: 2048,
    projectId: article.projectId,
    action: 'article-classify',
  })

  let analysis
  try {
    const trimmed = (raw || '').trim()
    const start = trimmed.indexOf('{')
    const end = trimmed.lastIndexOf('}') + 1
    if (start === -1 || end <= start) throw new Error('No JSON in response')
    analysis = JSON.parse(trimmed.slice(start, end))
  } catch (e) {
    logger.warn({ articleId: article.id, raw: (raw || '').slice(0, 200) }, '[articleProcessor] Failed to parse classification')
    analysis = { raw, parseError: true }
  }

  const relevance = typeof analysis.relevance === 'number' ? analysis.relevance : 0
  const viralPotential = typeof analysis.viralPotential === 'number' ? analysis.viralPotential : 0

  const daysSincePublished = article.publishedAt
    ? Math.max(0, (Date.now() - new Date(article.publishedAt).getTime()) / 86400000)
    : 14
  const freshness = Math.exp(-daysSincePublished / 7 * Math.LN2)

  const rankScore = Math.round((
    relevance * 0.35 +
    viralPotential * 0.30 +
    freshness * 0.35
  ) * 100) / 100

  const reasons = []
  if (relevance >= 0.7) reasons.push('high-relevance')
  if (viralPotential >= 0.7) reasons.push('viral-potential')
  if (freshness >= 0.7) reasons.push('fresh')
  if (analysis.isBreaking) reasons.push('breaking')

  await db.article.update({
    where: { id: article.id },
    data: {
      analysis,
      relevanceScore: relevance,
      rankScore,
      rankReason: reasons.join(', ') || null,
    },
  })

  // Promote to Story if above threshold
  const PROMOTION_THRESHOLD = 0.5
  if (relevance >= PROMOTION_THRESHOLD && !analysis.parseError) {
    try {
      await promoteToStory(article, analysis, relevance, viralPotential, rankScore)
    } catch (e) {
      logger.warn({ articleId: article.id, error: e.message }, '[articleProcessor] Story promotion failed (non-fatal)')
    }
  }

  return { nextStage: 'done' }
}

async function promoteToStory(article, analysis, relevance, viralPotential, rankScore) {
  const headline = analysis.topic || article.title || ''
  if (!headline.trim()) return

  const existing = await db.story.findFirst({
    where: { projectId: article.projectId, headline: headline.trim() },
    select: { id: true },
  })
  if (existing) {
    await db.article.update({
      where: { id: article.id },
      data: { storyId: existing.id },
    })
    return
  }

  const relevanceScore = Math.round(relevance * 100)
  const viralScore = Math.round(viralPotential * 100)
  const firstMoverScore = analysis.isBreaking ? 80 : 40
  const compositeScore = Math.round((relevanceScore * 0.35 + viralScore * 0.40 + firstMoverScore * 0.25) / 10 * 10) / 10

  const story = await db.story.create({
    data: {
      projectId: article.projectId,
      headline: headline.trim(),
      stage: 'suggestion',
      sourceUrl: article.url,
      sourceName: 'Article Pipeline',
      sourceDate: article.publishedAt,
      relevanceScore,
      viralScore,
      firstMoverScore,
      compositeScore,
      brief: {
        articleContent: article.contentAr || article.contentClean,
        articleTitle: article.title,
        summary: analysis.summary || null,
        tags: analysis.tags || [],
        region: analysis.region || null,
        contentType: analysis.contentType || null,
        uniqueAngle: analysis.uniqueAngle || null,
        articleId: article.id,
      },
    },
  })

  await db.article.update({
    where: { id: article.id },
    data: { storyId: story.id },
  })
}

module.exports = {
  doStageImported,
  doStageContent,
  doStageTranslated,
  doStageAiAnalysis,
}
