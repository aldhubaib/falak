/**
 * Script pipeline Bull queue.
 *
 * When REDIS_URL is set, script generation runs as a Bull job.
 * When not set, runScriptPipelineInline() is used as fallback.
 *
 * Job data: { storyId, channelId, isShort, forceResearch }
 * Pipeline progress is stored on story.brief.pipelineStatus.
 */
const Queue = require('bull')
const config = require('../config')
const db = require('../lib/db')
const logger = require('../lib/logger')
const { runScriptPipeline, PIPELINE_STAGES } = require('../services/scriptPipeline')
const { getDialectForCountry, getDialectGuide } = require('../lib/dialects')

const QUEUE_NAME = 'falak-script-pipeline'

let queue = null
if (config.REDIS_URL) {
  queue = new Queue(QUEUE_NAME, config.REDIS_URL, {
    defaultJobOptions: {
      removeOnComplete: 50,
      removeOnFail: 200,
      attempts: 1,
      timeout: 600_000,
    },
  })
  queue.on('error', (err) => {
    logger.error({ err: err.message }, '[script-queue] queue error')
  })
  queue.on('failed', (job, err) => {
    logger.warn({ jobId: job?.id, storyId: job?.data?.storyId, err: err.message }, '[script-queue] job failed')
  })
}

function getScriptQueue() { return queue }

/**
 * Enqueue a script generation job.
 * Returns the Bull job (or null if Redis unavailable — caller should use inline fallback).
 */
async function enqueueScriptJob(storyId, opts = {}) {
  if (!queue) return null
  const jobId = `script-${storyId}-${Date.now()}`
  return queue.add({
    storyId,
    channelId: opts.channelId,
    isShort: opts.isShort ?? true,
    forceResearch: opts.forceResearch ?? false,
  }, { jobId })
}

/**
 * Build the shared context needed by the pipeline from channel data.
 * Used by both the queue worker and the inline fallback.
 */
async function buildPipelineContext(story, channel) {
  const { buildStyleDnaBlock, fetchFewShotExamples, buildFewShotBlock } = require('../routes/stories')

  const dialect = await getDialectForCountry(channel.nationality)
  const dialectGuide = getDialectGuide(channel.nationality)
  const dialectInstruction = dialectGuide
    ? dialectGuide
    : dialect
      ? `Write the script in ${dialect.long} (${dialect.short}). Use natural spoken ${dialect.short} — not formal Modern Standard Arabic.`
      : 'Write the script in Arabic.'
  const dialectName = dialect?.name || 'Arabic'

  const startHook = (channel.startHook || '').trim()
  const endHook = (channel.endHook || '').trim()
  const hookStartBlock = startHook || ''
  const hookEndBlock = endHook || ''

  const brief = story.brief || {}
  const isShort = (brief.scriptLength || 'short') === 'short'

  const durationInstruction = isShort
    ? 'Write a CONCISE but COMPLETE script. Aim for 2-4 minutes of speaking time. You MUST include EVERY fact from the source — do NOT skip or omit any detail, no matter how small. To keep it concise, say each fact in fewer words rather than removing facts entirely. Character backgrounds (job, location, family situation, where they work/live) are essential context — never skip them. Include timestamps every 15–30 seconds (e.g. 0:00, 0:15, 0:30, 1:00).'
    : 'Write a COMPREHENSIVE, detailed script covering the full story with all context, background, and nuance from the source. Aim for 5-10+ minutes of speaking time. Do not skip anything important. Include timestamps at logical section breaks (e.g. 0:00, 1:00, 5:00, 10:00).'

  const guide = (channel.styleGuide && typeof channel.styleGuide === 'object') ? channel.styleGuide : null
  let styleBlock = ''
  if (guide) {
    const parts = []
    if (Array.isArray(guide.corrections) && guide.corrections.length > 0) {
      const hookCorrections = guide.corrections.filter(c => c.category === 'branded_hook')
      const otherCorrections = guide.corrections.filter(c => c.category !== 'branded_hook')
      if (hookCorrections.length > 0) {
        parts.push('CRITICAL — Branded hook corrections (you got these WRONG before, use the CORRECT version):\n' +
          hookCorrections.map(c => `- WRONG: "${c.wrong}" → CORRECT: "${c.correct}"`).join('\n'))
      }
      if (otherCorrections.length > 0) {
        parts.push('Style corrections from past scripts:\n' +
          otherCorrections.slice(-10).map(c => `- Instead of "${c.wrong}", use "${c.correct}"`).join('\n'))
      }
    }
    if (guide.signatures?.startHook?.length > 0) {
      parts.push('Real opening hook examples from this channel\'s past videos:\n' +
        guide.signatures.startHook.slice(-3).map(h => `- "${h}"`).join('\n'))
    }
    if (guide.signatures?.endHook?.length > 0) {
      parts.push('Real closing hook examples from this channel\'s past videos:\n' +
        guide.signatures.endHook.slice(-3).map(h => `- "${h}"`).join('\n'))
    }
    if (Array.isArray(guide.notes) && guide.notes.length > 0) {
      parts.push('Presenter style preferences:\n' + guide.notes.slice(-5).map(n => `- ${n}`).join('\n'))
    }
    if (parts.length > 0) {
      styleBlock = '\n\n--- CHANNEL STYLE GUIDE (learned from past videos — follow these closely) ---\n' + parts.join('\n\n')
    }
  }

  let styleDnaBlock = ''
  if (typeof buildStyleDnaBlock === 'function') {
    let narrativePreference = null
    try {
      const profile = await db.scoreProfile.findUnique({ where: { channelId: channel.id }, select: { preferredNarrativeDirection: true } })
      narrativePreference = profile?.preferredNarrativeDirection || null
    } catch (_) {}
    styleDnaBlock = buildStyleDnaBlock(channel.styleDna, narrativePreference) || ''
  }

  let fewShotBlock = ''
  if (typeof fetchFewShotExamples === 'function' && typeof buildFewShotBlock === 'function') {
    try {
      const examples = await fetchFewShotExamples(channel.id, story.id)
      fewShotBlock = buildFewShotBlock(examples) || ''
    } catch (_) {}
  }

  return {
    isShort,
    dialectInstruction,
    dialectName,
    durationInstruction,
    hookStartBlock,
    hookEndBlock,
    fewShotBlock,
    styleBlock,
    styleDnaBlock,
  }
}

/**
 * Update pipeline status on the story record.
 */
async function updatePipelineStatus(storyId, stage, data = {}) {
  try {
    const story = await db.story.findUnique({ where: { id: storyId }, select: { brief: true } })
    if (!story) return
    const brief = story.brief || {}
    await db.story.update({
      where: { id: storyId },
      data: {
        brief: {
          ...brief,
          pipelineStatus: {
            stage,
            updatedAt: new Date().toISOString(),
            ...data,
          },
        },
      },
    })
  } catch (err) {
    logger.warn({ storyId, stage, err: err.message }, '[script-queue] failed to update pipeline status')
  }
}

/**
 * Process a script pipeline job.
 */
async function processScriptJob(job) {
  const { storyId, channelId, isShort, forceResearch } = job.data

  const story = await db.story.findUnique({ where: { id: storyId } })
  if (!story) throw new Error(`Story not found: ${storyId}`)

  const cid = channelId || story.brief?.channelId
  if (!cid) throw new Error('No channel ID for story')

  const channel = await db.channel.findFirst({
    where: { id: cid },
    select: { id: true, startHook: true, endHook: true, nationality: true, styleGuide: true, styleDna: true },
  })
  if (!channel) throw new Error(`Channel not found: ${cid}`)

  const ctx = await buildPipelineContext(story, channel)

  const onStage = (stage, data) => {
    updatePipelineStatus(storyId, stage, data)
  }

  onStage('research', { message: 'Pipeline started' })

  const result = await runScriptPipeline(story, channel, {
    ...ctx,
    isShort: isShort ?? ctx.isShort,
    forceResearch,
    onStage,
  })

  const { parseStructuredScript } = require('../routes/stories')
  const parsed = parseStructuredScript(result.script)

  const freshStory = await db.story.findUnique({ where: { id: storyId }, select: { brief: true } })
  const currentBrief = freshStory?.brief || story.brief || {}

  const newBrief = {
    ...currentBrief,
    suggestedTitle: parsed.suggestedTitle || currentBrief.suggestedTitle,
    script: parsed.script || currentBrief.script,
    youtubeTags: parsed.youtubeTags?.length > 0 ? parsed.youtubeTags : currentBrief.youtubeTags,
    scriptLength: isShort ? 'short' : 'long',
    scriptRaw: (result.script || '').trim() || currentBrief.scriptRaw,
    factSheet: result.factSheet,
    research: result.research || currentBrief.research,
    qaResult: result.qaResult,
    pipelineLog: result.pipelineLog,
    pipelineStatus: { stage: 'done', updatedAt: new Date().toISOString() },
  }

  await db.story.update({
    where: { id: storyId },
    data: { brief: newBrief, stage: 'scripting' },
  })

  return { storyId, passed: result.qaResult?.passed }
}

function startScriptWorker() {
  if (!queue) return null
  queue.process(2, processScriptJob)
  logger.info('[script-queue] worker started (concurrency: 2)')
  return queue
}

module.exports = {
  getScriptQueue,
  enqueueScriptJob,
  processScriptJob,
  startScriptWorker,
  buildPipelineContext,
  updatePipelineStatus,
  QUEUE_NAME,
}
