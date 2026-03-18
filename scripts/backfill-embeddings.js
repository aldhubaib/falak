#!/usr/bin/env node
/**
 * Backfill embeddings for existing videos and stories.
 * Run once after deploying the vector intelligence migration.
 *
 * Usage: node scripts/backfill-embeddings.js
 *
 * Requires: OPENAI embedding key configured on the project (embeddingApiKeyEncrypted).
 */
try { require('dotenv').config() } catch (_) {}
const db = require('../src/lib/db')
const { generateEmbedding, buildEmbeddingText, storeVideoEmbedding, storeStoryEmbedding } = require('../src/services/embeddings')

const BATCH_SIZE = 10
const DELAY_MS = 500

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function backfillVideos(project) {
  const videos = await db.video.findMany({
    where: {
      channel: { projectId: project.id },
      analysisResult: { not: null },
    },
    select: { id: true, analysisResult: true },
  })

  // Filter to those without embedding
  const withoutEmbedding = []
  for (const v of videos) {
    const check = await db.$queryRaw`SELECT embedding IS NULL as missing FROM "Video" WHERE id = ${v.id}`
    if (check?.[0]?.missing) withoutEmbedding.push(v)
  }

  console.log(`[backfill] ${withoutEmbedding.length} videos need embeddings (of ${videos.length} total)`)
  let done = 0
  let failed = 0

  for (let i = 0; i < withoutEmbedding.length; i += BATCH_SIZE) {
    const batch = withoutEmbedding.slice(i, i + BATCH_SIZE)
    for (const v of batch) {
      try {
        const ar = v.analysisResult || {}
        const text = buildEmbeddingText({
          topic: ar.partA?.topic,
          tags: ar.partA?.tags,
          summary: ar.partB?.summary,
          contentType: ar.partA?.contentType,
          region: ar.partA?.location,
        })
        if (text.length > 10) {
          const emb = await generateEmbedding(text, project)
          await storeVideoEmbedding(v.id, emb)
          done++
        }
      } catch (e) {
        console.warn(`  [video ${v.id}] failed: ${e.message}`)
        failed++
      }
      await sleep(DELAY_MS)
    }
    console.log(`  [videos] ${done} done, ${failed} failed of ${withoutEmbedding.length}`)
  }

  return { done, failed }
}

async function backfillStories(project) {
  const stories = await db.story.findMany({
    where: { projectId: project.id },
    select: { id: true, brief: true },
  })

  const withoutEmbedding = []
  for (const s of stories) {
    const check = await db.$queryRaw`SELECT embedding IS NULL as missing FROM "Story" WHERE id = ${s.id}`
    if (check?.[0]?.missing) withoutEmbedding.push(s)
  }

  console.log(`[backfill] ${withoutEmbedding.length} stories need embeddings (of ${stories.length} total)`)
  let done = 0
  let failed = 0

  for (let i = 0; i < withoutEmbedding.length; i += BATCH_SIZE) {
    const batch = withoutEmbedding.slice(i, i + BATCH_SIZE)
    for (const s of batch) {
      try {
        const brief = (s.brief && typeof s.brief === 'object') ? s.brief : {}
        const text = buildEmbeddingText({
          topic: brief.summary,
          tags: brief.tags,
          summary: brief.summary,
          contentType: brief.contentType,
          region: brief.region,
          uniqueAngle: brief.uniqueAngle,
        })
        if (text.length > 10) {
          const emb = await generateEmbedding(text, project)
          await storeStoryEmbedding(s.id, emb)
          done++
        }
      } catch (e) {
        console.warn(`  [story ${s.id}] failed: ${e.message}`)
        failed++
      }
      await sleep(DELAY_MS)
    }
    console.log(`  [stories] ${done} done, ${failed} failed of ${withoutEmbedding.length}`)
  }

  return { done, failed }
}

async function main() {
  const projects = await db.project.findMany({
    where: { status: 'active', embeddingApiKeyEncrypted: { not: null } },
    select: { id: true, name: true, embeddingApiKeyEncrypted: true },
  })

  if (projects.length === 0) {
    console.log('No projects with embedding API key configured. Add one in Settings first.')
    process.exit(0)
  }

  for (const project of projects) {
    console.log(`\n=== Project: ${project.name} (${project.id}) ===`)
    const videoResult = await backfillVideos(project)
    const storyResult = await backfillStories(project)
    console.log(`\nDone: ${videoResult.done} videos, ${storyResult.done} stories embedded`)
    if (videoResult.failed || storyResult.failed) {
      console.log(`Failed: ${videoResult.failed} videos, ${storyResult.failed} stories`)
    }
  }

  await db.$disconnect()
  process.exit(0)
}

main().catch(e => {
  console.error('Backfill failed:', e)
  process.exit(1)
})
