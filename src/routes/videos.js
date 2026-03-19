const express = require('express')
const rateLimit = require('express-rate-limit')
const { z } = require('zod')
const db = require('../lib/db')
const { bigintJson } = require('../lib/serialise')
const { requireAuth } = require('../middleware/auth')
const { NotFound } = require('../middleware/errors')
const { parseBody } = require('../lib/validate')
const { fetchComments } = require('../services/youtube')
const { fetchTranscript } = require('../services/transcript')

const router = express.Router()
router.use(requireAuth)
router.use(bigintJson)

const strictRateLimit = rateLimit({ windowMs: 60 * 1000, max: 15, message: { error: { code: 'rate_limit', message: 'Too many requests for this action' } } })

const STAGE_NAMES = {
  import: 'Import',
  transcribe: 'Transcription',
  comments: 'Comments',
  analyzing: 'AI Analysis',
  done: 'Done',
  failed: 'Failed',
}

// ── GET /api/videos/:id — single video for detail page (with channel, pipelineItem, analysisResult)
router.get('/:id', async (req, res) => {
  const video = await db.video.findUnique({
    where: { id: req.params.id },
    include: {
      channel: { select: { id: true, handle: true, nameAr: true, nameEn: true, avatarUrl: true } },
      pipelineItem: { select: { id: true, stage: true, status: true, error: true, retries: true, lastStage: true, startedAt: true, finishedAt: true, createdAt: true, result: true } },
      comments: { orderBy: { likeCount: 'desc' }, take: 200, select: { id: true, text: true, authorName: true, likeCount: true, publishedAt: true, sentiment: true } },
    },
  })
  if (!video) throw NotFound('Video not found')
  res.json(video)
})

// ── POST /api/videos/:id/refetch-comments — re-fetch top 100 comments from YouTube and upsert (strict rate limit)
router.post('/:id/refetch-comments', strictRateLimit, async (req, res) => {
  try {
    const video = await db.video.findUnique({
      where: { id: req.params.id },
      include: { channel: { select: { id: true, parentChannelId: true } } },
    })
    if (!video || !video.channel) return res.status(404).json({ error: 'Video not found' })
    const comments = await fetchComments(video.youtubeId, 100, video.channel.parentChannelId || video.channel.id)
    const BATCH = 25
    for (let i = 0; i < comments.length; i += BATCH) {
      const batch = comments.slice(i, i + BATCH)
      await db.$transaction(
        batch.map(c => db.comment.upsert({
          where: { youtubeId: c.youtubeId },
          create: {
            videoId: video.id,
            youtubeId: c.youtubeId,
            text: c.text,
            authorName: c.authorName,
            likeCount: c.likeCount,
            publishedAt: c.publishedAt,
          },
          update: {
            text: c.text,
            authorName: c.authorName,
            likeCount: c.likeCount,
            publishedAt: c.publishedAt,
          },
        }))
      )
    }
    res.json({ refetched: comments.length })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── POST /api/videos/:id/refetch-transcript — re-fetch transcript from youtube-transcript.io and save (strict rate limit)
router.post('/:id/refetch-transcript', strictRateLimit, async (req, res) => {
  try {
    const video = await db.video.findUnique({
      where: { id: req.params.id },
      include: { channel: true },
    })
    if (!video) return res.status(404).json({ error: 'Video not found' })
    const ytTranscriptKey = await db.apiKey.findUnique({ where: { service: 'yt_transcript' } })
    const text = await fetchTranscript(video.youtubeId, ytTranscriptKey)
    await db.video.update({
      where: { id: video.id },
      data: { transcription: text || null },
    })
    res.json({ ok: true, wordCount: text ? text.trim().split(/\s+/).length : 0 })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

const omitFromAnalyticsBodySchema = z.object({ omit: z.boolean().optional() })

// ── POST /api/videos/:id/omit-from-analytics — set omitFromAnalytics (body: { omit: true|false }, default toggle)
router.post('/:id/omit-from-analytics', async (req, res) => {
  const video = await db.video.findUnique({ where: { id: req.params.id }, select: { id: true, omitFromAnalytics: true } })
  if (!video) throw NotFound('Video not found')
  const parsed = parseBody(req.body, omitFromAnalyticsBodySchema)
  const omit = typeof parsed.omit === 'boolean' ? parsed.omit : !video.omitFromAnalytics
  await db.video.update({
    where: { id: video.id },
    data: { omitFromAnalytics: omit },
  })
  res.json({ omitFromAnalytics: omit })
})

// ── GET /api/videos/:id/logs — full pipeline stage logs for the video (all steps)
router.get('/:id/logs', async (req, res) => {
  try {
    const item = await db.pipelineItem.findUnique({
      where: { videoId: req.params.id },
    })
    const stageOrder = ['import', 'transcribe', 'comments', 'analyzing', 'done']
    const logs = []
    if (!item) {
      return res.json(logs)
    }
    const result = item.result && typeof item.result === 'object' ? item.result : {}
    const startedAt = item.startedAt ? new Date(item.startedAt) : null
    const finishedAt = item.finishedAt ? new Date(item.finishedAt) : null
    const durationMs = startedAt && finishedAt ? finishedAt - startedAt : null
    const durationStr = durationMs != null ? (durationMs / 1000) + 's' : null
    const currentStage = item.stage === 'failed' ? 'analyzing' : item.stage
    const currentStatus = item.status === 'done' || item.status === 'success' ? 'success' : item.status === 'failed' ? 'failed' : 'running'
    const currentMeta = []
    if (result.wordCount) currentMeta.push(result.wordCount + ' words')
    if (result.commentCount) currentMeta.push(result.commentCount + ' fetched')
    const currentMetaStr = currentMeta.length ? currentMeta.join(' · ') : ''

    for (let i = 0; i < stageOrder.length; i++) {
      const stage = stageOrder[i]
      const stepNum = i + 1
      const stageName = STAGE_NAMES[stage] || stage
      const isCurrent = stage === currentStage
      const isPast = stageOrder.indexOf(stage) < stageOrder.indexOf(currentStage)
      const isFuture = stageOrder.indexOf(stage) > stageOrder.indexOf(currentStage)

      let status = 'success'
      let meta = ''
      let timestamp = null
      let duration = null
      let error = null

      if (isPast) {
        status = 'success'
        if (stage === 'import') meta = item.createdAt ? new Date(item.createdAt).toLocaleTimeString() : ''
        if (stage === 'transcribe' && result.wordCount) meta = result.wordCount + ' words'
        if (stage === 'comments' && result.commentCount) meta = result.commentCount + ' fetched'
      } else if (isCurrent) {
        status = currentStatus
        meta = currentMetaStr
        timestamp = item.startedAt || item.createdAt
        duration = durationStr
        error = item.error || null
      } else {
        status = 'pending'
        meta = 'Waiting...'
      }

      logs.push({
        step: stepNum,
        stage,
        stageName,
        status,
        timestamp,
        duration,
        meta,
        error,
      })
    }

    res.json(logs)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

module.exports = router
