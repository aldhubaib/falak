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
const { getDialectForCountry } = require('../lib/dialects')
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
    step: 'apify_content', processor: 'server', service: 'Local (check Apify data)',
    chars: cleanedContent.length, threshold: MIN_CONTENT_LENGTH,
    at: new Date().toISOString(), contentPreview: preview(cleanedContent),
  })

  if (cleanedContent.length >= MIN_CONTENT_LENGTH) {
    log.push({ step: 'content_source', processor: 'server', source: 'apify', chars: cleanedContent.length, status: 'ok' })
    await db.article.update({
      where: { id: article.id },
      data: { contentClean: cleanedContent, processingLog: log },
    })
    return { nextStage: 'classify' }
  }

  let fetchedText = null
  const fcKey = await db.apiKey.findUnique({ where: { service: 'firecrawl' } })
  if (fcKey?.encryptedKey) {
    try {
      const apiKey = decrypt(fcKey.encryptedKey)
      const result = await scrapeUrl(apiKey, article.url)
      if (result.text) {
        fetchedText = preClean(result.text)
        log.push({ step: 'firecrawl', processor: 'api', service: 'Firecrawl Scrape API', status: 'ok', chars: fetchedText.length })
      } else {
        log.push({ step: 'firecrawl', processor: 'api', service: 'Firecrawl Scrape API', status: 'failed', error: result.error || 'No text returned' })
      }
    } catch (e) {
      log.push({ step: 'firecrawl', processor: 'api', service: 'Firecrawl Scrape API', status: 'failed', error: e.message })
    }
  } else {
    log.push({ step: 'firecrawl', processor: 'api', service: 'Firecrawl Scrape API', status: 'skipped', reason: 'No API key' })
  }

  if (!fetchedText) {
    try {
      const result = await fetchArticleText(article.url)
      if (result.text) {
        fetchedText = result.text
        log.push({ step: 'html_fetch', processor: 'server', service: 'Direct HTTP fetch + HTML parse', status: 'ok', chars: fetchedText.length })
      } else {
        log.push({ step: 'html_fetch', processor: 'server', service: 'Direct HTTP fetch + HTML parse', status: 'failed', error: result.error || 'No text extracted' })
      }
    } catch (e) {
      log.push({ step: 'html_fetch', processor: 'server', service: 'Direct HTTP fetch + HTML parse', status: 'failed', error: e.message })
    }
  }

  if (fetchedText && fetchedText.length >= MIN_CONTENT_LENGTH) {
    log.push({ step: 'content_source', processor: 'server', source: 'firecrawl_or_html', chars: fetchedText.length, status: 'ok' })
    await db.article.update({
      where: { id: article.id },
      data: { contentClean: fetchedText, processingLog: log },
    })
    return { nextStage: 'classify' }
  }

  const fallbackText = [article.title, article.description, cleanedContent].filter(Boolean).join('\n\n').trim()
  if (fallbackText.length >= 100) {
    log.push({ step: 'content_source', processor: 'server', source: 'title_desc_fallback', chars: fallbackText.length, status: 'ok' })
    await db.article.update({
      where: { id: article.id },
      data: { contentClean: fallbackText, processingLog: log },
    })
    return { nextStage: 'classify' }
  }

  log.push({ step: 'content_source', processor: 'server', source: 'none', status: 'review', reason: 'No usable content found' })
  await saveLog(article.id, log)
  return { nextStage: 'content', reviewStatus: 'review', reviewReason: 'No usable content found' }
}

// ── Stage 3: classify → research ────────────────────────────────────────────
// Classifies in the article's ORIGINAL language. Arabic translation happens later.

async function doStageClassify(article, project) {
  const anKey = await db.apiKey.findUnique({ where: { service: 'anthropic' } })
  if (!anKey?.encryptedKey) {
    throw new Error('Anthropic API key not configured. Go to Settings to add it.')
  }
  const log = getLog(article)
  const apiKey = decrypt(anKey.encryptedKey)

  const articleText = (article.contentClean || article.content || '').slice(0, 20000)
  const title = article.title || ''
  const existingTags = Array.isArray(article.analysis?.tags) ? article.analysis.tags : []
  const category = article.analysis?.category || ''
  const sourceLang = article.language || detectLanguage(articleText)
  const targetLang = sourceLang === 'ar' ? 'Arabic' : 'English'

  function buildClassifyPrompt({ strictEnglishOnly }) {
    const strictLine = !wantsArabicOutput && strictEnglishOnly
      ? `\nSTRICT RULE: You MUST output English ONLY. Do not use Arabic script at all.`
      : ''

    return `You are a news analyst. Classify this article.\n` +
      `Read the article and output your analysis in ${targetLang} only.${strictLine}\n` +
      `Reply in JSON only, no markdown fences, no explanation.\n\n` +
      `Keys:\n` +
      `- topic: one short sentence describing what this article is about (in ${targetLang})\n` +
      `- tags: 4 to 8 tags (noun form, 1-3 words each, reusable across articles, in ${targetLang})\n` +
      `- contentType: "news" | "investigation" | "feature" | "opinion" | "human_interest" | "crime" | "politics" | "technology" | "other"\n` +
      `- region: the country or city where the main event takes place, or null (in ${targetLang})\n` +
      `- summary: 2-3 sentence summary in ${targetLang}\n` +
      `- uniqueAngle: one sentence about what makes this story unique, or null (in ${targetLang})\n\n` +
      `Title: ${title}\n` +
      (existingTags.length ? `Scraper tags: ${existingTags.join(', ')}\n` : '') +
      (category ? `Category: ${category}\n` : '') +
      `\nArticle:\n${articleText}`
  }

  const wantsArabicOutput = targetLang === 'Arabic'
  const hasArabicScript = (s) => typeof s === 'string' && (ARABIC_CHAR_REGEX.test(s) || (s.match(ARABIC_CHAR_REGEX) || []).length > 0)

  let prompt = buildClassifyPrompt({ strictEnglishOnly: false })
  let raw = ''
  let classifyUsage = {}
  let analysis = null

  // One optional retry: if we asked for English but Arabic script appears in key fields.
  for (let attempt = 0; attempt < 2; attempt++) {
    raw = await callAnthropic(apiKey, 'claude-haiku-4-5-20251001', [
      { role: 'user', content: prompt },
    ], {
      maxTokens: 2048,
      channelId: article.channelId,
      action: 'article-classify',
    })
    classifyUsage = callAnthropic._lastUsage || {}

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

    if (!analysis || analysis.parseError) break

    if (!wantsArabicOutput) {
      const tagsText = Array.isArray(analysis.tags) ? analysis.tags.join(' ') : ''
      const violates = [
        analysis.topic,
        analysis.summary,
        analysis.region,
        analysis.uniqueAngle,
        tagsText,
      ].some(hasArabicScript)

      if (violates) {
        if (attempt === 0) {
          prompt = buildClassifyPrompt({ strictEnglishOnly: true })
          continue
        }
      }
    }
    break
  }

  const classifyQuality = evaluateClassifyQuality(analysis)

  log.push({
    step: 'classify', status: analysis?.parseError ? 'parse_error' : 'ok',
    processor: 'ai', service: 'Anthropic Claude Haiku',
    model: 'claude-haiku-4-5-20251001',
    topic: analysis?.topic || null,
    tags: analysis?.tags || [],
    contentType: analysis?.contentType || null,
    region: analysis?.region || null,
    summary: analysis?.summary || null,
    uniqueAngle: analysis?.uniqueAngle || null,
    inputChars: articleText.length,
    inputTokens: classifyUsage.inputTokens || null,
    outputTokens: classifyUsage.outputTokens || null,
    totalTokens: classifyUsage.totalTokens || null,
    promptSent: prompt.slice(0, 1500),
    rawResponse: (raw || '').slice(0, 1500),
    quality: classifyQuality,
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
  const decision = await needsResearch({ ...article, analysis: currentAnalysis })

  log.push({
    step: 'research_decision', processor: 'server', service: 'Local decision logic',
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
      include: { source: { include: { channel: true } } },
    })
    const result = await researchStory(fullArticle || article, article.channelId)

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
    log.push({ step: 'research', status: 'partial', error: `${e.message} (non-blocking)`, at: new Date().toISOString() })
    await saveLog(article.id, log)
    logger.warn({ articleId: article.id, error: e.message }, '[articleProcessor] Research failed (non-fatal, continuing to translated)')
    return { nextStage: 'translated' }
  }
}

// ── Stage 5: translated → score ─────────────────────────────────────────────
// Translates EVERYTHING to Arabic: article content + all classification fields.

async function doStageTranslated(article, project) {
  const log = getLog(article)
  const text = article.contentClean || article.content || ''
  if (!text.trim()) {
    log.push({ step: 'translate', status: 'review', reason: 'No content to translate' })
    await saveLog(article.id, log)
    return { nextStage: 'translated', reviewStatus: 'review', reviewReason: 'No content to translate' }
  }

  const freshArticle = await db.article.findUnique({ where: { id: article.id } })
  const analysis = freshArticle?.analysis || article.analysis || {}
  const sourceLang = article.language || detectLanguage(text)

  log.push({ step: 'detect_language', processor: 'server', service: 'Local regex detection', detected: sourceLang, at: new Date().toISOString() })

  if (sourceLang === 'ar') {
    const arAnalysis = {
      ...analysis,
      topicAr: analysis.topic || null,
      tagsAr: analysis.tags || [],
      summaryAr: analysis.summary || null,
      regionAr: analysis.region || null,
      uniqueAngleAr: analysis.uniqueAngle || null,
    }
    if (analysis.research?.brief) {
      arAnalysis.research = { ...(analysis.research || {}), briefAr: analysis.research.brief }
    }
    log.push({ step: 'translate_content', processor: 'server', service: 'Skip (already Arabic)', status: 'skipped', reason: 'Already Arabic', at: new Date().toISOString() })
    log.push({ step: 'translate_analysis', processor: 'server', service: 'Skip (already Arabic)', status: 'skipped', reason: 'Already Arabic', at: new Date().toISOString() })
    log.push({ step: 'translate_research', processor: 'server', service: 'Skip (already Arabic)', status: 'skipped', reason: 'Already Arabic', at: new Date().toISOString() })
    await db.article.update({
      where: { id: article.id },
      data: { contentAr: text, language: 'ar', analysis: arAnalysis, processingLog: log },
    })
    return { nextStage: 'score' }
  }

  const anKey = await db.apiKey.findUnique({ where: { service: 'anthropic' } })
  if (!anKey?.encryptedKey) {
    throw new Error('Anthropic API key not configured. Go to Settings to add it.')
  }
  const apiKey = decrypt(anKey.encryptedKey)

  // ── Step A: Translate article content ──
  const truncated = text.slice(0, 30000)
  const contentPrompt = `Translate this news article to Arabic.\n` +
    `Preserve all names, dates, locations, and facts exactly.\n` +
    `Keep a journalistic tone. Output the Arabic text only, no commentary.\n` +
    `Important: Transliterate sport names, do not translate them to different sports. Examples: "snooker" → "سنوكر" (NOT "اسكواش"), "cricket" → "كريكيت", "rugby" → "رغبي".\n\n` +
    truncated
  const translatedContent = await callAnthropic(apiKey, 'claude-haiku-4-5-20251001', [
    { role: 'user', content: contentPrompt },
  ], {
    maxTokens: 4096,
    channelId: article.channelId,
    action: 'article-translate-content',
  })
  const contentUsage = callAnthropic._lastUsage || {}

  if (!translatedContent || translatedContent.trim().length < 50) {
    throw new Error('Content translation returned empty or too short result')
  }

  const contentQuality = evaluateTranslationQuality(truncated.length, translatedContent.trim().length, translatedContent.trim())

  log.push({
    step: 'translate_content', status: 'ok',
    processor: 'ai', service: 'Anthropic Claude Haiku',
    model: 'claude-haiku-4-5-20251001',
    inputLang: sourceLang, inputChars: truncated.length, outputChars: translatedContent.trim().length,
    inputTokens: contentUsage.inputTokens || null,
    outputTokens: contentUsage.outputTokens || null,
    totalTokens: contentUsage.totalTokens || null,
    promptSent: contentPrompt.slice(0, 1500),
    rawResponse: translatedContent.trim().slice(0, 1500),
    quality: contentQuality,
    at: new Date().toISOString(),
  })

  // ── Step B: Translate classification fields ──
  const fieldsToTranslate = {
    topic: analysis.topic || '',
    summary: analysis.summary || '',
    region: analysis.region || '',
    uniqueAngle: analysis.uniqueAngle || '',
    tags: (analysis.tags || []).join(' | '),
  }
  const fieldsText = Object.entries(fieldsToTranslate)
    .filter(([, v]) => v.trim())
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n')

  let arAnalysis = { ...analysis }

  if (fieldsText.trim()) {
    const analysisPrompt = `Translate these classification fields from ${sourceLang === 'other' ? 'English' : sourceLang} to Arabic.\n` +
      `Keep the same key names. For "tags", return them separated by " | ".\n` +
      `Reply in the exact same format (key: value), one per line, no extra text.\n` +
      `Important: Transliterate sport names, do not translate them to different sports. Examples: "snooker" → "سنوكر" (NOT "اسكواش"), "cricket" → "كريكيت", "rugby" → "رغبي".\n\n` +
      fieldsText

    const translatedFields = await callAnthropic(apiKey, 'claude-haiku-4-5-20251001', [
      { role: 'user', content: analysisPrompt },
    ], {
      maxTokens: 1024,
      channelId: article.channelId,
      action: 'article-translate-analysis',
    })
    const analysisUsage = callAnthropic._lastUsage || {}

    const parsed = parseTranslatedFields(translatedFields || '')
    arAnalysis.topicAr = parsed.topic || analysis.topic || null
    arAnalysis.tagsAr = parsed.tags ? parsed.tags.split(/\s*\|\s*/).filter(Boolean) : (analysis.tags || [])
    arAnalysis.summaryAr = parsed.summary || analysis.summary || null
    arAnalysis.regionAr = parsed.region || analysis.region || null
    arAnalysis.uniqueAngleAr = parsed.uniqueAngle || analysis.uniqueAngle || null

    log.push({
      step: 'translate_analysis', status: 'ok',
      processor: 'ai', service: 'Anthropic Claude Haiku',
      model: 'claude-haiku-4-5-20251001',
      fieldsTranslated: Object.keys(parsed).length,
      inputTokens: analysisUsage.inputTokens || null,
      outputTokens: analysisUsage.outputTokens || null,
      totalTokens: analysisUsage.totalTokens || null,
      promptSent: analysisPrompt.slice(0, 1500),
      rawResponse: (translatedFields || '').trim().slice(0, 1500),
      at: new Date().toISOString(),
    })
  } else {
    log.push({ step: 'translate_analysis', processor: 'server', service: 'Skip (no fields)', status: 'skipped', reason: 'No classification fields to translate', at: new Date().toISOString() })
  }

  // ── Step C: Translate research brief to Arabic ──
  const researchBrief = analysis.research?.brief
  if (researchBrief && typeof researchBrief === 'object') {
    try {
      const briefJson = JSON.stringify(researchBrief)
      const researchPrompt = `Translate this research brief to Arabic. Keep the exact same JSON structure and keys. Translate all string values to Arabic (whatHappened, howItHappened, whatWasTheResult, keyFacts array, timeline[].event, mainCharacters[].role, competitionInsight, suggestedHook). Keep narrativeStrength as a number. Keep sources[].url unchanged; you may translate sources[].title to Arabic. Reply with ONLY valid JSON, no markdown fences, no explanation.\n\n${briefJson}`
      const translatedBriefRaw = await callAnthropic(apiKey, 'claude-haiku-4-5-20251001', [
        { role: 'user', content: researchPrompt },
      ], {
        maxTokens: 4096,
        channelId: article.channelId,
        action: 'article-translate-research',
      })
      const researchUsage = callAnthropic._lastUsage || {}
      let briefAr = null
      if (translatedBriefRaw && translatedBriefRaw.trim()) {
        const trimmed = translatedBriefRaw.trim()
        const start = trimmed.indexOf('{')
        const end = trimmed.lastIndexOf('}') + 1
        if (start !== -1 && end > start) {
          briefAr = JSON.parse(trimmed.slice(start, end))
        }
      }
      if (briefAr) {
        arAnalysis.research = {
          ...(arAnalysis.research || {}),
          briefAr,
        }
        log.push({
          step: 'translate_research', status: 'ok',
          processor: 'ai', service: 'Anthropic Claude Haiku',
          model: 'claude-haiku-4-5-20251001',
          inputChars: briefJson.length,
          outputChars: (translatedBriefRaw || '').trim().length,
          inputTokens: researchUsage.inputTokens || null,
          outputTokens: researchUsage.outputTokens || null,
          totalTokens: researchUsage.totalTokens || null,
          promptSent: researchPrompt.slice(0, 1500),
          rawResponse: (translatedBriefRaw || '').trim().slice(0, 1500),
          at: new Date().toISOString(),
        })
      } else {
        log.push({ step: 'translate_research', processor: 'ai', service: 'Anthropic Claude Haiku', status: 'partial', reason: 'Failed to parse translated brief JSON — non-blocking', at: new Date().toISOString() })
      }
    } catch (e) {
      log.push({ step: 'translate_research', processor: 'ai', service: 'Anthropic Claude Haiku', status: 'partial', error: `${e.message} (non-blocking)`, at: new Date().toISOString() })
      logger.warn({ articleId: article.id, error: e.message }, '[articleProcessor] translate_research failed (non-fatal)')
    }
  } else {
    log.push({ step: 'translate_research', processor: 'server', service: 'Skip (no research brief)', status: 'skipped', reason: researchBrief ? 'Invalid brief' : 'No research brief', at: new Date().toISOString() })
  }

  await db.article.update({
    where: { id: article.id },
    data: {
      contentAr: translatedContent.trim(),
      language: sourceLang === 'unknown' ? 'other' : sourceLang,
      analysis: arAnalysis,
      processingLog: log,
    },
  })

  return { nextStage: 'score' }
}

function parseTranslatedFields(raw) {
  const result = {}
  const lines = (raw || '').trim().split('\n')
  for (const line of lines) {
    const colonIdx = line.indexOf(':')
    if (colonIdx === -1) continue
    const key = line.slice(0, colonIdx).trim().toLowerCase().replace(/\s+/g, '')
    const value = line.slice(colonIdx + 1).trim()
    if (key === 'topic') result.topic = value
    else if (key === 'summary') result.summary = value
    else if (key === 'region') result.region = value
    else if (key === 'uniqueangle') result.uniqueAngle = value
    else if (key === 'tags') result.tags = value
  }
  return result
}

// ── Stage 6: score → done ───────────────────────────────────────────────────
// THE DECISION STAGE: similarity search (AR vs AR), AI scoring on Arabic, final score, promote.

async function doStageScore(article, project) {
  const log = getLog(article)

  const freshArticle = await db.article.findUnique({ where: { id: article.id } })
  const art = freshArticle || article
  const analysis = art.analysis || {}

  if (analysis.parseError) {
    log.push({ step: 'score_similarity', status: 'skipped', reason: 'Classification had parse error' })
    log.push({ step: 'score_ai_analysis', status: 'skipped', reason: 'Classification parse error' })
    log.push({ step: 'score', status: 'skipped', reason: 'Classification parse error' })
    log.push({ step: 'promote', status: 'skipped', reason: 'Classification parse error' })
    await saveLog(article.id, log)
    return { nextStage: 'done' }
  }

  let scoreEmbedding = null
  let similarVideos = []
  let relevance = 0
  let viralPotential = 0
  let sentiment = 'neutral'

  // ── Sub-step A: score_similarity (Arabic vs Arabic) ──
  const embKey = await db.apiKey.findUnique({ where: { service: 'embedding' } })
  if (embKey?.encryptedKey) {
    try {
      const { generateEmbedding, buildEmbeddingText, findSimilarVideos } = require('./embeddings')
      const embData = {
        topic: analysis.topicAr || analysis.topic,
        tags: analysis.tagsAr || analysis.tags,
        summary: analysis.summaryAr || analysis.summary,
        region: analysis.regionAr || analysis.region,
        uniqueAngle: analysis.uniqueAngleAr || analysis.uniqueAngle,
        contentType: analysis.contentType,
      }
      const embText = buildEmbeddingText(embData)
      if (embText.length > 10) {
        scoreEmbedding = await generateEmbedding(embText, article.channelId)
        const raw = await findSimilarVideos(scoreEmbedding, article.channelId, 5)
        similarVideos = (raw || []).map(v => ({
          title: v.titleAr || '',
          views: v.viewCount || 0,
          channel: v.channelName || '',
          similarity: typeof v.similarity === 'number' ? Math.round(v.similarity * 100) / 100 : null,
          type: v.videoType || '',
        }))
        log.push({
          step: 'score_similarity',
          processor: 'server',
          service: 'OpenAI Embeddings + pgvector',
          status: 'ok',
          embeddingInputChars: embText.length,
          matchCount: similarVideos.length,
          topMatch: similarVideos[0] ? { title: similarVideos[0].title, similarity: similarVideos[0].similarity } : null,
          similarVideos,
          at: new Date().toISOString(),
        })
      } else {
        log.push({ step: 'score_similarity', processor: 'server', service: 'OpenAI Embeddings', status: 'skipped', reason: 'Not enough Arabic text for embedding', at: new Date().toISOString() })
      }
    } catch (e) {
      log.push({ step: 'score_similarity', processor: 'api', service: 'OpenAI Embeddings + pgvector', status: 'failed', error: e.message, at: new Date().toISOString() })
    }
  } else {
    log.push({ step: 'score_similarity', processor: 'api', service: 'OpenAI Embeddings', status: 'skipped', reason: 'No embedding key', at: new Date().toISOString() })
  }

  // ── Sub-step B: score_ai_analysis (AI scoring on Arabic text) ──
  const contentAr = art.contentAr || ''
  const anKey = await db.apiKey.findUnique({ where: { service: 'anthropic' } })
  if (anKey?.encryptedKey && contentAr.trim().length > 50) {
    try {
      const apiKey = decrypt(anKey.encryptedKey)
      const competitionContext = similarVideos.length > 0
        ? '\n\nCompetition (similar Arabic videos already in DB):\n' +
          similarVideos.map(v => `- "${v.title}" (similarity: ${v.similarity})`).join('\n')
        : ''
      const scoringPrompt = `You are a news analyst for an Arabic YouTube audience. Analyze this Arabic article and respond with JSON only (no markdown, no explanation).

Keys:
- sentiment: "positive" | "negative" | "neutral" (how Arabic-speaking audiences will react emotionally)
- viralPotential: 0.0 to 1.0 — how likely this will get shares and engagement among Arabic audiences
- relevance: 0.0 to 1.0 — how relevant is this to audiences interested in true crime, mysteries, investigations, and untold stories
${competitionContext}

Article (Arabic):
${contentAr.slice(0, 15000)}`

      const raw = await callAnthropic(apiKey, 'claude-haiku-4-5-20251001', [
        { role: 'user', content: scoringPrompt },
      ], {
        maxTokens: 512,
        channelId: article.channelId,
        action: 'article-score-ai',
      })
      const usage = callAnthropic._lastUsage || {}

      let parsed = null
      try {
        const trimmed = (raw || '').trim()
        const start = trimmed.indexOf('{')
        const end = trimmed.lastIndexOf('}') + 1
        if (start !== -1 && end > start) {
          parsed = JSON.parse(trimmed.slice(start, end))
        }
      } catch (_) {}

      if (parsed) {
        sentiment = ['positive', 'negative', 'neutral'].includes(parsed.sentiment) ? parsed.sentiment : 'neutral'
        relevance = typeof parsed.relevance === 'number' ? Math.max(0, Math.min(1, parsed.relevance)) : 0
        viralPotential = typeof parsed.viralPotential === 'number' ? Math.max(0, Math.min(1, parsed.viralPotential)) : 0
        analysis.sentiment = sentiment
        log.push({
          step: 'score_ai_analysis',
          processor: 'ai',
          service: 'Anthropic Claude Haiku',
          model: 'claude-haiku-4-5-20251001',
          status: 'ok',
          inputTokens: usage.inputTokens || null,
          outputTokens: usage.outputTokens || null,
          totalTokens: usage.totalTokens || null,
          promptSent: scoringPrompt.slice(0, 1500),
          rawResponse: (raw || '').slice(0, 1500),
          sentiment,
          viralPotential,
          relevance,
          at: new Date().toISOString(),
        })
      } else {
        log.push({ step: 'score_ai_analysis', processor: 'ai', service: 'Anthropic Claude Haiku', status: 'parse_error', rawResponse: (raw || '').slice(0, 500), at: new Date().toISOString() })
      }
    } catch (e) {
      log.push({ step: 'score_ai_analysis', processor: 'ai', service: 'Anthropic Claude Haiku', status: 'failed', error: e.message, at: new Date().toISOString() })
    }
  } else {
    log.push({ step: 'score_ai_analysis', processor: 'ai', service: 'Anthropic Claude Haiku', status: 'skipped', reason: contentAr.trim().length <= 50 ? 'No Arabic content' : 'No Anthropic key', at: new Date().toISOString() })
  }

  // ── Sub-step C: score (compute final score) ──
  const daysSincePublished = art.publishedAt
    ? Math.max(0, (Date.now() - new Date(art.publishedAt).getTime()) / 86400000)
    : 14
  const freshness = Math.exp(-daysSincePublished / 7 * Math.LN2)

  let preferenceBias = 0
  try {
    const { getPreferenceProfile } = require('./articleFeedback')
    const profile = await getPreferenceProfile(article.channelId)
    if (profile) {
      preferenceBias = calculatePreferenceBias(analysis, profile)
    }
  } catch (_) {}

  const topSimilarity = similarVideos[0]?.similarity
  const competitionPenalty = typeof topSimilarity === 'number' && topSimilarity >= 0.7 ? 0.05 : (topSimilarity >= 0.5 ? 0.02 : 0)

  // Derive isBreaking from publishedAt (used in reasons and story promotion)
  const hoursSincePublished = art.publishedAt
    ? (Date.now() - new Date(art.publishedAt).getTime()) / 3600000
    : 999
  const isBreaking = hoursSincePublished <= 48
  analysis.isBreaking = isBreaking

  const rawScore = relevance * 0.35 + viralPotential * 0.30 + freshness * 0.35
  const finalScore = Math.round(Math.min(1, Math.max(0, rawScore * 0.60 + preferenceBias * 0.40 - competitionPenalty)) * 100) / 100

  log.push({
    step: 'score',
    processor: 'server',
    service: 'Score computation',
    relevance,
    viralPotential,
    freshness: Math.round(freshness * 100) / 100,
    preferenceBias: Math.round(preferenceBias * 100) / 100,
    competitionPenalty,
    finalScore,
    at: new Date().toISOString(),
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
      finalScore,
      rankReason: reasons.join(', ') || null,
      processingLog: log,
    },
  })

  // ── Sub-step D: promote + auto-script ──
  let promotedStoryId = null
  try {
    promotedStoryId = await promoteToStory(art, analysis, relevance, viralPotential, finalScore, scoreEmbedding, project)
    log.push({ step: 'promote', processor: 'server', service: 'Database write (no 3rd party)', status: promotedStoryId ? 'created' : 'linked', storyId: promotedStoryId || null, at: new Date().toISOString() })
    if (promotedStoryId) {
      const updatedStory = await db.story.findUnique({ where: { id: promotedStoryId }, select: { brief: true } })
      const scriptGenerated = updatedStory?.brief?.autoGenerated === true
      log.push({
        step: 'auto_script',
        processor: 'ai',
        service: 'Anthropic Claude Sonnet',
        model: 'claude-sonnet-4-6',
        status: scriptGenerated ? 'ok' : 'skipped',
        storyId: promotedStoryId,
        at: new Date().toISOString(),
      })
    }
    await saveLog(article.id, log)
  } catch (e) {
    log.push({ step: 'promote', processor: 'server', service: 'Database write', status: 'failed', error: e.message, at: new Date().toISOString() })
    await saveLog(article.id, log)
    logger.warn({ articleId: article.id, error: e.message }, '[articleProcessor] Story promotion failed (non-fatal)')
  }

  return { nextStage: 'done' }
}

// ── Quality evaluators ───────────────────────────────────────────────────────

function evaluateClassifyQuality(analysis) {
  if (!analysis || analysis.parseError) return { score: 0, issues: ['Failed to parse AI response'] }
  const issues = []
  const expectedKeys = ['topic', 'tags', 'contentType', 'region', 'summary', 'uniqueAngle']
  const filledKeys = expectedKeys.filter(k => analysis[k] != null && analysis[k] !== '').length
  if (filledKeys < 4) issues.push(`Only ${filledKeys}/6 fields filled`)
  if (!Array.isArray(analysis.tags) || analysis.tags.length < 3) issues.push('Too few tags (< 3)')
  if (!analysis.topic) issues.push('Missing topic')
  if (!analysis.summary) issues.push('Missing summary')
  const score = Math.max(0, 10 - issues.length * 2)
  return { score, filled: filledKeys, total: expectedKeys.length, issues: issues.length ? issues : null }
}

function evaluateTranslationQuality(inputChars, outputChars, outputText) {
  const issues = []
  const ratio = outputChars / Math.max(inputChars, 1)
  if (ratio < 0.3) issues.push(`Output too short (ratio ${ratio.toFixed(2)})`)
  if (ratio > 3.0) issues.push(`Output suspiciously long (ratio ${ratio.toFixed(2)})`)
  if (outputChars < 100) issues.push('Output very short (< 100 chars)')
  const arabicChars = (outputText || '').match(ARABIC_CHAR_REGEX)
  const arabicRatio = arabicChars ? arabicChars.length / Math.max(outputChars, 1) : 0
  if (arabicRatio < 0.3) issues.push(`Low Arabic content (${Math.round(arabicRatio * 100)}%)`)
  const score = Math.max(0, 10 - issues.length * 3)
  return { score, ratio: Math.round(ratio * 100) / 100, arabicRatio: Math.round(arabicRatio * 100) / 100, issues: issues.length ? issues : null }
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

async function promoteToStory(article, analysis, relevance, viralPotential, finalScore, scoreEmbedding = null, channel = null) {
  const headline = analysis.topicAr || analysis.topic || article.title || ''
  if (!headline.trim()) return null

  const existing = await db.story.findFirst({
    where: { channelId: article.channelId, headline: headline.trim() },
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

  const brief = {
    articleContent: article.contentAr || article.contentClean,
    articleTitle: article.title,
    channelId: article.channelId,
    summary: analysis.summaryAr || analysis.summary || null,
    tags: analysis.tagsAr || analysis.tags || [],
    region: analysis.regionAr || analysis.region || null,
    contentType: analysis.contentType || null,
    uniqueAngle: analysis.uniqueAngleAr || analysis.uniqueAngle || null,
    sentiment: analysis.sentiment || null,
    articleId: article.id,
    topicOriginal: analysis.topic || null,
    summaryOriginal: analysis.summary || null,
    tagsOriginal: analysis.tags || [],
    regionOriginal: analysis.region || null,
  }

  if (analysis.research) {
    const research = { ...analysis.research }
    if (analysis.research.briefAr) {
      research.brief = analysis.research.briefAr
    }
    brief.research = research
  }

  const story = await db.story.create({
    data: {
      channelId: article.channelId,
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

  try {
    if (scoreEmbedding && scoreEmbedding.length > 0) {
      const { storeStoryEmbedding } = require('./embeddings')
      await storeStoryEmbedding(story.id, scoreEmbedding)
    } else {
      const embKey = await db.apiKey.findUnique({ where: { service: 'embedding' } })
      if (embKey?.encryptedKey) {
        const { generateEmbedding, buildEmbeddingText, storeStoryEmbedding } = require('./embeddings')
        const text = buildEmbeddingText({
          topic: analysis.topicAr || analysis.topic,
          tags: analysis.tagsAr || analysis.tags,
          summary: analysis.summaryAr || analysis.summary,
          contentType: analysis.contentType,
          region: analysis.regionAr || analysis.region,
          uniqueAngle: analysis.uniqueAngleAr || analysis.uniqueAngle,
        })
        if (text.length > 10) {
          const emb = await generateEmbedding(text, article.channelId)
          await storeStoryEmbedding(story.id, emb)
        }
      }
    }
  } catch (e) {
    logger.warn({ storyId: story.id, error: e.message }, '[articleProcessor] story embedding failed (non-fatal)')
  }

  // ── Auto-generate draft script ──
  try {
    await generateAutoScript(story.id, brief, channel || { id: article.channelId })
  } catch (e) {
    logger.warn({ storyId: story.id, error: e.message }, '[articleProcessor] auto-script generation failed (non-fatal)')
  }

  return story.id
}

// ── Auto-script generation (runs at promote, non-fatal) ───────────────────────

async function generateAutoScript(storyId, brief, channel) {
  const apiKeyRow = await db.apiKey.findUnique({ where: { service: 'anthropic' } })
  if (!apiKeyRow?.encryptedKey) return

  const articleContent = typeof brief.articleContent === 'string'
    && brief.articleContent !== '__SCRAPE_FAILED__'
    && brief.articleContent !== '__YOUTUBE__'
    ? brief.articleContent : ''
  if (!articleContent.trim()) return

  const ch = await db.channel.findFirst({
    where: { id: channel.id },
    select: { id: true, startHook: true, endHook: true, nationality: true },
  })
  if (!ch) return

  const startHook = (ch.startHook || '').trim()
  const endHook = (ch.endHook || '').trim()
  const dialect = await getDialectForCountry(ch.nationality)
  const dialectInstruction = dialect
    ? `Write the script in ${dialect.long} (${dialect.short}). Use natural spoken ${dialect.short} — not formal Modern Standard Arabic.`
    : 'Write the script in Arabic.'

  const durationMinutes = 3
  const durationInstruction = `The script must be about ${durationMinutes} minute(s) of speaking time (approximately ${Math.round(durationMinutes * 150)} words). Include timestamps every 15–30 seconds (e.g. 0:00, 0:15, 0:30, 1:00).`

  const researchContext = brief.research ? buildResearchContext(brief.research) : ''

  const system = `You are an expert Arabic YouTube scriptwriter. ${dialectInstruction}

Output ONLY a structured script using exactly these section headers (each on its own line). No other text or explanations.

## TITLE
(one line: suggested video title)

## OPENING_HOOK
(one short paragraph: the first 10 seconds hook)

## BRANDED_HOOK_START
${startHook ? `Output this text exactly:\n${startHook}` : '(leave empty or a brief channel greeting)'}

## SCRIPT
(Main script body with timestamps. ${durationInstruction} Use format like 0:00 ... then 0:30 ... etc.)

## BRANDED_HOOK_END
${endHook ? `Output this text exactly:\n${endHook}` : '(leave empty or a brief call to subscribe)'}

## HASHTAGS
(5–15 relevant YouTube tags, comma-separated, WITHOUT the # symbol. Mix of Arabic and English tags for SEO. Example: tag1, tag2, tag3)`

  let userMessage = `Article to turn into a short video (~${durationMinutes} min) script:\n\n${articleContent.slice(0, 120000)}`

  if (researchContext) {
    userMessage += `\n\n--- RESEARCH BRIEF ---\n${researchContext}`
  }

  if (brief.summary) {
    userMessage += `\n\n--- SUMMARY ---\n${brief.summary}`
  }
  if (brief.uniqueAngle) {
    userMessage += `\n\n--- UNIQUE ANGLE ---\n${brief.uniqueAngle}`
  }

  const apiKey = decrypt(apiKeyRow.encryptedKey)
  const fullScript = await callAnthropic(apiKey, 'claude-sonnet-4-6', [{ role: 'user', content: userMessage }], {
    system,
    maxTokens: 8192,
    channelId: ch.id,
    action: 'Auto Generate Script',
  })
  const usage = callAnthropic._lastUsage || {}

  const parsed = parseAutoScript(fullScript, startHook, endHook)
  const updatedBrief = {
    ...brief,
    suggestedTitle: parsed.suggestedTitle || undefined,
    openingHook: parsed.openingHook || undefined,
    hookStart: parsed.hookStart,
    script: parsed.script || undefined,
    hookEnd: parsed.hookEnd,
    youtubeTags: parsed.youtubeTags.length > 0 ? parsed.youtubeTags : undefined,
    scriptDuration: durationMinutes,
    scriptRaw: (fullScript || '').trim() || undefined,
    autoGenerated: true,
  }

  await db.story.update({
    where: { id: storyId },
    data: { brief: updatedBrief },
  })

  logger.info({
    storyId,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
  }, '[articleProcessor] auto-script generated')
}

function buildResearchContext(research) {
  const parts = []
  if (research.brief) parts.push(research.brief)
  if (research.briefAr) parts.push(research.briefAr)
  if (research.competitionInsight) parts.push(`Competition Insight: ${research.competitionInsight}`)
  if (research.keyFacts && Array.isArray(research.keyFacts)) {
    parts.push(`Key Facts:\n${research.keyFacts.map(f => `- ${f}`).join('\n')}`)
  }
  if (research.sources && Array.isArray(research.sources)) {
    parts.push(`Sources:\n${research.sources.map(s => `- ${typeof s === 'string' ? s : s.title || s.url || JSON.stringify(s)}`).join('\n')}`)
  }
  return parts.join('\n\n')
}

function parseAutoScript(text, channelStartHook = '', channelEndHook = '') {
  const raw = (text || '').trim()
  const sections = {}
  const sectionNames = ['TITLE', 'OPENING_HOOK', 'BRANDED_HOOK_START', 'SCRIPT', 'BRANDED_HOOK_END', 'HASHTAGS']
  let currentKey = null
  let currentLines = []
  for (const line of raw.split('\n')) {
    const match = line.match(/^##\s*(.+?)\s*$/i)
    if (match) {
      const key = match[1].toUpperCase().replace(/[\s-]+/g, '_').replace(/_+/g, '_')
      if (sectionNames.includes(key)) {
        if (currentKey) sections[currentKey] = currentLines.join('\n').trim()
        currentKey = key
        currentLines = []
        continue
      }
    }
    if (currentKey) currentLines.push(line)
  }
  if (currentKey) sections[currentKey] = currentLines.join('\n').trim()

  const hashtagRaw = sections.HASHTAGS || ''
  const youtubeTags = hashtagRaw
    .split(/[\s,،\n]+/)
    .map(t => t.replace(/^#/, '').trim())
    .filter(t => t.length > 0 && t.length <= 100)
    .slice(0, 15)

  return {
    suggestedTitle: sections.TITLE || '',
    openingHook: sections.OPENING_HOOK || '',
    hookStart: sections.BRANDED_HOOK_START !== undefined ? sections.BRANDED_HOOK_START : channelStartHook,
    script: sections.SCRIPT || raw,
    hookEnd: sections.BRANDED_HOOK_END !== undefined ? sections.BRANDED_HOOK_END : channelEndHook,
    youtubeTags,
  }
}

module.exports = {
  doStageImported,
  doStageContent,
  doStageClassify,
  doStageResearch,
  doStageTranslated,
  doStageScore,
}
