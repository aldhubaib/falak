/**
 * Style DNA Analyzer — builds a deep, structured writing-style profile
 * from a channel's published video transcripts.
 *
 * Uses Claude Sonnet for analytical extraction (best at structured reasoning),
 * then stores the result in Channel.styleDna for script generation.
 *
 * The profile is channel-agnostic — any channel with ≥5 transcripts can build one.
 */
const db = require('../lib/db')
const { callAnthropicLogged } = require('./aiLogger')
const registry = require('../lib/serviceRegistry')
const logger = require('../lib/logger')

const MIN_TRANSCRIPTS = 5
const MAX_TRANSCRIPTS_TO_ANALYZE = 30
const TRANSCRIPT_SLICE = 15000

/**
 * Pipeline stage definitions — single source of truth.
 * The frontend fetches these and renders the visual pipeline dynamically.
 */
const PIPELINE_STAGES = [
  { id: 'clear', label: 'Clear Old DNA', icon: 'trash-2' },
  { id: 'load_transcripts', label: 'Load Transcripts', icon: 'file-text' },
  { id: 'load_directions', label: 'Load Directions', icon: 'navigation' },
  { id: 'analyze', label: 'AI Analysis', icon: 'brain' },
  { id: 'parse', label: 'Parse Results', icon: 'code' },
  { id: 'save', label: 'Save Profile', icon: 'save' },
  { id: 'validate', label: 'Validate Quality', icon: 'check-circle' },
]

/**
 * Convert stored transcription (JSON segments or plain string) to plain text.
 * Duplicated from pipelineProcessor (not exported there).
 */
function segmentsToText(transcription) {
  if (!transcription) return ''
  try {
    const parsed = JSON.parse(transcription)
    if (Array.isArray(parsed)) {
      return parsed.map(s => s.text || '').join('\n').trim()
    }
  } catch (_) {}
  return String(transcription)
}

/**
 * Count words in Arabic text (approximation — splits on whitespace).
 */
function wordCount(text) {
  return text.split(/\s+/).filter(Boolean).length
}

/**
 * Build Style DNA for a channel by analyzing its video transcripts.
 * @param {string} channelId
 * @param {object} [opts]
 * @param {(event: object) => void} [opts.onProgress] - callback for streaming progress events
 * @returns {Promise<object>} The built Style DNA profile
 */
async function buildStyleDna(channelId, opts = {}) {
  const { onProgress } = opts
  const emit = (stage, status, detail) => {
    if (onProgress) onProgress({ stage, status, detail })
  }
  const tag = `[styleDna:${channelId.slice(-6)}]`

  // Stage: clear
  emit('clear', 'running')
  await db.channel.update({
    where: { id: channelId },
    data: { styleDna: null, styleDnaBuiltAt: null },
  }).catch(() => {})
  emit('clear', 'done')

  // Stage: load_transcripts
  emit('load_transcripts', 'running')
  const channel = await db.channel.findUnique({
    where: { id: channelId },
    select: { id: true, nameAr: true, handle: true, nationality: true },
  })
  if (!channel) throw new Error('Channel not found')

  const videos = await db.video.findMany({
    where: {
      channelId,
      transcription: { not: null },
    },
    select: {
      id: true,
      titleAr: true,
      titleEn: true,
      transcription: true,
      duration: true,
      viewCount: true,
      publishedAt: true,
      videoType: true,
      analysisResult: true,
    },
    orderBy: { publishedAt: 'desc' },
    take: MAX_TRANSCRIPTS_TO_ANALYZE,
  })

  const withText = videos.filter(v => {
    const text = segmentsToText(v.transcription)
    return text.length > 100
  })

  if (withText.length < MIN_TRANSCRIPTS) {
    const msg = `Need at least ${MIN_TRANSCRIPTS} transcripts to build Style DNA. Found ${withText.length} for channel "${channel.nameAr}".`
    emit('load_transcripts', 'error', msg)
    throw new Error(msg)
  }
  emit('load_transcripts', 'done', `${withText.length} transcripts loaded`)

  logger.info({ channelId, transcriptCount: withText.length }, `${tag} analyzing transcripts`)

  const apiKey = await registry.requireKey('anthropic')

  // Phase 1: Analyze each transcript with temporal context
  const now = new Date()
  const transcriptAnalyses = []
  for (const video of withText) {
    const text = segmentsToText(video.transcription).slice(0, TRANSCRIPT_SLICE)
    const title = video.titleAr || video.titleEn || 'untitled'
    const words = wordCount(text)
    const analysis = video.analysisResult || {}
    const pubDate = video.publishedAt ? new Date(video.publishedAt) : null
    const ageMonths = pubDate ? Math.round((now - pubDate) / (1000 * 60 * 60 * 24 * 30)) : null

    transcriptAnalyses.push({
      title,
      wordCount: words,
      videoType: video.videoType,
      topic: analysis.topic || '',
      contentType: analysis.contentType || '',
      textExcerptStart: text.slice(0, 500),
      textExcerptEnd: text.slice(-500),
      fullText: text,
      publishedAt: pubDate ? pubDate.toISOString().slice(0, 10) : 'unknown',
      ageLabel: ageMonths != null
        ? (ageMonths <= 1 ? 'RECENT (last month)' : ageMonths <= 3 ? 'RECENT (last 3 months)' : ageMonths <= 6 ? 'MID (3-6 months ago)' : `OLDER (${ageMonths} months ago)`)
        : 'unknown date',
    })
  }

  // Stage: load_directions
  emit('load_directions', 'running')
  const narrativeDirections = await db.narrativeDirection.findMany({ orderBy: { sortOrder: 'asc' } })
  const directionSlugs = narrativeDirections.map(d => d.slug)
  const directionList = narrativeDirections.map(d => `- "${d.slug}": ${d.detectHint}`).join('\n')
  emit('load_directions', 'done', `${narrativeDirections.length} directions loaded`)

  // Phase 2: Build holistic Style DNA via Claude Sonnet (batch analysis)
  // Transcripts are ordered newest-first, each tagged with date and recency label.
  const transcriptSummaries = transcriptAnalyses.map((t, i) => {
    return `--- TRANSCRIPT ${i + 1}: "${t.title}" (${t.wordCount} words, type: ${t.videoType}, published: ${t.publishedAt}, recency: ${t.ageLabel}) ---
OPENING (first 500 chars):
${t.textExcerptStart}

CLOSING (last 500 chars):
${t.textExcerptEnd}

FULL TEXT:
${t.fullText}`
  }).join('\n\n')

  const system = `You are an expert linguistic analyst specializing in Arabic media content. You analyze YouTube video transcripts to extract a comprehensive "Style DNA" — a deep profile of how a specific presenter writes and speaks.

CRITICAL — RECENCY WEIGHTING:
Each transcript is tagged with its publish date and a recency label (RECENT, MID, OLDER).
- RECENT transcripts (last 3 months) represent the channel's CURRENT refined style. Weight them 3x more than older ones.
- MID transcripts (3-6 months) are supplementary context. Weight them normally.
- OLDER transcripts (6+ months) show the channel's earlier style. Use them to track evolution but do NOT let old patterns override current ones.
- When a pattern appears in recent videos but not older ones, it's a NEW adoption — highlight it.
- When a pattern appears in older videos but disappeared recently, it's an ABANDONED habit — note it in evolution.

Your analysis must be precise, evidence-based, and cite specific examples from the transcripts. Every claim must be backed by a direct quote. Prioritize quotes from RECENT transcripts.

Output ONLY valid JSON (no markdown fences, no explanation text).`

  const userMessage = `Analyze these ${withText.length} transcripts from the YouTube channel "${channel.nameAr}" (@${channel.handle}).

${transcriptSummaries}

---

Build a comprehensive Style DNA profile. Return this EXACT JSON structure:

{
  "narrativeStructures": [
    {
      "name": "pattern name (e.g. 'reverse chronology', 'mystery reveal', 'chronological')",
      "description": "how this pattern works in their videos",
      "frequency": "how often this appears (e.g. '60% of videos')",
      "example": "brief example from a specific transcript"
    }
  ],
  "openingPatterns": [
    {
      "type": "pattern type (e.g. 'rhetorical question', 'shocking fact', 'scene setting')",
      "frequency": "how often",
      "examples": ["exact quotes from openings, 1-2 sentences each"]
    }
  ],
  "closingPatterns": [
    {
      "type": "pattern type (e.g. 'call to action', 'moral lesson', 'cliffhanger')",
      "frequency": "how often",
      "examples": ["exact quotes from closings"]
    }
  ],
  "transitionPhrases": ["exact phrases the presenter uses to move between story beats"],
  "sentenceStyle": {
    "avgLength": "short/medium/long with approximate word count",
    "structure": "description of typical sentence patterns",
    "rhythm": "description of pacing (e.g. 'short punchy sentences for tension, longer for exposition')"
  },
  "vocabulary": {
    "signatureWords": ["words/phrases uniquely associated with this presenter"],
    "avoidedPatterns": ["formal/informal patterns they consistently avoid"],
    "collocations": ["recurring word combinations or phrases"]
  },
  "tone": {
    "primary": "main tone (e.g. 'dramatic narrator', 'casual storyteller', 'investigative reporter')",
    "emotionalArc": "how tone shifts within a typical video",
    "humorStyle": "if/how humor is used, or 'none'"
  },
  "storyBeats": {
    "typicalStructure": ["ordered list of beat types (e.g. 'hook', 'context', 'inciting incident', 'escalation', 'climax', 'resolution', 'cta')"],
    "hookTechnique": "how the presenter grabs attention in the first 10 seconds",
    "tensionBuilding": "how suspense/interest is maintained"
  },
  "dialectMarkers": {
    "dialectName": "detected dialect name",
    "specificExpressions": ["dialect-specific expressions with meaning"],
    "formalityLevel": "how formal/informal the speech register is"
  },
  "productionNotes": {
    "avgScriptLength": "typical word count range",
    "pacingNotes": "observations about pacing for editors",
    "targetDuration": "typical video length"
  },
  "styleEvolution": {
    "summary": "one paragraph describing how the channel's style has changed over time",
    "recentAdoptions": ["patterns or techniques that appeared only in RECENT videos — these are the latest refinements"],
    "abandonedHabits": ["patterns that were common in OLDER videos but have since disappeared"],
    "consistentCore": ["patterns that have remained unchanged across all time periods — this is the channel's true identity"]
  },
  "narrativeDirectionAnalysis": {
    "perVideo": [
      {
        "title": "video title",
        "direction": "one of the direction slugs below",
        "confidence": "high/medium/low"
      }
    ],
    "breakdown": {"slug": count},
    "dominant": "the most common direction slug",
    "notes": "brief observation about how the channel uses narrative direction"
  },
  "confidence": {
    "overall": "high/medium/low based on transcript quality and quantity",
    "weakAreas": ["areas where more data would improve the profile"]
  }
}

NARRATIVE DIRECTION CLASSIFICATION — for the "narrativeDirectionAnalysis" section, classify each transcript into exactly one of these directions:
${directionList}

Allowed slug values: ${directionSlugs.join(', ')}`

  // Stage: analyze
  emit('analyze', 'running', `Sending ${withText.length} transcripts to Claude...`)
  const raw = await callAnthropicLogged(apiKey, 'claude-sonnet-4-6', [
    { role: 'user', content: userMessage },
  ], {
    system,
    maxTokens: 8192,
    channelId,
    action: 'Style DNA — Full Analysis',
  })
  emit('analyze', 'done')

  // Stage: parse
  emit('parse', 'running')
  let styleDna
  try {
    const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
    styleDna = JSON.parse(cleaned)
  } catch (e) {
    logger.error({ channelId, rawSlice: raw?.slice(0, 500) }, `${tag} failed to parse Style DNA response`)
    emit('parse', 'error', 'Failed to parse AI response')
    throw new Error('Failed to parse Style DNA analysis from AI response')
  }
  emit('parse', 'done')

  // Stage: save
  emit('save', 'running')
  styleDna._meta = {
    transcriptsAnalyzed: withText.length,
    channelName: channel.nameAr,
    channelHandle: channel.handle,
    builtAt: new Date().toISOString(),
    model: 'claude-sonnet-4-6',
  }

  await db.channel.update({
    where: { id: channelId },
    data: {
      styleDna,
      styleDnaBuiltAt: new Date(),
    },
  })
  emit('save', 'done')

  logger.info({ channelId, transcriptsUsed: withText.length }, `${tag} Style DNA built successfully`)
  return styleDna
}

/**
 * Get the existing Style DNA for a channel (read-only).
 * @param {string} channelId
 * @returns {Promise<{ styleDna: object|null, styleDnaBuiltAt: Date|null, transcriptCount: number }>}
 */
async function getStyleDna(channelId) {
  const channel = await db.channel.findUnique({
    where: { id: channelId },
    select: { styleDna: true, styleDnaBuiltAt: true },
  })
  if (!channel) throw new Error('Channel not found')

  const transcriptCount = await db.video.count({
    where: {
      channelId,
      transcription: { not: null },
    },
  })

  return {
    styleDna: channel.styleDna || null,
    styleDnaBuiltAt: channel.styleDnaBuiltAt || null,
    transcriptCount,
    minRequired: MIN_TRANSCRIPTS,
  }
}

/**
 * Find the most similar past transcripts to a story's topic using pgvector.
 * Used for few-shot examples during script generation.
 * @param {number[]} storyEmbedding - 1536-dim vector
 * @param {string} channelId
 * @param {number} [limit=3]
 * @returns {Promise<Array<{ id: string, titleAr: string, transcription: string, similarity: number }>>}
 */
async function findSimilarTranscripts(storyEmbedding, channelId, limit = 3) {
  const vecStr = `[${storyEmbedding.join(',')}]`
  return db.$queryRaw`
    SELECT
      v.id,
      v."titleAr",
      v."transcription",
      1 - (v.embedding <=> ${vecStr}::vector) AS similarity
    FROM "Video" v
    WHERE v."channelId" = ${channelId}
      AND v.embedding IS NOT NULL
      AND v.transcription IS NOT NULL
    ORDER BY v.embedding <=> ${vecStr}::vector
    LIMIT ${limit}
  `
}

/**
 * Validate Style DNA quality using holdout transcripts.
 * Picks 3 random transcripts the DNA was built from, and asks Claude
 * to score how accurately the DNA describes each one.
 * @param {string} channelId
 * @returns {Promise<object>} Validation report with per-transcript scores
 */
async function validateStyleDna(channelId) {
  const channel = await db.channel.findUnique({
    where: { id: channelId },
    select: { id: true, nameAr: true, styleDna: true },
  })
  if (!channel) throw new Error('Channel not found')
  if (!channel.styleDna) throw new Error('No Style DNA built yet — build it first')

  const videos = await db.video.findMany({
    where: { channelId, transcription: { not: null } },
    select: { id: true, titleAr: true, titleEn: true, transcription: true },
    orderBy: { publishedAt: 'desc' },
    take: MAX_TRANSCRIPTS_TO_ANALYZE,
  })

  const withText = videos.filter(v => segmentsToText(v.transcription).length > 100)
  if (withText.length < 6) {
    throw new Error('Need at least 6 transcripts to run validation (3 holdout + 3 minimum for DNA)')
  }

  // Pick 3 random transcripts for holdout
  const shuffled = [...withText].sort(() => Math.random() - 0.5)
  const holdout = shuffled.slice(0, 3)

  const apiKey = await registry.requireKey('anthropic')

  const dnaJson = JSON.stringify(channel.styleDna, null, 2)

  const system = `You are a linguistic validation expert. You will receive a "Style DNA" profile that claims to describe a YouTube channel's writing style, plus 3 actual transcripts from that channel.

Your job is to rigorously evaluate how accurately the Style DNA captures the real style. Be critical — don't be generous.

Output ONLY valid JSON (no markdown fences):
{
  "overallScore": <number 1-10>,
  "overallVerdict": "<one sentence>",
  "transcripts": [
    {
      "title": "<video title>",
      "score": <number 1-10>,
      "matchedClaims": ["<specific DNA claims that matched this transcript>"],
      "missedPatterns": ["<patterns in the transcript that the DNA failed to capture>"],
      "wrongClaims": ["<DNA claims that contradict this transcript>"]
    }
  ],
  "strengths": ["<what the DNA got right overall>"],
  "weaknesses": ["<what the DNA missed or got wrong>"],
  "suggestions": ["<how to improve the DNA>"]
}`

  const holdoutTexts = holdout.map((v, i) => {
    const text = segmentsToText(v.transcription).slice(0, 8000)
    const title = v.titleAr || v.titleEn || `Video ${i + 1}`
    return `--- TRANSCRIPT ${i + 1}: "${title}" ---\n${text}`
  }).join('\n\n')

  const userMessage = `STYLE DNA PROFILE:\n${dnaJson.slice(0, 30000)}\n\n---\n\nHOLDOUT TRANSCRIPTS (evaluate how well the DNA describes these):\n\n${holdoutTexts}`

  const raw = await callAnthropicLogged(apiKey, 'claude-sonnet-4-6', [
    { role: 'user', content: userMessage },
  ], {
    system,
    maxTokens: 4096,
    channelId,
    action: 'Style DNA — Validation',
  })

  try {
    const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
    return JSON.parse(cleaned)
  } catch {
    logger.error({ channelId, rawSlice: raw?.slice(0, 300) }, 'Failed to parse validation response')
    throw new Error('Failed to parse validation result')
  }
}

module.exports = {
  buildStyleDna,
  getStyleDna,
  findSimilarTranscripts,
  validateStyleDna,
  segmentsToText,
  MIN_TRANSCRIPTS,
  PIPELINE_STAGES,
}
