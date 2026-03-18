/**
 * Embedding service: generates vectors via OpenAI and computes similarity in JS.
 * Uses text-embedding-3-small (1536 dimensions).
 * Embeddings stored as JSONB arrays in PostgreSQL.
 */
const fetch = require('node-fetch')
const db = require('../lib/db')
const { decrypt } = require('./crypto')
const { trackUsage } = require('./usageTracker')
const logger = require('../lib/logger')

const OPENAI_EMBEDDING_URL = 'https://api.openai.com/v1/embeddings'
const DEFAULT_MODEL = 'text-embedding-3-small'
const DIMENSIONS = 1536

/**
 * Generate an embedding vector for the given text.
 * @param {string} text
 * @param {object} project - needs embeddingApiKeyEncrypted
 * @returns {number[]} Float array of length 1536
 */
async function generateEmbedding(text, project) {
  if (!project.embeddingApiKeyEncrypted) {
    throw new Error('OpenAI embedding API key not configured for this project.')
  }
  const apiKey = decrypt(project.embeddingApiKeyEncrypted)
  const input = text.slice(0, 8000)

  const res = await fetch(OPENAI_EMBEDDING_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: DEFAULT_MODEL, input, dimensions: DIMENSIONS }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    const msg = err?.error?.message || `OpenAI API ${res.status}`
    trackUsage({ projectId: project.id, service: 'openai-embedding', action: 'embed', status: 'fail', error: msg })
    throw new Error(`Embedding failed: ${msg}`)
  }

  const data = await res.json()
  const embedding = data?.data?.[0]?.embedding
  if (!embedding || embedding.length !== DIMENSIONS) {
    throw new Error('Invalid embedding response from OpenAI')
  }

  trackUsage({
    projectId: project.id,
    service: 'openai-embedding',
    action: 'embed',
    tokensUsed: data.usage?.total_tokens,
    status: 'ok',
  })

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
 * Cosine similarity between two vectors.
 */
function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0
  let dot = 0, magA = 0, magB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    magA += a[i] * a[i]
    magB += b[i] * b[i]
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB)
  return denom === 0 ? 0 : dot / denom
}

/**
 * Store an embedding vector for a Video record (as JSONB).
 */
async function storeVideoEmbedding(videoId, embedding) {
  await db.video.update({ where: { id: videoId }, data: { embedding } })
}

/**
 * Store an embedding vector for a Story record (as JSONB).
 */
async function storeStoryEmbedding(storyId, embedding) {
  await db.story.update({ where: { id: storyId }, data: { embedding } })
}

/**
 * Find the most similar competition videos to a given embedding.
 * Fetches all embedded competition videos, computes similarity in JS, returns top N.
 */
async function findSimilarVideos(embedding, projectId, limit = 10) {
  const videos = await db.video.findMany({
    where: {
      channel: { projectId, type: 'competitor' },
      embedding: { not: null },
      analysisResult: { not: null },
    },
    select: {
      id: true, titleAr: true, viewCount: true, likeCount: true, commentCount: true,
      publishedAt: true, analysisResult: true, videoType: true, embedding: true,
      channel: { select: { id: true, nameAr: true, subscribers: true } },
    },
  })

  const scored = videos
    .map(v => ({
      ...v,
      channelId: v.channel.id,
      channelName: v.channel.nameAr,
      channelSubscribers: v.channel.subscribers,
      similarity: cosineSimilarity(embedding, v.embedding),
      embedding: undefined,
    }))
    .filter(v => v.similarity > 0.5)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit)

  return scored
}

/**
 * Find the most similar "done" stories from our own channel.
 */
async function findSimilarOwnStories(embedding, projectId, excludeStoryId, limit = 5) {
  const stories = await db.story.findMany({
    where: {
      projectId,
      stage: 'done',
      embedding: { not: null },
      id: excludeStoryId ? { not: excludeStoryId } : undefined,
    },
    select: {
      id: true, headline: true, brief: true, compositeScore: true, stage: true, embedding: true,
    },
  })

  const scored = stories
    .map(s => ({
      ...s,
      similarity: cosineSimilarity(embedding, s.embedding),
      embedding: undefined,
    }))
    .filter(s => s.similarity > 0.5)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit)

  return scored
}

module.exports = {
  generateEmbedding,
  buildEmbeddingText,
  cosineSimilarity,
  storeVideoEmbedding,
  storeStoryEmbedding,
  findSimilarVideos,
  findSimilarOwnStories,
  DIMENSIONS,
}
