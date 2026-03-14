const express = require('express')
const rateLimit = require('express-rate-limit')
const { z } = require('zod')
const db = require('../lib/db')
const { requireAuth, requireRole } = require('../middleware/auth')
const { parseQuery } = require('../lib/validate')
const {
  doStageImport,
  doStageTranscribe,
  doStageComments,
  doStageAnalyzing,
} = require('../services/pipelineProcessor')
const { getQueue, addJob } = require('../queue/pipeline')

const router = express.Router()
router.use(requireAuth)
const strictRateLimit = rateLimit({ windowMs: 60 * 1000, max: 20, message: { error: { code: 'rate_limit', message: 'Too many retries' } } })
const MAX_RETRIES = 3

const pipelineQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(2000).optional().default(1000),
  stage: z.enum(['import', 'transcribe', 'comments', 'analyzing', 'done', 'failed']).optional(),
  projectId: z.string().optional(),
})
const PER_STAGE_CAP = 100

// ── GET /api/pipeline?limit=1000&stage=xxx&projectId=xxx — pipeline state (capped), optional project scope
router.get('/', async (req, res) => {
  const { limit, stage, projectId } = parseQuery(req.query, pipelineQuerySchema)
  const where = { ...(stage ? { stage } : {}) }
  if (projectId) {
    where.video = { channel: { projectId } }
  }
  const items = await db.pipelineItem.findMany({
    where,
    include: {
      video: {
        select: {
          id: true, youtubeId: true, titleAr: true, thumbnailUrl: true,
          publishedAt: true, viewCount: true,
          channel: { select: { id: true, nameAr: true, handle: true, avatarUrl: true } }
        }
      }
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })

  const stages = ['import', 'transcribe', 'comments', 'analyzing', 'done', 'failed']
  const byStage = {}
  for (const s of stages) {
    byStage[s] = items.filter(i => i.stage === s).slice(0, PER_STAGE_CAP)
  }

  const stats = {
    total:      items.length,
    import:     byStage.import.length,
    transcribe: byStage.transcribe.length,
    comments:   byStage.comments.length,
    analyzing:  byStage.analyzing.length,
    done:       byStage.done.length,
    failed:     byStage.failed.length,
  }

  res.json({ stats, byStage })
})

// ── POST /api/pipeline/process — enqueue one job (if Redis) or run one step in-process
router.post('/process', requireRole('owner', 'admin', 'editor'), async (req, res) => {
  try {
    const queue = getQueue()
    if (queue) {
      const item = await db.pipelineItem.findFirst({
        where: { status: 'queued', retries: { lt: MAX_RETRIES } },
        orderBy: { createdAt: 'asc' },
      })
      if (!item) return res.json({ processed: 0, enqueued: 0 })
      await addJob(item.id, item.stage)
      return res.json({ processed: 0, enqueued: 1, pipelineItemId: item.id, stage: item.stage })
    }
    const result = await processOneItem()
    res.json(result)
  } catch (e) {
    res.status(500).json({ error: e.message, processed: 0 })
  }
})

// ── POST /api/pipeline/pause — pause all active projects
router.post('/pause', requireRole('owner', 'admin'), async (req, res) => {
  try {
    await db.project.updateMany({
      where: { status: 'active' },
      data: { status: 'paused' },
    })
    res.json({ message: 'Pipeline paused' })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── POST /api/pipeline/resume — resume all paused projects
router.post('/resume', requireRole('owner', 'admin'), async (req, res) => {
  try {
    await db.project.updateMany({
      where: { status: 'paused' },
      data: { status: 'active' },
    })
    res.json({ message: 'Pipeline resumed' })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── POST /api/pipeline/retry-all-failed — resume each from lastStage; enqueue jobs if Redis (strict rate limit; must be before /:id/retry)
router.post('/retry-all-failed', strictRateLimit, requireRole('owner', 'admin', 'editor'), async (req, res) => {
  try {
    const failed = await db.pipelineItem.findMany({ where: { stage: 'failed' } })
    const queue = getQueue()
    for (const item of failed) {
      const stage = item.lastStage || 'import'
      await db.pipelineItem.update({
        where: { id: item.id },
        data: { status: 'queued', stage, error: null, retries: 0 },
      })
      if (queue) await addJob(item.id, stage)
    }
    res.json({ retried: failed.length })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── POST /api/pipeline/:id/retry — resume from lastStage; enqueue job if Redis (strict rate limit)
router.post('/:id/retry', strictRateLimit, requireRole('owner', 'admin', 'editor'), async (req, res) => {
  try {
    const existing = await db.pipelineItem.findUnique({ where: { id: req.params.id } })
    const resumeStage = existing?.lastStage || 'import'
    const item = await db.pipelineItem.update({
      where: { id: req.params.id },
      data: { status: 'queued', stage: resumeStage, error: null, retries: 0 },
    })
    const queue = getQueue()
    if (queue) await addJob(item.id, resumeStage)
    res.json(item)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── Pipeline processor: advance one queued item through the next stage ──
async function processOneItem() {
  const stages = ['import', 'transcribe', 'comments', 'analyzing']
  for (const stage of stages) {
    const item = await db.pipelineItem.findFirst({
      where: { stage, status: 'queued', retries: { lt: MAX_RETRIES } },
      include: {
        video: {
          include: {
            channel: { include: { project: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    })
    if (!item?.video?.channel?.project) continue
    const project = item.video.channel.project
    if (project.status === 'paused') continue

    await db.pipelineItem.update({
      where: { id: item.id },
      data: { status: 'running', startedAt: new Date(), error: null, lastStage: stage },
    })

    const video = item.video
    try {
      let out
      if (stage === 'import') out = await doStageImport(item, video, project)
      else if (stage === 'transcribe') out = await doStageTranscribe(item, video, project)
      else if (stage === 'comments') out = await doStageComments(item, video, project)
      else if (stage === 'analyzing') out = await doStageAnalyzing(item, video, project)
      else continue

      await db.pipelineItem.update({
        where: { id: item.id },
        data: {
          stage: out.nextStage,
          status: out.nextStage === 'done' ? 'done' : 'queued',
          error: null,
          finishedAt: new Date(),
        },
      })
      return { processed: 1, stage, next: out.nextStage }
    } catch (err) {
      await db.pipelineItem.update({
        where: { id: item.id },
        data: {
          stage: 'failed',
          status: 'failed',
          error: (err && err.message) || String(err),
          retries: { increment: 1 },
          finishedAt: new Date(),
        },
      })
      return { processed: 1, failed: true, error: err.message }
    }
  }
  return { processed: 0 }
}

module.exports = router
