/**
 * Article pipeline stage processors.
 * Each function receives { article, project } and returns { nextStage } or { nextStage, reviewStatus }.
 *
 * Stages: imported → content → classify → title_translate → score → [threshold gate] → research → translated → images → done
 *
 * Key design: classify runs on ORIGINAL language content. Title translate provides
 * a lightweight Arabic translation for scoring/niche matching. Score runs early
 * with a dynamic threshold gate — articles below the threshold are filtered out
 * before expensive research and full translation. Research and translation only
 * run for articles that pass the threshold.
 */
const db = require('../lib/db')
const { decrypt } = require('./crypto')
const { scrapeUrl, preClean } = require('./firecrawl')
const { fetchArticleText } = require('./articleFetcher')
const { callAnthropic } = require('./pipelineProcessor')
const { needsResearch, researchStory } = require('./storyResearcher')
const logger = require('../lib/logger')
const { computeSimpleComposite, finalScoreToComposite } = require('../lib/scoringConfig')
const registry = require('../lib/serviceRegistry')

const MIN_CONTENT_LENGTH = 300
const ARABIC_CHAR_REGEX = /[\u0600-\u06FF]/g
const PREVIEW_LENGTH = 500

// Self-describing step metadata — the single source of truth for all pipeline log rendering.
// Frontend reads stage/label/icon/subtitle to render generically. No STEP_MAP needed.
const STEP_META = {
  imported:           { stage: 'imported',   label: 'Imported',          icon: 'download' },
  apify_content:      { stage: 'content',    label: 'Apify Content',    icon: 'file-text',    subtitle: 'Article body from Apify actor' },
  firecrawl:          { stage: 'content',    label: 'Firecrawl',        icon: 'globe',         subtitle: 'Scraped via Firecrawl API' },
  html_fetch:         { stage: 'content',    label: 'HTML Fetch',       icon: 'globe',         subtitle: 'Fallback HTTP fetch' },
  content_source:     { stage: 'content',    label: 'Content Source',   icon: 'check-circle' },
  classify:           { stage: 'classify',   label: 'Classified',       icon: 'brain',         subtitle: 'Topic, tags, region, sentiment' },
  research_decision:  { stage: 'research',   label: 'Decision',         icon: 'target',        subtitle: 'Whether research is needed' },
  firecrawl_search:   { stage: 'research',   label: 'Web Search',       icon: 'search',        subtitle: 'Related articles via search' },
  perplexity_context: { stage: 'research',   label: 'Background',       icon: 'globe',         subtitle: 'Context from Perplexity' },
  synthesis:          { stage: 'synthesis',   label: 'Synthesis',        icon: 'brain',         subtitle: 'AI brief (hook, narrative, facts)' },
  research:           { stage: 'synthesis',   label: 'Research Complete', icon: 'search' },
  detect_language:    { stage: 'translated',  label: 'Language',         icon: 'languages',     subtitle: 'Detect source language' },
  translate:          { stage: 'translated',  label: 'Translation',      icon: 'languages' },
  translate_content:  { stage: 'translated',  label: 'Translate Content', icon: 'languages',    subtitle: 'Article text → Arabic' },
  translate_analysis: { stage: 'translated',  label: 'Translate Fields', icon: 'brain',         subtitle: 'Classification fields → Arabic' },
  translate_research: { stage: 'translated',  label: 'Translate Brief',  icon: 'search',        subtitle: 'Research brief → Arabic' },
  title_translate:    { stage: 'title_translate', label: 'Title Translate', icon: 'languages',  subtitle: 'Arabic title + summary for scoring' },
  score_similarity:   { stage: 'score',       label: 'Competition Match', icon: 'target',       subtitle: 'Match vs. existing stories' },
  score_topic_demand: { stage: 'score',       label: 'Topic Demand',     icon: 'users',         subtitle: 'Competitor audience engagement' },
  score_niche:        { stage: 'score',       label: 'Niche Fit',        icon: 'target',        subtitle: 'Channel niche relevance' },
  score_ai_analysis:  { stage: 'score',       label: 'AI Scoring',       icon: 'brain',         subtitle: 'Relevance & viral scores' },
  score:              { stage: 'score',       label: 'Final Score',      icon: 'sparkles',      subtitle: 'Composite score' },
  threshold_gate:     { stage: 'score',       label: 'Threshold Gate',   icon: 'target',        subtitle: 'Dynamic score threshold check' },
  images:             { stage: 'images',      label: 'Image Search',     icon: 'image',         subtitle: 'SerpAPI Google Images' },
  promote:            { stage: 'promote',     label: 'Promote',          icon: 'check-circle' },
  transcript_fetch:   { stage: 'transcript',  label: 'Transcript',       icon: 'file-text',     subtitle: 'Fetch YouTube video transcript' },
  story_detect:       { stage: 'story_detect', label: 'Story Detect',    icon: 'brain',         subtitle: 'Detect stories in transcript' },
  story_split:        { stage: 'story_detect', label: 'Story Split',     icon: 'layers',        subtitle: 'Split transcript into stories' },
  verdict:            { stage: 'verdict',      label: 'Verdict',          icon: 'shield-check',  subtitle: 'Stage gate decision' },
}

function lp(step, data, display) {
  const meta = STEP_META[step] || { stage: 'unknown', label: step, icon: 'file-text' }
  return { step, ...meta, ...data, ...(display ? { display } : {}), at: new Date().toISOString() }
}

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
  log.push(lp('imported', {
    status: 'ok', processor: 'server',
    rawChars: (article.content || '').length,
    titlePreview: article.title || null,
    contentPreview: preview(article.content),
  }))
  log.push(lp('verdict', { stage: 'imported', result: 'pass', reason: `Queued for content extraction (${(article.content || '').length} raw chars)`, nextStage: 'content' }))
  await saveLog(article.id, log)
  return { nextStage: 'content' }
}

// ── Stage 2: content → classify ─────────────────────────────────────────────

async function doStageContent(article, project) {
  const log = getLog(article)
  const rawContent = article.content || ''
  const cleanedContent = stripHtml(rawContent).trim()

  log.push(lp('apify_content', {
    processor: 'server', service: 'Local (check Apify data)',
    chars: cleanedContent.length, threshold: MIN_CONTENT_LENGTH,
    contentPreview: preview(cleanedContent),
  }))

  if (cleanedContent.length >= MIN_CONTENT_LENGTH) {
    log.push(lp('content_source', { processor: 'server', source: 'apify', chars: cleanedContent.length, status: 'ok' }))
    log.push(lp('verdict', { stage: 'content', result: 'pass', reason: `Apify content sufficient (${cleanedContent.length} chars ≥ ${MIN_CONTENT_LENGTH})`, nextStage: 'classify' }))
    await db.article.update({
      where: { id: article.id },
      data: { contentClean: cleanedContent, processingLog: log },
    })
    return { nextStage: 'classify' }
  }

  let fetchedText = null
  const fcApiKey = await registry.getKey('firecrawl')
  if (fcApiKey) {
    try {
      const apiKey = fcApiKey
      const result = await scrapeUrl(apiKey, article.url)
      if (result.text) {
        fetchedText = preClean(result.text)
        log.push(lp('firecrawl', { processor: 'api', service: 'Firecrawl Scrape API', status: 'ok', chars: fetchedText.length }))
      } else {
        log.push(lp('firecrawl', { processor: 'api', service: 'Firecrawl Scrape API', status: 'failed', error: result.error || 'No text returned' }))
      }
    } catch (e) {
      log.push(lp('firecrawl', { processor: 'api', service: 'Firecrawl Scrape API', status: 'failed', error: e.message }))
    }
  } else {
    log.push(lp('firecrawl', { processor: 'api', service: 'Firecrawl Scrape API', status: 'skipped', reason: 'No API key' }))
  }

  if (!fetchedText) {
    try {
      const result = await fetchArticleText(article.url)
      if (result.text) {
        fetchedText = result.text
        log.push(lp('html_fetch', { processor: 'server', service: 'Direct HTTP fetch + HTML parse', status: 'ok', chars: fetchedText.length }))
      } else {
        log.push(lp('html_fetch', { processor: 'server', service: 'Direct HTTP fetch + HTML parse', status: 'failed', error: result.error || 'No text extracted' }))
      }
    } catch (e) {
      log.push(lp('html_fetch', { processor: 'server', service: 'Direct HTTP fetch + HTML parse', status: 'failed', error: e.message }))
    }
  }

  if (fetchedText && fetchedText.length >= MIN_CONTENT_LENGTH) {
    log.push(lp('content_source', { processor: 'server', source: 'firecrawl_or_html', chars: fetchedText.length, status: 'ok' }))
    log.push(lp('verdict', { stage: 'content', result: 'pass', reason: `External fetch succeeded (${fetchedText.length} chars)`, nextStage: 'classify' }))
    await db.article.update({
      where: { id: article.id },
      data: { contentClean: fetchedText, processingLog: log },
    })
    return { nextStage: 'classify' }
  }

  const fallbackText = [article.title, article.description, cleanedContent].filter(Boolean).join('\n\n').trim()
  if (fallbackText.length >= 100) {
    log.push(lp('content_source', { processor: 'server', source: 'title_desc_fallback', chars: fallbackText.length, status: 'ok' }))
    log.push(lp('verdict', { stage: 'content', result: 'pass', reason: `Title+description fallback (${fallbackText.length} chars)`, nextStage: 'classify' }))
    await db.article.update({
      where: { id: article.id },
      data: { contentClean: fallbackText, processingLog: log },
    })
    return { nextStage: 'classify' }
  }

  log.push(lp('content_source', { processor: 'server', source: 'none', status: 'review', reason: 'No usable content found' }))
  log.push(lp('verdict', { stage: 'content', result: 'review', reason: 'No usable content found from any source', nextStage: 'review' }))
  await saveLog(article.id, log)
  return { nextStage: 'content', reviewStatus: 'review', reviewReason: 'No usable content found' }
}

// ── Stage 3: classify → title_translate ──────────────────────────────────────
// Classifies in the article's ORIGINAL language. Arabic translation happens later.

async function doStageClassify(article, project) {
  const apiKey = await registry.requireKey('anthropic')
  const log = getLog(article)

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

  log.push(lp('classify', {
    status: analysis?.parseError ? 'parse_error' : 'ok',
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
  }))

  log.push(lp('verdict', { stage: 'classify', result: analysis?.parseError ? 'review' : 'pass', reason: analysis?.parseError ? 'AI response failed to parse' : `Classified as ${analysis?.contentType || 'unknown'} · language ${sourceLang}`, nextStage: 'title_translate' }))

  await db.article.update({
    where: { id: article.id },
    data: {
      analysis,
      language: sourceLang === 'unknown' ? 'other' : sourceLang,
      processingLog: log,
    },
  })

  return { nextStage: 'title_translate' }
}

// ── Stage 3b: title_translate → score ────────────────────────────────────────
// Lightweight Arabic translation of title + first 2 sentences for scoring/niche match.

async function doStageTitleTranslate(article, project) {
  const log = getLog(article)
  const freshArticle = await db.article.findUnique({ where: { id: article.id } })
  const art = freshArticle || article
  const analysis = art.analysis || {}
  const sourceLang = art.language || detectLanguage(art.contentClean || art.content || '')

  const title = art.title || ''
  const content = (art.contentClean || art.content || '').trim()
  const firstTwoSentences = content.split(/(?<=[.!?。؟])\s+/).slice(0, 2).join(' ')
  const textToTranslate = [title, firstTwoSentences].filter(Boolean).join('\n\n')

  if (!textToTranslate.trim() || textToTranslate.length < 10) {
    log.push(lp('title_translate', { processor: 'server', status: 'skipped', reason: 'No title or content to translate' }))
    log.push(lp('verdict', { stage: 'title_translate', result: 'skip', reason: 'No title or content available', nextStage: 'score' }))
    await saveLog(article.id, log)
    return { nextStage: 'score' }
  }

  if (sourceLang === 'ar') {
    const arAnalysis = { ...analysis, titleTranslateAr: textToTranslate }
    log.push(lp('title_translate', { processor: 'server', service: 'Skip (already Arabic)', status: 'skipped', reason: 'Already Arabic' }))
    log.push(lp('verdict', { stage: 'title_translate', result: 'skip', reason: 'Source is Arabic — no translation needed', nextStage: 'score' }))
    await db.article.update({
      where: { id: article.id },
      data: { analysis: arAnalysis, processingLog: log },
    })
    return { nextStage: 'score' }
  }

  const ttApiKey = await registry.getKey('anthropic')
  if (!ttApiKey) {
    log.push(lp('title_translate', { processor: 'server', status: 'skipped', reason: 'No Anthropic API key' }))
    log.push(lp('verdict', { stage: 'title_translate', result: 'skip', reason: 'No API key configured', nextStage: 'score' }))
    await saveLog(article.id, log)
    return { nextStage: 'score' }
  }

  try {
    const apiKey = ttApiKey
    const prompt = `Translate this news article title and opening to Arabic.\n` +
      `Preserve all names, dates, and facts exactly.\n` +
      `Output the Arabic text only, no commentary.\n\n` +
      textToTranslate

    const translated = await callAnthropic(apiKey, 'claude-haiku-4-5-20251001', [
      { role: 'user', content: prompt },
    ], {
      maxTokens: 1024,
      channelId: article.channelId,
      action: 'article-title-translate',
    })
    const usage = callAnthropic._lastUsage || {}

    const arText = (translated || '').trim()
    if (arText.length < 10) {
      log.push(lp('title_translate', { processor: 'ai', service: 'Anthropic Claude Haiku', status: 'partial', reason: 'Translation too short' }))
      log.push(lp('verdict', { stage: 'title_translate', result: 'pass', reason: 'Translation too short (non-blocking)', nextStage: 'score' }))
      await saveLog(article.id, log)
      return { nextStage: 'score' }
    }

    const arAnalysis = { ...analysis, titleTranslateAr: arText }
    log.push(lp('title_translate', {
      status: 'ok',
      processor: 'ai', service: 'Anthropic Claude Haiku',
      model: 'claude-haiku-4-5-20251001',
      inputChars: textToTranslate.length,
      outputChars: arText.length,
      inputTokens: usage.inputTokens || null,
      outputTokens: usage.outputTokens || null,
      totalTokens: usage.totalTokens || null,
    }))
    log.push(lp('verdict', { stage: 'title_translate', result: 'pass', reason: `Title translated to Arabic (${arText.length} chars)`, nextStage: 'score' }))

    await db.article.update({
      where: { id: article.id },
      data: { analysis: arAnalysis, processingLog: log },
    })
    return { nextStage: 'score' }
  } catch (e) {
    log.push(lp('title_translate', { processor: 'ai', service: 'Anthropic Claude Haiku', status: 'partial', error: `${e.message} (non-blocking)` }))
    log.push(lp('verdict', { stage: 'title_translate', result: 'pass', reason: 'Translation error (non-blocking)', nextStage: 'score' }))
    await saveLog(article.id, log)
    logger.warn({ articleId: article.id, error: e.message }, '[articleProcessor] title_translate failed (non-fatal)')
    return { nextStage: 'score' }
  }
}

// ── Stage 4: research → translated ──────────────────────────────────────────
// Runs BEFORE translation so web searches use the original language.

async function doStageResearch(article, project) {
  const log = getLog(article)

  const freshArticle = await db.article.findUnique({ where: { id: article.id } })
  const currentAnalysis = freshArticle?.analysis || article.analysis
  const decision = await needsResearch({ ...article, analysis: currentAnalysis })

  log.push(lp('research_decision', {
    processor: 'server', service: 'Local decision logic',
    needed: decision.needed,
    reason: decision.reason,
  }))

  if (!decision.needed) {
    log.push(lp('research', { status: 'skipped', reason: decision.reason }))
    log.push(lp('verdict', { stage: 'research', result: 'skip', reason: decision.reason, nextStage: 'translated' }))
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

    log.push(lp('research', {
      status: result.researchBrief ? 'ok' : 'partial',
      hasBrief: !!result.researchBrief,
      narrativeStrength: result.researchBrief?.narrativeStrength || null,
    }))

    // Store research results on article.analysis so score stage can include them in the story
    log.push(lp('verdict', { stage: 'research', result: result.researchBrief ? 'pass' : 'pass', reason: result.researchBrief ? 'Research brief generated' : 'Research completed (no brief)', nextStage: 'translated' }))
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
    log.push(lp('research', { status: 'partial', error: `${e.message} (non-blocking)` }))
    log.push(lp('verdict', { stage: 'research', result: 'pass', reason: 'Research failed (non-blocking, continuing)', nextStage: 'translated' }))
    await saveLog(article.id, log)
    logger.warn({ articleId: article.id, error: e.message }, '[articleProcessor] Research failed (non-fatal, continuing to translated)')
    return { nextStage: 'translated' }
  }
}

// ── Stage 6: translated → done ──────────────────────────────────────────────
// Translates EVERYTHING to Arabic: article content + all classification fields.
// Also promotes to Story at the end (only articles that passed the threshold reach here).

async function doStageTranslated(article, project) {
  const log = getLog(article)
  const text = article.contentClean || article.content || ''
  if (!text.trim()) {
    log.push(lp('translate', { status: 'review', reason: 'No content to translate' }))
    log.push(lp('verdict', { stage: 'translated', result: 'review', reason: 'No content available to translate', nextStage: 'review' }))
    await saveLog(article.id, log)
    return { nextStage: 'translated', reviewStatus: 'review', reviewReason: 'No content to translate' }
  }

  const freshArticle = await db.article.findUnique({ where: { id: article.id } })
  const analysis = freshArticle?.analysis || article.analysis || {}
  const sourceLang = article.language || detectLanguage(text)

  log.push(lp('detect_language', { processor: 'server', service: 'Local regex detection', detected: sourceLang }))

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
    log.push(lp('translate_content', { processor: 'server', service: 'Skip (already Arabic)', status: 'skipped', reason: 'Already Arabic' }))
    log.push(lp('translate_analysis', { processor: 'server', service: 'Skip (already Arabic)', status: 'skipped', reason: 'Already Arabic' }))
    log.push(lp('translate_research', { processor: 'server', service: 'Skip (already Arabic)', status: 'skipped', reason: 'Already Arabic' }))
    log.push(lp('verdict', { stage: 'translated', result: 'skip', reason: 'Source is already Arabic — no translation needed', nextStage: 'images' }))
    await db.article.update({
      where: { id: article.id },
      data: { contentAr: text, language: 'ar', analysis: arAnalysis, processingLog: log },
    })
    await promoteAfterTranslation(article, arAnalysis, log)
    return { nextStage: 'images' }
  }

  const apiKey = await registry.requireKey('anthropic')

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

  log.push(lp('translate_content', {
    status: 'ok',
    processor: 'ai', service: 'Anthropic Claude Haiku',
    model: 'claude-haiku-4-5-20251001',
    inputLang: sourceLang, inputChars: truncated.length, outputChars: translatedContent.trim().length,
    inputTokens: contentUsage.inputTokens || null,
    outputTokens: contentUsage.outputTokens || null,
    totalTokens: contentUsage.totalTokens || null,
    promptSent: contentPrompt.slice(0, 1500),
    rawResponse: translatedContent.trim().slice(0, 1500),
    quality: contentQuality,
  }))

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

    log.push(lp('translate_analysis', {
      status: 'ok',
      processor: 'ai', service: 'Anthropic Claude Haiku',
      model: 'claude-haiku-4-5-20251001',
      fieldsTranslated: Object.keys(parsed).length,
      inputTokens: analysisUsage.inputTokens || null,
      outputTokens: analysisUsage.outputTokens || null,
      totalTokens: analysisUsage.totalTokens || null,
      promptSent: analysisPrompt.slice(0, 1500),
      rawResponse: (translatedFields || '').trim().slice(0, 1500),
    }))
  } else {
    log.push(lp('translate_analysis', { processor: 'server', service: 'Skip (no fields)', status: 'skipped', reason: 'No classification fields to translate' }))
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
        log.push(lp('translate_research', {
          status: 'ok',
          processor: 'ai', service: 'Anthropic Claude Haiku',
          model: 'claude-haiku-4-5-20251001',
          inputChars: briefJson.length,
          outputChars: (translatedBriefRaw || '').trim().length,
          inputTokens: researchUsage.inputTokens || null,
          outputTokens: researchUsage.outputTokens || null,
          totalTokens: researchUsage.totalTokens || null,
          promptSent: researchPrompt.slice(0, 1500),
          rawResponse: (translatedBriefRaw || '').trim().slice(0, 1500),
        }))
      } else {
        log.push(lp('translate_research', { processor: 'ai', service: 'Anthropic Claude Haiku', status: 'partial', reason: 'Failed to parse translated brief JSON — non-blocking' }))
      }
    } catch (e) {
      log.push(lp('translate_research', { processor: 'ai', service: 'Anthropic Claude Haiku', status: 'partial', error: `${e.message} (non-blocking)` }))
      logger.warn({ articleId: article.id, error: e.message }, '[articleProcessor] translate_research failed (non-fatal)')
    }
  } else {
    log.push(lp('translate_research', { processor: 'server', service: 'Skip (no research brief)', status: 'skipped', reason: researchBrief ? 'Invalid brief' : 'No research brief' }))
  }

  log.push(lp('verdict', { stage: 'translated', result: 'pass', reason: `Translated to Arabic (${translatedContent.trim().length} chars)`, nextStage: 'images' }))

  await db.article.update({
    where: { id: article.id },
    data: {
      contentAr: translatedContent.trim(),
      language: sourceLang === 'unknown' ? 'other' : sourceLang,
      analysis: arAnalysis,
      processingLog: log,
    },
  })

  await promoteAfterTranslation(article, arAnalysis, log)
  return { nextStage: 'images' }
}

async function promoteAfterTranslation(article, analysis, log) {
  const freshArticle = await db.article.findUnique({ where: { id: article.id } })
  const art = freshArticle || article
  const finalScore = art.finalScore || 0
  const relevance = art.relevanceScore || 0
  const viralPotential = analysis.viralPotential || 0

  try {
    const promotedStoryId = await promoteToStory(art, analysis, relevance, viralPotential, finalScore, null, null)
    log.push(lp('promote', { processor: 'server', service: 'Database write (no 3rd party)', status: promotedStoryId ? 'created' : 'linked', storyId: promotedStoryId || null }))
    await saveLog(article.id, log)
  } catch (e) {
    log.push(lp('promote', { processor: 'server', service: 'Database write', status: 'failed', error: e.message }))
    await saveLog(article.id, log)
    logger.warn({ articleId: article.id, error: e.message }, '[articleProcessor] Story promotion failed (non-fatal)')
  }
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

// ── Stage 5: score → research (or filtered) ─────────────────────────────────
// Scoring runs BEFORE research/translation using the title_translate Arabic text.
// A dynamic threshold gate filters out low-scoring articles before expensive stages.

async function doStageScore(article, project) {
  const log = getLog(article)

  const freshArticle = await db.article.findUnique({ where: { id: article.id } })
  const art = freshArticle || article
  const analysis = art.analysis || {}

  if (analysis.parseError) {
    log.push(lp('score_similarity', { status: 'skipped', reason: 'Classification had parse error' }))
    log.push(lp('score_ai_analysis', { status: 'skipped', reason: 'Classification parse error' }))
    log.push(lp('score', { status: 'skipped', reason: 'Classification parse error' }))
    log.push(lp('promote', { status: 'skipped', reason: 'Classification parse error' }))
    log.push(lp('verdict', { stage: 'score', result: 'skip', reason: 'Skipped due to classification parse error', nextStage: 'done' }))
    await saveLog(article.id, log)
    return { nextStage: 'done' }
  }

  let scoreEmbedding = null
  let similarVideos = []
  let relevance = 0
  let viralPotential = 0
  let sentiment = 'neutral'

  // ── Sub-step A: score_similarity (using title_translate Arabic for embedding) ──
  const embAvailable = await registry.hasKey('embedding')
  if (embAvailable) {
    try {
      const { generateEmbedding, buildEmbeddingText, findSimilarVideos } = require('./embeddings')
      const titleTranslateAr = analysis.titleTranslateAr || ''
      const embData = {
        topic: titleTranslateAr || analysis.topic,
        tags: analysis.tags,
        summary: titleTranslateAr || analysis.summary,
        region: analysis.region,
        uniqueAngle: analysis.uniqueAngle,
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
        log.push(lp('score_similarity', {
          processor: 'server',
          service: 'OpenAI Embeddings + pgvector',
          status: 'ok',
          embeddingInputChars: embText.length,
          matchCount: similarVideos.length,
          topMatch: similarVideos[0] ? { title: similarVideos[0].title, similarity: similarVideos[0].similarity } : null,
          similarVideos,
        }, [
          { type: 'stat', label: 'Embedding Input', value: `${embText.length} chars` },
          { type: 'stat', label: 'Matches', value: `${similarVideos.length}` },
          ...(similarVideos.length > 0 ? [{ type: 'list', items: similarVideos.slice(0, 5).map(v => ({ title: v.title || '—', subtitle: `${(v.similarity || 0).toFixed(2)} match · ${(v.views || 0).toLocaleString()} views` })) }] : []),
        ]))
      } else {
        log.push(lp('score_similarity', { processor: 'server', service: 'OpenAI Embeddings', status: 'skipped', reason: 'Not enough Arabic text for embedding' }))
      }
    } catch (e) {
      log.push(lp('score_similarity', { processor: 'api', service: 'OpenAI Embeddings + pgvector', status: 'failed', error: e.message }))
    }
  } else {
    log.push(lp('score_similarity', { processor: 'api', service: 'OpenAI Embeddings', status: 'skipped', reason: 'No embedding key' }))
  }

  // ── Sub-step A1: topicDemand — did competitor audiences engage with this topic? ──
  let topicDemand = 0
  let topicDemandVideos = []

  if (similarVideos.length > 0) {
    try {
      const { findSimilarVideosWithStats } = require('./embeddings')
      const rawSimilar = scoreEmbedding
        ? await findSimilarVideosWithStats(scoreEmbedding, article.channelId, 5)
        : []

      const MIN_SIMILARITY = 0.50
      const genuinelySimilar = rawSimilar.filter(v => Number(v.similarity) >= MIN_SIMILARITY)

      if (genuinelySimilar.length > 0) {
        topicDemandVideos = genuinelySimilar
        const channelIds = [...new Set(genuinelySimilar.map(v => v.channelId))]
        const avgViewsMap = {}
        await Promise.all(channelIds.map(async (cid) => {
          const agg = await db.video.aggregate({
            where: { channelId: cid },
            _avg: { viewCount: true },
          })
          avgViewsMap[cid] = Number(agg._avg?.viewCount || 0) || 1
        }))

        const ratios = genuinelySimilar.map(v => {
          const avg = avgViewsMap[v.channelId] || 1
          return Number(v.viewCount) / avg
        })

        const avgRatio = ratios.reduce((a, b) => a + b, 0) / ratios.length
        topicDemand = Math.round(Math.min(1.0, avgRatio / 2.0) * 100) / 100

        log.push(lp('score_topic_demand', {
          processor: 'server',
          service: 'competitor performance analysis',
          status: 'ok',
          similarCount: genuinelySimilar.length,
          avgPerformanceRatio: Math.round(avgRatio * 100) / 100,
          topicDemand,
        }, [
          { type: 'gauge', label: 'Topic Demand', value: topicDemand },
          { type: 'stat', label: 'Videos Analysed', value: `${genuinelySimilar.length} competitor videos` },
          { type: 'stat', label: 'Avg Performance', value: `${(Math.round(avgRatio * 100) / 100)}× channel average` },
        ]))
      } else {
        log.push(lp('score_topic_demand', { status: 'skipped', reason: 'No competitor videos above similarity threshold (0.50)', topicDemand: 0 }))
      }
    } catch (e) {
      log.push(lp('score_topic_demand', { status: 'failed', error: e.message, topicDemand: 0 }))
    }
  } else {
    log.push(lp('score_topic_demand', { status: 'skipped', reason: 'No similar videos', topicDemand: 0 }))
  }

  // ── Sub-step A2: nicheScore — cosine similarity between article and channel niche ──
  let nicheScore = 0
  if (scoreEmbedding) {
    try {
      const { getNicheEmbedding } = require('./embeddings')
      const nicheVec = await getNicheEmbedding(article.channelId)
      if (nicheVec) {
        let dot = 0
        for (let i = 0; i < scoreEmbedding.length; i++) {
          dot += scoreEmbedding[i] * nicheVec[i]
        }
        nicheScore = Math.max(0, Math.min(1, dot))
        log.push(lp('score_niche', {
          processor: 'server',
          service: 'pgvector cosine similarity',
          nicheScore: Math.round(nicheScore * 100) / 100,
          status: 'ok',
        }, [
          { type: 'gauge', label: 'Niche Score', value: Math.round(nicheScore * 100) / 100 },
        ]))
      } else {
        log.push(lp('score_niche', { status: 'skipped', reason: 'No niche embedding generated yet' }))
      }
    } catch (e) {
      log.push(lp('score_niche', { status: 'failed', error: e.message }))
    }
  }

  // ── Sub-step B: score_ai_analysis (AI scoring on original content — runs before full translation) ──
  const contentForScoring = art.contentClean || art.content || ''
  const scoreApiKey = await registry.getKey('anthropic')
  if (scoreApiKey && contentForScoring.trim().length > 50) {
    try {
      const apiKey = scoreApiKey
      const competitionContext = similarVideos.length > 0
        ? '\n\nCompetition (similar Arabic videos already in DB):\n' +
          similarVideos.map(v => `- "${v.title}" (similarity: ${v.similarity})`).join('\n')
        : ''
      const scoringPrompt = `You are a news analyst for an Arabic YouTube audience. Analyze this article and respond with JSON only (no markdown, no explanation).

Keys:
- sentiment: "positive" | "negative" | "neutral" (how Arabic-speaking audiences will react emotionally)
- viralPotential: 0.0 to 1.0 — how likely this will get shares and engagement among Arabic audiences
- relevance: 0.0 to 1.0 — how relevant is this to audiences interested in true crime, mysteries, investigations, and untold stories
${competitionContext}

Article:
${contentForScoring.slice(0, 15000)}`

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
        log.push(lp('score_ai_analysis', {
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
        }, [
          { type: 'stat', label: 'Sentiment', value: sentiment },
          { type: 'gauge', label: 'Viral Potential', value: viralPotential },
          { type: 'gauge', label: 'Relevance', value: relevance },
          { type: 'expandable', label: 'Prompt', text: scoringPrompt.slice(0, 1500) },
          { type: 'expandable', label: 'Response', text: (raw || '').slice(0, 1500) },
        ]))
      } else {
        log.push(lp('score_ai_analysis', { processor: 'ai', service: 'Anthropic Claude Haiku', status: 'parse_error', rawResponse: (raw || '').slice(0, 500) }))
      }
    } catch (e) {
      log.push(lp('score_ai_analysis', { processor: 'ai', service: 'Anthropic Claude Haiku', status: 'failed', error: e.message }))
    }
  } else {
      log.push(lp('score_ai_analysis', { processor: 'ai', service: 'Anthropic Claude Haiku', status: 'skipped', reason: contentForScoring.trim().length <= 50 ? 'No content' : 'No Anthropic key' }))
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

  let rawScore
  const hasNiche = nicheScore > 0
  const hasDemand = topicDemand > 0

  if (hasNiche && hasDemand) {
    rawScore = relevance * 0.20 + viralPotential * 0.15 + nicheScore * 0.40 + topicDemand * 0.25
  } else if (hasNiche) {
    rawScore = relevance * 0.30 + viralPotential * 0.25 + nicheScore * 0.45
  } else {
    rawScore = relevance * 0.35 + viralPotential * 0.30 + freshness * 0.35
  }
  const finalScore = Math.round(Math.min(1, Math.max(0, rawScore * 0.60 + preferenceBias * 0.40 - competitionPenalty)) * 100) / 100

  const tier = (hasNiche && hasDemand) ? 1 : (hasNiche ? 2 : 3)
  const tierLabel = tier === 1 ? 'Niche + Demand' : tier === 2 ? 'Niche Only' : 'Fallback'
  const tierVariant = tier === 1 ? 'success' : tier === 2 ? 'primary' : 'muted'

  let breakdownRows
  if (tier === 1) {
    breakdownRows = [
      { label: 'Relevance', value: relevance, weight: 0.20 },
      { label: 'Viral Potential', value: viralPotential, weight: 0.15 },
      { label: 'Niche Fit', value: Math.round(nicheScore * 100) / 100, weight: 0.40 },
      { label: 'Topic Demand', value: topicDemand, weight: 0.25 },
    ]
  } else if (tier === 2) {
    breakdownRows = [
      { label: 'Relevance', value: relevance, weight: 0.30 },
      { label: 'Viral Potential', value: viralPotential, weight: 0.25 },
      { label: 'Niche Fit', value: Math.round(nicheScore * 100) / 100, weight: 0.45 },
    ]
  } else {
    breakdownRows = [
      { label: 'Relevance', value: relevance, weight: 0.35 },
      { label: 'Viral', value: viralPotential, weight: 0.30 },
      { label: 'Freshness', value: Math.round(freshness * 100) / 100, weight: 0.35 },
    ]
  }

  log.push(lp('score', {
    processor: 'server',
    service: 'Score computation',
    relevance,
    viralPotential,
    freshness: Math.round(freshness * 100) / 100,
    nicheScore: Math.round(nicheScore * 100) / 100,
    nicheActive: nicheScore > 0,
    topicDemand,
    topicDemandSimilarCount: topicDemandVideos?.length || 0,
    preferenceBias: Math.round(preferenceBias * 100) / 100,
    competitionPenalty,
    finalScore,
    tier,
  }, [
    { type: 'badge', label: tierLabel, variant: tierVariant },
    { type: 'breakdown', rows: breakdownRows },
    { type: 'formula', raw: Math.round(rawScore * 1000) / 1000, adjustments: [
      ...(Math.round(preferenceBias * 100) / 100 !== 0 ? [{ label: 'Pref', value: Math.round(preferenceBias * 100) / 100 }] : []),
      ...(competitionPenalty > 0 ? [{ label: 'Penalty', value: -competitionPenalty }] : []),
    ], final: finalScore },
  ]))

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

  // ── Sub-step D: threshold gate ──
  try {
    const profile = await db.scoreProfile.findFirst({
      where: { channelId: art.channelId },
      orderBy: { updatedAt: 'desc' },
    })
    const totalDecisions = profile?.totalDecisions || 0
    const threshold = computeDynamicThreshold(totalDecisions)

    if (profile) {
      await db.scoreProfile.update({
        where: { id: profile.id },
        data: { currentThreshold: threshold },
      })
    }

    if (finalScore < threshold) {
      log.push(lp('threshold_gate', {
        processor: 'server',
        service: 'Threshold gate (no 3rd party)',
        status: 'filtered',
        reason: 'Score below threshold',
        finalScore,
        threshold,
        totalDecisions,
      }))
      log.push(lp('verdict', { stage: 'score', result: 'fail', reason: `Score ${finalScore.toFixed(2)} below threshold ${threshold.toFixed(2)}`, nextStage: 'filtered' }))
      await db.article.update({
        where: { id: article.id },
        data: { stage: 'filtered', processingLog: log },
      })
      return { nextStage: 'filtered' }
    }

    log.push(lp('threshold_gate', {
      processor: 'server',
      service: 'Threshold gate (no 3rd party)',
      status: 'passed',
      finalScore,
      threshold,
      totalDecisions,
    }))
    log.push(lp('verdict', { stage: 'score', result: 'pass', reason: `Score ${finalScore.toFixed(2)} passed threshold ${threshold.toFixed(2)}`, nextStage: 'research' }))
    await saveLog(article.id, log)
  } catch (e) {
    log.push(lp('threshold_gate', { processor: 'server', status: 'error', error: e.message + ' (non-blocking, allowing through)' }))
    await saveLog(article.id, log)
    logger.warn({ articleId: article.id, error: e.message }, '[articleProcessor] threshold gate error (non-fatal, allowing through)')
  }

  return { nextStage: 'research' }
}

// ── Quality evaluators ───────────────────────────────────────────────────────

function computeDynamicThreshold(totalDecisions) {
  const BASE = 0.30
  const MIN = 0.15
  const MAX = 0.60
  const k = 0.02
  const raw = BASE + k * Math.log1p(totalDecisions)
  return Math.min(MAX, Math.max(MIN, Math.round(raw * 1000) / 1000))
}

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
  const compositeScore = finalScoreToComposite(finalScore)

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
      finalScore,
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
      const embKeyAvailable = await registry.hasKey('embedding')
      if (embKeyAvailable) {
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

  // Copy draft script from article's script stage into the story brief
  if (analysis.draftScript) {
    const scriptBrief = { ...brief, ...analysis.draftScript }
    try {
      await db.story.update({
        where: { id: story.id },
        data: { brief: scriptBrief },
      })
    } catch (e) {
      logger.warn({ storyId: story.id, error: e.message }, '[articleProcessor] copy draft script to story failed (non-fatal)')
    }
  }

  return story.id
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

function parseAutoScript(text) {
  const raw = (text || '').trim()
  const sections = {}
  const sectionNames = ['TITLE', 'SCRIPT', 'HASHTAGS']
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
    script: sections.SCRIPT || raw,
    youtubeTags,
  }
}

// ── Stage: images → done ────────────────────────────────────────────────────
// Searches SerpAPI Google Images Light for article-related images,
// saves results to analysis.images, and downloads originals into a
// locked "Stories" gallery album per channel.

async function getOrCreateStoriesAlbum(channelId) {
  let album = await db.galleryAlbum.findFirst({
    where: { channelId, name: 'Stories', isLocked: true },
    select: { id: true, createdById: true },
  })
  if (album) return album

  const admin = await db.user.findFirst({
    where: { isActive: true, role: { in: ['owner', 'admin'] } },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  })
  if (!admin) return null

  album = await db.galleryAlbum.create({
    data: {
      channelId,
      name: 'Stories',
      description: 'Auto-generated images from the article pipeline',
      isLocked: true,
      createdById: admin.id,
    },
    select: { id: true, createdById: true },
  })
  return album
}

async function saveImagesToGallery(channelId, images, articleTitle) {
  const { v4: uuidv4 } = require('uuid')
  const { putObject } = require('./r2')

  const album = await getOrCreateStoriesAlbum(channelId)
  if (!album) return 0

  let saved = 0
  for (const img of images) {
    const imageUrl = img.original || img.thumbnail
    if (!imageUrl) continue

    try {
      const resp = await fetch(imageUrl, { signal: AbortSignal.timeout(15000) })
      if (!resp.ok) continue

      const contentType = resp.headers.get('content-type') || 'image/jpeg'
      const buffer = Buffer.from(await resp.arrayBuffer())
      if (buffer.length < 500) continue

      const ext = contentType.includes('png') ? 'png'
        : contentType.includes('webp') ? 'webp'
        : contentType.includes('gif') ? 'gif'
        : 'jpg'
      const r2Key = `gallery/${channelId}/${uuidv4()}.${ext}`
      const r2Url = await putObject(r2Key, buffer, contentType)

      await db.galleryMedia.create({
        data: {
          channelId,
          albumId: album.id,
          type: 'PHOTO',
          fileName: `${(articleTitle || 'image').slice(0, 80)}.${ext}`,
          fileSize: BigInt(buffer.length),
          mimeType: contentType,
          r2Key,
          r2Url,
          uploadedById: album.createdById,
          metadata: { source: img.source, link: img.link, title: img.title },
        },
      })
      saved++
    } catch (e) {
      logger.warn({ imageUrl, error: e.message }, '[articleProcessor] gallery image download failed (non-fatal)')
    }
  }
  return saved
}

async function doStageImages(article, project) {
  const log = getLog(article)

  const title = article.title
  if (!title || !title.trim()) {
    log.push(lp('images', { status: 'skipped', reason: 'No title for image search' }))
    log.push(lp('verdict', { stage: 'images', result: 'skip', reason: 'No title available for image search', nextStage: 'done' }))
    await saveLog(article.id, log)
    return { nextStage: 'done' }
  }

  const keys = await db.googleSearchKey.findMany({
    where: { isActive: true },
    orderBy: [{ lastUsedAt: { sort: 'asc', nulls: 'first' } }, { sortOrder: 'asc' }],
  })

  if (!keys.length) {
    log.push(lp('images', { status: 'skipped', reason: 'No active Google Search API key configured' }))
    log.push(lp('verdict', { stage: 'images', result: 'skip', reason: 'No Google Search API key', nextStage: 'done' }))
    await saveLog(article.id, log)
    return { nextStage: 'done' }
  }

  const keyEntry = keys[0]
  const apiKey = decrypt(keyEntry.encryptedKey)

  await db.googleSearchKey.update({
    where: { id: keyEntry.id },
    data: { lastUsedAt: new Date(), usageCount: { increment: 1 } },
  })

  try {
    const url = new URL('https://serpapi.com/search')
    url.searchParams.set('engine', 'google_images_light')
    url.searchParams.set('q', title.trim())
    url.searchParams.set('api_key', apiKey)

    const resp = await fetch(url.toString(), { signal: AbortSignal.timeout(30000) })
    if (!resp.ok) {
      throw new Error(`SerpAPI responded ${resp.status}: ${resp.statusText}`)
    }
    const data = await resp.json()

    const rawImages = (data.images_results || []).slice(0, 10)
    const images = rawImages.map(img => ({
      thumbnail: img.thumbnail || null,
      original: img.original || null,
      title: img.title || null,
      source: img.source || null,
      link: img.link || null,
    }))

    const freshArticle = await db.article.findUnique({ where: { id: article.id } })
    const analysis = { ...(freshArticle?.analysis || article.analysis || {}), images }

    log.push(lp('images', {
      status: 'ok',
      processor: 'api',
      service: 'SerpAPI Google Images Light',
      query: title.trim(),
      resultCount: images.length,
      keyLabel: keyEntry.label,
    }))
    log.push(lp('verdict', { stage: 'images', result: 'pass', reason: `${images.length} images found`, nextStage: 'done' }))

    await db.article.update({
      where: { id: article.id },
      data: { analysis, processingLog: log },
    })

    if (images.length > 0) {
      try {
        const gallerySaved = await saveImagesToGallery(article.channelId, images, article.title)
        logger.info({ articleId: article.id, gallerySaved }, '[articleProcessor] images saved to gallery')
      } catch (e) {
        logger.warn({ articleId: article.id, error: e.message }, '[articleProcessor] gallery save failed (non-fatal)')
      }
    }

    return { nextStage: 'done' }
  } catch (e) {
    log.push(lp('images', {
      status: 'error',
      error: e.message,
      processor: 'api',
      service: 'SerpAPI Google Images Light',
    }))
    log.push(lp('verdict', { stage: 'images', result: 'pass', reason: 'Image search failed (non-blocking)', nextStage: 'done' }))
    await saveLog(article.id, log)
    logger.warn({ articleId: article.id, error: e.message }, '[articleProcessor] images stage failed (non-fatal)')
    return { nextStage: 'done' }
  }
}

const SERVICE_DESCRIPTOR = {
  name: 'google_search',
  displayName: 'SerpAPI (Google Images Light)',
  keySource: 'googleSearchKey',
}

// ── Stage: transcript → story_detect ────────────────────────────────────────
// Fetches the YouTube transcript for a video. Only runs for youtube_channel sources.

async function doStageTranscript(article, project) {
  const log = getLog(article)

  const videoIdMatch = (article.url || '').match(/[?&]v=([\w-]{11})/)
  const videoId = videoIdMatch ? videoIdMatch[1] : null

  if (!videoId) {
    log.push(lp('transcript_fetch', { status: 'review', reason: 'Could not extract YouTube video ID from URL' }))
    log.push(lp('verdict', { stage: 'transcript', result: 'review', reason: 'Invalid YouTube URL — could not extract video ID', nextStage: 'review' }))
    await saveLog(article.id, log)
    return { nextStage: 'transcript', reviewStatus: 'review', reviewReason: 'Invalid YouTube URL — could not extract video ID' }
  }

  // Try youtube-transcript.io first, fall back to Whisper
  let transcriptText = null
  let transcriptSource = null

  const ytTranscriptAvailable = await registry.hasKey('yt-transcript')
  if (ytTranscriptAvailable) {
    try {
      const { fetchTranscript } = require('./transcript')
      const result = await fetchTranscript(videoId, article.channelId)

      if (Array.isArray(result) && result.length > 0) {
        transcriptText = result.map(s => s.text).join(' ')
        transcriptSource = 'youtube-transcript-io'
      } else if (typeof result === 'string' && result.length > 0) {
        transcriptText = result
        transcriptSource = 'youtube-transcript-io'
      }

      if (transcriptText) {
        log.push(lp('transcript_fetch', {
          processor: 'api', service: 'YouTube Transcript API',
          status: 'ok', source: transcriptSource,
          chars: transcriptText.length,
          segments: Array.isArray(result) ? result.length : null,
        }))
      } else {
        log.push(lp('transcript_fetch', {
          processor: 'api', service: 'YouTube Transcript API',
          status: 'empty', reason: 'No transcript returned',
        }))
      }
    } catch (e) {
      log.push(lp('transcript_fetch', {
        processor: 'api', service: 'YouTube Transcript API',
        status: 'failed', error: e.message,
      }))
    }
  }

  if (!transcriptText) {
    log.push(lp('transcript_fetch', {
      status: 'review',
      reason: ytTranscriptAvailable ? 'Transcript API returned no content' : 'No transcript API key configured',
    }))
    log.push(lp('verdict', { stage: 'transcript', result: 'review', reason: ytTranscriptAvailable ? 'Transcript API returned no content' : 'No transcript API key configured', nextStage: 'review' }))
    await saveLog(article.id, log)
    return {
      nextStage: 'transcript',
      reviewStatus: 'review',
      reviewReason: 'Could not fetch transcript for this video',
    }
  }

  // Fetch video metadata for better title/description
  try {
    const { fetchVideoMetadata } = require('./youtube')
    const meta = await fetchVideoMetadata(videoId, article.channelId)
    const analysis = article.analysis || {}
    analysis.youtubeId = videoId
    analysis.originalTitle = meta.titleAr || meta.titleEn || null
    analysis.originalDescription = (meta.description || '').slice(0, 500) || null
    if (meta.thumbnailUrl) analysis.thumbnailUrl = meta.thumbnailUrl
    if (meta.duration) analysis.duration = meta.duration
    log.push(lp('verdict', { stage: 'transcript', result: 'pass', reason: `Transcript fetched (${transcriptText.length} chars)`, nextStage: 'story_detect' }))
    const updateData = {
      content: transcriptText,
      contentClean: transcriptText,
      processingLog: log,
      analysis,
    }
    if (meta.publishedAt) updateData.publishedAt = meta.publishedAt
    await db.article.update({ where: { id: article.id }, data: updateData })
  } catch (e) {
    log.push(lp('verdict', { stage: 'transcript', result: 'pass', reason: `Transcript fetched (${transcriptText.length} chars), metadata failed`, nextStage: 'story_detect' }))
    await db.article.update({
      where: { id: article.id },
      data: { content: transcriptText, contentClean: transcriptText, processingLog: log },
    })
    logger.warn({ articleId: article.id, error: e.message }, '[article-processor] video metadata fetch failed, transcript saved')
  }

  return { nextStage: 'story_detect' }
}

// ── Stage: story_detect → classify (or adapter_done) ────────────────────────
// Uses AI to detect distinct stories inside a video transcript.
// Single story: article continues to classify.
// Multiple stories: creates child articles, parent goes to adapter_done.

async function doStageStoryDetect(article, project) {
  const log = getLog(article)
  const transcript = article.contentClean || article.content || ''

  if (transcript.length < 100) {
    log.push(lp('story_detect', { status: 'review', reason: 'Transcript too short for story detection' }))
    log.push(lp('verdict', { stage: 'story_detect', result: 'review', reason: `Transcript too short (${transcript.length} chars)`, nextStage: 'review' }))
    await saveLog(article.id, log)
    return { nextStage: 'story_detect', reviewStatus: 'review', reviewReason: 'Transcript too short' }
  }

  const apiKey = await registry.requireKey('anthropic')

  const prompt = `You are analyzing a YouTube video transcript to identify distinct news stories or topics covered.

Read this transcript carefully and identify each separate story, topic, or news item discussed.

For each story, provide:
- title: A clear, concise headline for this story in the SAME language as the transcript
- summary: A 2-3 sentence summary of what this story covers in the SAME language as the transcript
- content: The relevant portion of the transcript for this story (copy the exact text)

Respond with JSON only. Format:
{
  "stories": [
    { "title": "...", "summary": "...", "content": "..." }
  ]
}

Rules:
- If the entire video is about ONE topic, return exactly 1 story
- Only split when there are genuinely distinct topics/stories
- Each story must have substantial content (at least 2-3 sentences of transcript)
- Keep EVERYTHING in the original language of the transcript — do NOT translate
- Content must be copied exactly from the transcript

Transcript:
${transcript.slice(0, 30000)}`

  let stories = null
  try {
    const raw = await callAnthropic(apiKey, 'claude-haiku-4-5-20251001', [
      { role: 'user', content: prompt },
    ], {
      maxTokens: 4096,
      channelId: article.channelId,
      action: 'article-story-detect',
    })
    const usage = callAnthropic._lastUsage || {}

    try {
      const trimmed = (raw || '').trim()
      const start = trimmed.indexOf('{')
      const end = trimmed.lastIndexOf('}') + 1
      if (start !== -1 && end > start) {
        const parsed = JSON.parse(trimmed.slice(start, end))
        if (Array.isArray(parsed.stories) && parsed.stories.length > 0) {
          stories = parsed.stories.filter(s => s.title && s.content && s.content.length >= 50)
        }
      }
    } catch (_) {}

    log.push(lp('story_detect', {
      processor: 'ai', service: 'Anthropic Claude Haiku',
      model: 'claude-haiku-4-5-20251001',
      status: stories ? 'ok' : 'parse_error',
      storiesDetected: stories ? stories.length : 0,
      inputTokens: usage.inputTokens || null,
      outputTokens: usage.outputTokens || null,
    }))
  } catch (e) {
    log.push(lp('story_detect', { processor: 'ai', service: 'Anthropic Claude Haiku', status: 'failed', error: e.message }))
    await saveLog(article.id, log)
    throw e
  }

  if (!stories || stories.length === 0) {
    log.push(lp('story_detect', { status: 'review', reason: 'AI could not detect stories in transcript' }))
    log.push(lp('verdict', { stage: 'story_detect', result: 'review', reason: 'AI could not detect stories in transcript', nextStage: 'review' }))
    await saveLog(article.id, log)
    return { nextStage: 'story_detect', reviewStatus: 'review', reviewReason: 'Could not detect stories in transcript' }
  }

  // Single story — keep the full transcript, just set title/summary from AI
  if (stories.length === 1) {
    const story = stories[0]
    log.push(lp('story_split', { status: 'ok', action: 'single', storiesDetected: 1 }))
    log.push(lp('verdict', { stage: 'story_detect', result: 'pass', reason: 'Single story detected — continuing to classify', nextStage: 'classify' }))
    await db.article.update({
      where: { id: article.id },
      data: {
        title: story.title || article.title,
        description: story.summary || article.description,
        processingLog: log,
      },
    })
    return { nextStage: 'classify' }
  }

  // Multiple stories — each child gets the full transcript with its story context
  // The title+description scope what this story is about; the full transcript
  // provides context for classify/research/translate to work with
  const children = stories.map((story, i) => ({
    channelId: article.channelId,
    sourceId: article.sourceId,
    parentArticleId: article.id,
    url: `${article.url}#story-${i + 1}`,
    title: story.title,
    description: story.summary || null,
    content: transcript,
    contentClean: transcript,
    publishedAt: article.publishedAt,
    language: null,
    stage: 'classify',
    status: 'queued',
  }))

  const { count } = await db.article.createMany({ data: children, skipDuplicates: true })

  log.push(lp('story_split', {
    status: 'ok', action: 'split',
    storiesDetected: stories.length,
    childrenCreated: count,
    childUrls: children.map(c => c.url),
  }))
  log.push(lp('verdict', { stage: 'story_detect', result: 'pass', reason: `Split into ${stories.length} stories → ${count} child articles`, nextStage: 'adapter_done' }))
  await saveLog(article.id, log)

  logger.info({
    articleId: article.id, storiesDetected: stories.length, childrenCreated: count,
  }, '[article-processor] transcript split into stories')

  return { nextStage: 'adapter_done' }
}

module.exports = {
  doStageImported,
  doStageContent,
  doStageClassify,
  doStageTitleTranslate,
  doStageScore,
  doStageResearch,
  doStageTranslated,
  doStageImages,
  doStageTranscript,
  doStageStoryDetect,
  STEP_META,
  computeDynamicThreshold,
  SERVICE_DESCRIPTOR,
}
