/**
 * Embedding service: generates vectors via OpenAI and queries pgvector for similarity.
 * Uses text-embedding-3-small (1536 dimensions) with HNSW indexes for fast ANN search.
 */
const fetch = require('node-fetch')
const db = require('../lib/db')
const { decrypt } = require('./crypto')
const { trackUsage } = require('./usageTracker')
const logger = require('../lib/logger')
const registry = require('../lib/serviceRegistry')

const OPENAI_EMBEDDING_URL = 'https://api.openai.com/v1/embeddings'
const DEFAULT_MODEL = 'text-embedding-3-small'
const DIMENSIONS = 1536

/**
 * Generate an embedding vector for the given text.
 * @param {string} text
 * @param {string} channelId
 * @returns {number[]} Float array of length 1536
 */
async function generateEmbedding(text, channelId) {
  const apiKey = await registry.requireKey('embedding')
  const input = text.slice(0, 8000)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30_000)
  let res
  try {
    res = await fetch(OPENAI_EMBEDDING_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: DEFAULT_MODEL, input, dimensions: DIMENSIONS }),
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeout)
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    const msg = err?.error?.message || `OpenAI API ${res.status}`
    trackUsage({ channelId, service: 'openai-embedding', action: 'embed', status: 'fail', error: msg })
    const typed = registry.classifyHttpError('embedding', res.status, msg, res.headers)
    if (!typed.retryable) registry.markDown('embedding', typed.code, typed.message)
    throw typed
  }

  const data = await res.json()
  const embedding = data?.data?.[0]?.embedding
  if (!embedding || embedding.length !== DIMENSIONS) {
    throw new Error('Invalid embedding response from OpenAI')
  }

  trackUsage({
    channelId,
    service: 'openai-embedding',
    action: 'embed',
    tokensUsed: data.usage?.total_tokens,
    status: 'ok',
  })
  registry.markUp('embedding')

  return embedding
}

/**
 * Build the text string to embed from an analysis/brief object.
 */
function buildEmbeddingText(data) {
  const parts = []
  if (data.topic) parts.push(data.topic)
  if (Array.isArray(data.tags)) parts.push(data.tags.join(', '))
  if (data.summary) parts.push(data.summary)
  if (data.uniqueAngle) parts.push(data.uniqueAngle)
  if (data.contentType) parts.push(data.contentType)
  if (data.region) parts.push(data.region)
  return parts.filter(Boolean).join('. ')
}

/**
 * Store an embedding vector for a Video record using raw SQL (Prisma can't handle vector type).
 */
async function storeVideoEmbedding(videoId, embedding) {
  if (!embedding || !Array.isArray(embedding)) {
    logger.warn({ videoId }, 'storeVideoEmbedding called with invalid embedding')
    return
  }
  const vecStr = `[${embedding.join(',')}]`
  await db.$executeRaw`UPDATE "Video" SET embedding = ${vecStr}::vector WHERE id = ${videoId}`
}

async function storeStoryEmbedding(storyId, embedding) {
  if (!embedding || !Array.isArray(embedding)) {
    logger.warn({ storyId }, 'storeStoryEmbedding called with invalid embedding')
    return
  }
  const vecStr = `[${embedding.join(',')}]`
  await db.$executeRaw`UPDATE "Story" SET embedding = ${vecStr}::vector WHERE id = ${storyId}`
}

/**
 * Find the most similar competition videos to a given embedding vector.
 * Uses pgvector HNSW index for fast approximate nearest-neighbor search.
 * Returns videos with cosine similarity score, view counts, and channel info.
 */
async function findSimilarVideos(embedding, channelId, limit = 10) {
  const vecStr = `[${embedding.join(',')}]`
  return db.$queryRaw`
    SELECT
      v.id, v."titleAr", v."viewCount", v."likeCount", v."commentCount",
      v."publishedAt", v."analysisResult", v."videoType",
      c."nameAr" as "channelName", c.id as "channelId", c.subscribers as "channelSubscribers",
      1 - (v.embedding <=> ${vecStr}::vector) as similarity
    FROM "Video" v
    JOIN "Channel" c ON v."channelId" = c.id
    WHERE c."parentChannelId" = ${channelId}
      AND c."type" = 'competitor'
      AND v.embedding IS NOT NULL
      AND v."analysisResult" IS NOT NULL
    ORDER BY v.embedding <=> ${vecStr}::vector
    LIMIT ${limit}
  `
}

/**
 * Find the most similar "done" stories from our own channel.
 * Used to compute ownChannelAffinity (how similar topics performed for us).
 */
async function findSimilarOwnStories(embedding, channelId, excludeStoryId, limit = 5) {
  const vecStr = `[${embedding.join(',')}]`
  return db.$queryRaw`
    SELECT
      s.id, s.headline, s.brief, s."compositeScore", s.stage,
      1 - (s.embedding <=> ${vecStr}::vector) as similarity
    FROM "Story" s
    WHERE s."channelId" = ${channelId}
      AND s.stage = 'done'
      AND s.embedding IS NOT NULL
      AND (${excludeStoryId}::text IS NULL OR s.id != ${excludeStoryId})
    ORDER BY s.embedding <=> ${vecStr}::vector
    LIMIT ${limit}
  `
}

/**
 * Find similar competitor videos with channelId and viewCount for performance analysis.
 * Used by topicDemand scoring to compute per-video performance ratios.
 */
async function findSimilarVideosWithStats(embedding, channelId, limit = 5) {
  const vecStr = `[${embedding.join(',')}]`
  return db.$queryRaw`
    SELECT
      v.id,
      v."titleAr",
      v."viewCount",
      v."likeCount",
      v."commentCount",
      v."publishedAt",
      v."videoType",
      v."channelId",
      c."nameAr" as "channelName",
      1 - (v.embedding <=> ${vecStr}::vector) as similarity
    FROM "Video" v
    JOIN "Channel" c ON v."channelId" = c.id
    WHERE c."parentChannelId" = ${channelId}
      AND c."type" = 'competitor'
      AND v.embedding IS NOT NULL
    ORDER BY v.embedding <=> ${vecStr}::vector
    LIMIT ${limit}
  `
}

/**
 * Generate and store a niche embedding from the channel's Content DNA tags.
 * Combines English + Arabic tags into a single text and embeds it.
 */
async function generateNicheEmbedding(channelId) {
  const profile = await db.scoreProfile.upsert({
    where: { channelId },
    create: { channelId },
    update: {},
    select: { nicheTags: true, nicheTagsAr: true },
  })

  const { nicheTags, nicheTagsAr } = profile
  if ((!nicheTags || nicheTags.length === 0) && (!nicheTagsAr || nicheTagsAr.length === 0)) {
    throw new Error('No niche tags defined. Add Content DNA tags first.')
  }

  const text = [...(nicheTags || []), ...(nicheTagsAr || [])].join(', ')
  const embedding = await generateEmbedding(text, channelId)
  const vecStr = `[${embedding.join(',')}]`

  await db.$executeRaw`
    UPDATE "ScoreProfile"
    SET "nicheEmbedding" = ${vecStr}::vector,
        "nicheEmbeddingGeneratedAt" = NOW()
    WHERE "channelId" = ${channelId}
  `

  return {
    success: true,
    tagCount: (nicheTags || []).length + (nicheTagsAr || []).length,
    generatedAt: new Date(),
  }
}

/**
 * Fetch the niche embedding vector for a channel.
 * Returns the float array or null if not generated yet.
 */
async function getNicheEmbedding(channelId) {
  const rows = await db.$queryRaw`
    SELECT "nicheEmbedding"::text
    FROM "ScoreProfile"
    WHERE "channelId" = ${channelId}
  `
  const raw = rows?.[0]?.nicheEmbedding
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

const SERVICE_DESCRIPTOR = {
  name: 'embedding',
  displayName: 'OpenAI Embeddings',
  keySource: 'apiKey',
}

module.exports = {
  generateEmbedding,
  buildEmbeddingText,
  storeVideoEmbedding,
  storeStoryEmbedding,
  findSimilarVideos,
  findSimilarVideosWithStats,
  findSimilarOwnStories,
  generateNicheEmbedding,
  getNicheEmbedding,
  DIMENSIONS,
  SERVICE_DESCRIPTOR,
}
