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
 * @returns {Promise<object>} The built Style DNA profile
 */
async function buildStyleDna(channelId) {
  const tag = `[styleDna:${channelId.slice(-6)}]`

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
    throw new Error(
      `Need at least ${MIN_TRANSCRIPTS} transcripts to build Style DNA. ` +
      `Found ${withText.length} for channel "${channel.nameAr}".`
    )
  }

  logger.info({ channelId, transcriptCount: withText.length }, `${tag} analyzing transcripts`)

  const apiKey = await registry.requireKey('anthropic')

  // Phase 1: Analyze each transcript individually for structural patterns
  const transcriptAnalyses = []
  for (const video of withText) {
    const text = segmentsToText(video.transcription).slice(0, TRANSCRIPT_SLICE)
    const title = video.titleAr || video.titleEn || 'untitled'
    const words = wordCount(text)
    const analysis = video.analysisResult || {}

    transcriptAnalyses.push({
      title,
      wordCount: words,
      videoType: video.videoType,
      topic: analysis.topic || '',
      contentType: analysis.contentType || '',
      textExcerptStart: text.slice(0, 500),
      textExcerptEnd: text.slice(-500),
      fullText: text,
    })
  }

  // Phase 2: Build holistic Style DNA via Claude Sonnet (batch analysis)
  // We send all transcripts in a structured format for cross-transcript pattern recognition.
  const transcriptSummaries = transcriptAnalyses.map((t, i) => {
    return `--- TRANSCRIPT ${i + 1}: "${t.title}" (${t.wordCount} words, type: ${t.videoType}) ---
OPENING (first 500 chars):
${t.textExcerptStart}

CLOSING (last 500 chars):
${t.textExcerptEnd}

FULL TEXT:
${t.fullText}`
  }).join('\n\n')

  const system = `You are an expert linguistic analyst specializing in Arabic media content. You analyze YouTube video transcripts to extract a comprehensive "Style DNA" — a deep profile of how a specific presenter writes and speaks.

Your analysis must be precise, evidence-based, and cite specific examples from the transcripts. Every claim must be backed by a direct quote.

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
  "confidence": {
    "overall": "high/medium/low based on transcript quality and quantity",
    "weakAreas": ["areas where more data would improve the profile"]
  }
}`

  const raw = await callAnthropicLogged(apiKey, 'claude-sonnet-4-6', [
    { role: 'user', content: userMessage },
  ], {
    system,
    maxTokens: 8192,
    channelId,
    action: 'Style DNA — Full Analysis',
  })

  let styleDna
  try {
    const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
    styleDna = JSON.parse(cleaned)
  } catch (e) {
    logger.error({ channelId, rawSlice: raw?.slice(0, 500) }, `${tag} failed to parse Style DNA response`)
    throw new Error('Failed to parse Style DNA analysis from AI response')
  }

  // Attach metadata
  styleDna._meta = {
    transcriptsAnalyzed: withText.length,
    channelName: channel.nameAr,
    channelHandle: channel.handle,
    builtAt: new Date().toISOString(),
    model: 'claude-sonnet-4-6',
  }

  // Persist to channel
  await db.channel.update({
    where: { id: channelId },
    data: {
      styleDna,
      styleDnaBuiltAt: new Date(),
    },
  })

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

module.exports = {
  buildStyleDna,
  getStyleDna,
  findSimilarTranscripts,
  segmentsToText,
  MIN_TRANSCRIPTS,
}
