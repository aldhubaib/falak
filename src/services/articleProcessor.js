/**
 * Article pipeline stage processors.
 * Each function receives { article, project } and returns { nextStage } or { nextStage, reviewStatus }.
 *
 * Stages: imported → content → classify → research → translated → score → done
 *
 * Key design: classify and research run on ORIGINAL language content so web
 * searches find results in the source language. Translation happens after
 * research, and scoring/promotion happen last with full data.
 */
const db = require('../lib/db')
const { decrypt } = require('./crypto')
const { scrapeUrl, preClean } = require('./firecrawl')
const { fetchArticleText } = require('./articleFetcher')
const { callAnthropic } = require('./pipelineProcessor')
const { needsResearch, researchStory } = require('./storyResearcher')
const logger = require('../lib/logger')

const MIN_CONTENT_LENGTH = 300
const ARABIC_CHAR_REGEX = /[\u0600-\u06FF]/g
const PREVIEW_LENGTH = 500

function preview(text) {
  if (!text || typeof text !== 'string') return null
  return text.length > PREVIEW_LENGTH ? text.slice(0, PREVIEW_LENGTH) + '…' : text
}

function stripHtml(text) {
  if (!text || typeof text !== 'string') return ''
  return text
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, '')
    .replace(/<\/(p|div|section|article|blockquote|li|tr|h[1-6])>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
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

function getLog(article) {
  return Array.isArray(article.processingLog) ? [...article.processingLog] : []
}

async function saveLog(articleId, log) {
  await db.article.update({ where: { id: articleId }, data: { processingLog: log } })
}

// ── Stage 1: imported → content ──────────────────────────────────────────────

async function doStageImported(article, project) {
  const log = getLog(article)
  log.push({
    step: 'imported', status: 'ok', at: new Date().toISOString(),
    rawChars: (article.content || '').length,
    titlePreview: article.title || null,
    contentPreview: preview(article.content),
  })
  await saveLog(article.id, log)
  return { nextStage: 'content' }
}

// ── Stage 2: content → classify ─────────────────────────────────────────────

async function doStageContent(article, project) {
  const log = getLog(article)
  const rawContent = article.content || ''
  const cleanedContent = stripHtml(rawContent).trim()

  log.push({
    step: 'apify_content', chars: cleanedContent.length, threshold: MIN_CONTENT_LENGTH,
    at: new Date().toISOString(), contentPreview: preview(cleanedContent),
  })

  if (cleanedContent.length >= MIN_CONTENT_LENGTH) {
    log.push({ step: 'content_source', source: 'apify', chars: cleanedContent.length, status: 'ok' })
    await db.article.update({
      where: { id: article.id },
      data: { contentClean: cleanedContent, processingLog: log },
    })
    return { nextStage: 'classify' }
  }

  let fetchedText = null
  if (project.firecrawlApiKeyEncrypted) {
    try {
      const apiKey = decrypt(project.firecrawlApiKeyEncrypted)
      const result = await scrapeUrl(apiKey, article.url)
      if (result.text) {
        fetchedText = preClean(result.text)
        log.push({ step: 'firecrawl', status: 'ok', chars: fetchedText.length })
      } else {
        log.push({ step: 'firecrawl', status: 'failed', error: result.error || 'No text returned' })
      }
    } catch (e) {
      log.push({ step: 'firecrawl', status: 'failed', error: e.message })
    }
  } else {
    log.push({ step: 'firecrawl', status: 'skipped', reason: 'No API key' })
  }

  if (!fetchedText) {
    try {
      const result = await fetchArticleText(article.url)
      if (result.text) {
        fetchedText = result.text
        log.push({ step: 'html_fetch', status: 'ok', chars: fetchedText.length })
      } else {
        log.push({ step: 'html_fetch', status: 'failed', error: result.error || 'No text extracted' })
      }
    } catch (e) {
      log.push({ step: 'html_fetch', status: 'failed', error: e.message })
    }
  }

  if (fetchedText && fetchedText.length >= MIN_CONTENT_LENGTH) {
    log.push({ step: 'content_source', source: 'firecrawl_or_html', chars: fetchedText.length, status: 'ok' })
    await db.article.update({
      where: { id: article.id },
      data: { contentClean: fetchedText, processingLog: log },
    })
    return { nextStage: 'classify' }
  }

  const fallbackText = [article.title, article.description, cleanedContent].filter(Boolean).join('\n\n').trim()
  if (fallbackText.length >= 100) {
    log.push({ step: 'content_source', source: 'title_desc_fallback', chars: fallbackText.length, status: 'ok' })
    await db.article.update({
      where: { id: article.id },
      data: { contentClean: fallbackText, processingLog: log },
    })
    return { nextStage: 'classify' }
  }

  log.push({ step: 'content_source', source: 'none', status: 'review', reason: 'No usable content found' })
  await saveLog(article.id, log)
  return { nextStage: 'content', reviewStatus: 'review', reviewReason: 'No usable content found' }
}

// ── Stage 3: classify → research ────────────────────────────────────────────
// Runs on original language content. Outputs Arabic classification metadata.

async function doStageClassify(article, project) {
  if (!project.anthropicApiKeyEncrypted) {
    throw new Error('Anthropic API key not configured. Go to Settings to add it.')
  }
  const log = getLog(article)
  const apiKey = decrypt(project.anthropicApiKeyEncrypted)

  const articleText = (article.contentClean || article.content || '').slice(0, 20000)
  const title = article.title || ''
  const existingTags = Array.isArray(article.analysis?.tags) ? article.analysis.tags : []
  const category = article.analysis?.category || ''
  const sourceLang = article.language || detectLanguage(articleText)

  const prompt = `You are a news analyst for an Arabic YouTube channel. Classify this article.\n` +
    `The article may be in any language — read it and output your analysis in Arabic.\n` +
    `Reply in JSON only, no markdown fences, no explanation.\n\n` +
    `Keys:\n` +
    `- topic: one short sentence in Arabic describing what this article is about\n` +
    `- topicOriginal: the same topic sentence but in the article's original language (for search)\n` +
    `- tags: 4 to 8 tags in Arabic (noun form, 1-3 words each, reusable across articles)\n` +
    `- sentiment: "positive" | "negative" | "neutral"\n` +
    `- contentType: "news" | "investigation" | "feature" | "opinion" | "human_interest" | "crime" | "politics" | "technology" | "other"\n` +
    `- region: the country or city in Arabic where the main event takes place, or null\n` +
    `- regionOriginal: same region but in the article's original language, or null\n` +
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
    analysis = { raw: (raw || '').slice(0, 500), parseError: true }
  }

  log.push({
    step: 'classify', status: analysis.parseError ? 'parse_error' : 'ok',
    topic: analysis.topic || null,
    tags: analysis.tags || [],
    sentiment: analysis.sentiment || null,
    contentType: analysis.contentType || null,
    region: analysis.region || null,
    summary: analysis.summary || null,
    uniqueAngle: analysis.uniqueAngle || null,
    viralPotential: typeof analysis.viralPotential === 'number' ? analysis.viralPotential : null,
    relevance: typeof analysis.relevance === 'number' ? analysis.relevance : null,
    isBreaking: !!analysis.isBreaking,
    inputChars: articleText.length,
    at: new Date().toISOString(),
  })

  await db.article.update({
    where: { id: article.id },
    data: {
      analysis,
      language: sourceLang === 'unknown' ? 'other' : sourceLang,
      processingLog: log,
    },
  })

  return { nextStage: 'research' }
}

// ── Stage 4: research → translated ──────────────────────────────────────────
// Runs BEFORE translation so web searches use the original language.

async function doStageResearch(article, project) {
  const log = getLog(article)

  const freshArticle = await db.article.findUnique({ where: { id: article.id } })
  const currentAnalysis = freshArticle?.analysis || article.analysis
  const decision = needsResearch({ ...article, analysis: currentAnalysis }, project)

  log.push({
    step: 'research_decision',
    needed: decision.needed,
    reason: decision.reason,
    at: new Date().toISOString(),
  })

  if (!decision.needed) {
    log.push({ step: 'research', status: 'skipped', reason: decision.reason, at: new Date().toISOString() })
    await saveLog(article.id, log)
    return { nextStage: 'translated' }
  }

  try {
    const fullArticle = await db.article.findUnique({
      where: { id: article.id },
      include: { source: { include: { project: true } } },
    })
    const result = await researchStory(fullArticle || article, project)

    for (const entry of result.log) {
      log.push(entry)
    }

    log.push({
      step: 'research',
      status: result.researchBrief ? 'ok' : 'partial',
      hasBrief: !!result.researchBrief,
      narrativeStrength: result.researchBrief?.narrativeStrength || null,
      at: new Date().toISOString(),
    })

    // Store research results on article.analysis so score stage can include them in the story
    if (result.researchBrief || result.researchData) {
      const existing = freshArticle?.analysis || article.analysis || {}
      await db.article.update({
        where: { id: article.id },
        data: {
          analysis: {
            ...existing,
            research: result.researchData || null,
          },
          processingLog: log,
        },
      })
    } else {
      await saveLog(article.id, log)
    }

    return { nextStage: 'translated' }
  } catch (e) {
    log.push({ step: 'research', status: 'failed', error: e.message, at: new Date().toISOString() })
    await saveLog(article.id, log)
    logger.warn({ articleId: article.id, error: e.message }, '[articleProcessor] Research failed (non-fatal, continuing to translated)')
    return { nextStage: 'translated' }
  }
}

// ── Stage 5: translated → score ─────────────────────────────────────────────

async function doStageTranslated(article, project) {
  const log = getLog(article)
  const text = article.contentClean || article.content || ''
  if (!text.trim()) {
    log.push({ step: 'translate', status: 'review', reason: 'No content to translate' })
    await saveLog(article.id, log)
    return { nextStage: 'translated', reviewStatus: 'review', reviewReason: 'No content to translate' }
  }

  const sourceLang = article.language || detectLanguage(text)
  log.push({ step: 'detect_language', detected: sourceLang, at: new Date().toISOString() })

  if (sourceLang === 'ar') {
    log.push({ step: 'translate', status: 'skipped', reason: 'Already Arabic' })
    await db.article.update({
      where: { id: article.id },
      data: { contentAr: text, language: 'ar', processingLog: log },
    })
    return { nextStage: 'score' }
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

  log.push({
    step: 'translate', status: 'ok', model: 'haiku',
    inputLang: sourceLang, inputChars: truncated.length, outputChars: translated.trim().length,
    inputPreview: preview(truncated),
    outputPreview: preview(translated.trim()),
  })

  await db.article.update({
    where: { id: article.id },
    data: {
      contentAr: translated.trim(),
      language: sourceLang === 'unknown' ? 'other' : sourceLang,
      processingLog: log,
    },
  })

  return { nextStage: 'score' }
}

// ── Stage 6: score → done ───────────────────────────────────────────────────
// Has full data: classification + research + Arabic translation.

async function doStageScore(article, project) {
  const log = getLog(article)

  const freshArticle = await db.article.findUnique({ where: { id: article.id } })
  const analysis = freshArticle?.analysis || article.analysis || {}

  if (analysis.parseError) {
    log.push({ step: 'score', status: 'skipped', reason: 'Classification had parse error' })
    log.push({ step: 'promote', status: 'skipped', reason: 'Classification parse error' })
    await saveLog(article.id, log)
    return { nextStage: 'done' }
  }

  const relevance = typeof analysis.relevance === 'number' ? analysis.relevance : 0
  const viralPotential = typeof analysis.viralPotential === 'number' ? analysis.viralPotential : 0

  const daysSincePublished = (freshArticle || article).publishedAt
    ? Math.max(0, (Date.now() - new Date((freshArticle || article).publishedAt).getTime()) / 86400000)
    : 14
  const freshness = Math.exp(-daysSincePublished / 7 * Math.LN2)

  let preferenceBias = 0
  try {
    const { getPreferenceProfile } = require('./articleFeedback')
    const profile = await getPreferenceProfile(article.projectId)
    if (profile) {
      preferenceBias = calculatePreferenceBias(analysis, profile)
    }
  } catch (_) {}

  const rawScore = relevance * 0.35 + viralPotential * 0.30 + freshness * 0.35
  const rankScore = Math.round(Math.min(1, Math.max(0, rawScore * 0.60 + preferenceBias * 0.40)) * 100) / 100

  log.push({
    step: 'score', relevance, viralPotential, freshness: Math.round(freshness * 100) / 100,
    preferenceBias: Math.round(preferenceBias * 100) / 100,
    rankScore,
  })

  const reasons = []
  if (relevance >= 0.7) reasons.push('high-relevance')
  if (viralPotential >= 0.7) reasons.push('viral-potential')
  if (freshness >= 0.7) reasons.push('fresh')
  if (analysis.isBreaking) reasons.push('breaking')
  if (preferenceBias > 0.2) reasons.push('matches-preferences')

  await db.article.update({
    where: { id: article.id },
    data: {
      relevanceScore: relevance,
      rankScore,
      rankReason: reasons.join(', ') || null,
      processingLog: log,
    },
  })

  // Promote to Story with full data (classification + research + Arabic content)
  try {
    const promoted = await promoteToStory(
      freshArticle || article, analysis, relevance, viralPotential, rankScore
    )
    log.push({ step: 'promote', status: promoted ? 'created' : 'linked', storyId: promoted || null })
    await saveLog(article.id, log)
  } catch (e) {
    log.push({ step: 'promote', status: 'failed', error: e.message })
    await saveLog(article.id, log)
    logger.warn({ articleId: article.id, error: e.message }, '[articleProcessor] Story promotion failed (non-fatal)')
  }

  return { nextStage: 'done' }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function calculatePreferenceBias(analysis, profile) {
  if (!profile || !analysis) return 0
  let bias = 0
  const tags = Array.isArray(analysis.tags) ? analysis.tags : []

  if (profile.likedTags && tags.length > 0) {
    const overlap = tags.filter(t => profile.likedTags.includes(t)).length
    bias += (overlap / Math.max(tags.length, 1)) * 0.4
  }
  if (profile.omitTags && tags.length > 0) {
    const overlap = tags.filter(t => profile.omitTags.includes(t)).length
    bias -= (overlap / Math.max(tags.length, 1)) * 0.3
  }
  if (profile.preferredTypes && analysis.contentType) {
    if (profile.preferredTypes.includes(analysis.contentType)) bias += 0.15
  }
  if (profile.avoidedTypes && analysis.contentType) {
    if (profile.avoidedTypes.includes(analysis.contentType)) bias -= 0.1
  }
  if (profile.preferredRegions && analysis.region) {
    if (profile.preferredRegions.includes(analysis.region)) bias += 0.15
  }

  return Math.max(-0.5, Math.min(0.5, bias))
}

async function promoteToStory(article, analysis, relevance, viralPotential, rankScore) {
  const headline = analysis.topic || article.title || ''
  if (!headline.trim()) return null

  const existing = await db.story.findFirst({
    where: { projectId: article.projectId, headline: headline.trim() },
    select: { id: true },
  })
  if (existing) {
    await db.article.update({
      where: { id: article.id },
      data: { storyId: existing.id },
    })
    return null
  }

  const relevanceScore = Math.round(relevance * 100)
  const viralScore = Math.round(viralPotential * 100)
  const firstMoverScore = analysis.isBreaking ? 80 : 40
  const compositeScore = Math.round((relevanceScore * 0.35 + viralScore * 0.40 + firstMoverScore * 0.25) / 10 * 10) / 10

  // Build story brief with classification + research + Arabic content
  const brief = {
    articleContent: article.contentAr || article.contentClean,
    articleTitle: article.title,
    summary: analysis.summary || null,
    tags: analysis.tags || [],
    region: analysis.region || null,
    contentType: analysis.contentType || null,
    uniqueAngle: analysis.uniqueAngle || null,
    sentiment: analysis.sentiment || null,
    articleId: article.id,
  }

  // Include research data if available (stored on analysis.research by doStageResearch)
  if (analysis.research) {
    brief.research = analysis.research
  }

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
      brief,
    },
  })

  await db.article.update({
    where: { id: article.id },
    data: { storyId: story.id },
  })

  // Generate vector embedding (non-blocking, fail-open)
  try {
    const proj = await db.project.findUnique({
      where: { id: article.projectId },
      select: { id: true, embeddingApiKeyEncrypted: true },
    })
    if (proj?.embeddingApiKeyEncrypted) {
      const { generateEmbedding, buildEmbeddingText, storeStoryEmbedding } = require('./embeddings')
      const text = buildEmbeddingText({
        topic: analysis.topic,
        tags: analysis.tags,
        summary: analysis.summary,
        contentType: analysis.contentType,
        region: analysis.region,
        uniqueAngle: analysis.uniqueAngle,
      })
      if (text.length > 10) {
        const emb = await generateEmbedding(text, proj)
        await storeStoryEmbedding(story.id, emb)
      }
    }
  } catch (e) {
    logger.warn({ storyId: story.id, error: e.message }, '[articleProcessor] story embedding failed (non-fatal)')
  }

  return story.id
}

module.exports = {
  doStageImported,
  doStageContent,
  doStageClassify,
  doStageResearch,
  doStageTranslated,
  doStageScore,
}
