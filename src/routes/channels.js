const express = require('express')
const { z } = require('zod')
const db = require('../lib/db')
const { serialise } = require('../lib/serialise')
const { requireAuth, requireRole } = require('../middleware/auth')
const { NotFound, Forbidden, asyncWrap } = require('../middleware/errors')
const { parseBody, parseQuery } = require('../lib/validate')
const { fetchChannel, fetchRecentVideos } = require('../services/youtube')
const { getQueue, addJob } = require('../queue/pipeline')

const router = express.Router()
router.use(requireAuth)

const createChannelBodySchema = z.object({
  input: z.string().min(1, 'input is required'),
  parentChannelId: z.string().min(1, 'parentChannelId is required'),
  type: z.string().optional(),
  nationality: z.string().optional(),
})

const listChannelsQuerySchema = z.object({
  parentChannelId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
  cursor: z.string().optional(),
})

/** Compute avgViews and engagement from Video aggregates (no findMany of all videos). */
async function getChannelStats (channelId) {
  const [agg, engRow] = await Promise.all([
    db.video.aggregate({
      where: { channelId },
      _avg: { viewCount: true },
      _count: true,
    }),
    db.$queryRaw`
      SELECT AVG((COALESCE("likeCount",0)::float + COALESCE("commentCount",0)::float) / NULLIF(COALESCE("viewCount",1)::float, 0) * 100) as engagement
      FROM "Video" WHERE "channelId" = ${channelId}
    `.then((rows) => rows[0]).catch(() => ({ engagement: null })),
  ])
  const count = agg._count
  const avgViews = count && agg._avg?.viewCount != null ? Math.round(Number(agg._avg.viewCount)) : 0
  const engagementRounded = engRow?.engagement != null ? parseFloat(Number(engRow.engagement).toFixed(1)) : 0
  return { avgViews, engagement: engagementRounded }
}

// ── GET /api/channels?parentChannelId=xxx&limit=50&cursor=xxx
router.get('/', asyncWrap(async (req, res) => {
  const { parentChannelId, limit, cursor } = parseQuery(req.query, listChannelsQuerySchema)
  const where = parentChannelId ? { parentChannelId } : {}
  const take = limit + 1
  const channels = await db.channel.findMany({
    where,
    orderBy: [{ subscribers: 'desc' }, { id: 'asc' }],
    take,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    select: {
      id: true, youtubeId: true, handle: true, nameAr: true, nameEn: true,
      type: true, avatarUrl: true, status: true, subscribers: true,
      totalViews: true, videoCount: true, uploadCadence: true,
      lastFetchedAt: true, parentChannelId: true, createdAt: true, nationality: true,
    }
  })
  const hasMore = channels.length > limit
  const list = hasMore ? channels.slice(0, limit) : channels
  const nextCursor = hasMore ? list[list.length - 1].id : null
  res.json({ channels: list, nextCursor, hasMore })
}))

// ── GET /api/channels/:id — single channel for detail page (read-only; avgViews/engagement from DB aggregate; deltas from last snapshot)
router.get('/:id', asyncWrap(async (req, res) => {
  const id = req.params.id
  const channel = await db.channel.findUniqueOrThrow({
    where: { id },
    select: {
      id: true, youtubeId: true, handle: true, nameAr: true, nameEn: true,
      type: true, avatarUrl: true, status: true, subscribers: true,
      totalViews: true, videoCount: true, uploadCadence: true,
      lastFetchedAt: true, parentChannelId: true, createdAt: true,
      startHook: true, endHook: true, nationality: true,
    }
  })

  const [stats, lastSnap] = await Promise.all([
    getChannelStats(id),
    db.channelSnapshot.findFirst({
      where: { channelId: id },
      orderBy: { snapshotAt: 'desc' },
      take: 1,
    }),
  ])
  const { avgViews, engagement: engagementRounded } = stats

  const delta = (current, prev) => (prev != null ? current - prev : null)
  const deltas = {
    subscribers: delta(Number(channel.subscribers), lastSnap ? Number(lastSnap.subscribers) : null),
    totalViews: delta(Number(channel.totalViews), lastSnap ? Number(lastSnap.totalViews) : null),
    videoCount: delta(channel.videoCount ?? 0, lastSnap?.videoCount ?? null),
    avgViews: delta(avgViews, lastSnap?.avgViews ?? null),
    engagement: delta(engagementRounded, lastSnap?.engagement ?? null),
  }

  const payload = { ...channel, avgViews, engagement: engagementRounded, deltas }
  res.json(serialise(payload))
}))

const listVideosQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
})

// ── GET /api/channels/:id/videos?limit=50&offset=0 — videos for channel (with pipeline stage)
router.get('/:id/videos', asyncWrap(async (req, res) => {
  const { limit, offset } = parseQuery(req.query, listVideosQuerySchema)
  const channelId = req.params.id
  const [videos, total] = await Promise.all([
    db.video.findMany({
      where: { channelId },
      orderBy: { publishedAt: 'desc' },
      take: limit,
      skip: offset,
      include: {
        pipelineItem: { select: { id: true, stage: true, status: true, error: true } }
      }
    }),
    db.video.count({ where: { channelId } }),
  ])
  res.json({ videos, total, hasMore: offset + videos.length < total })
}))

// ── GET /api/channels/:id/publish-not-done — count manual stories not yet done
router.get('/:id/publish-not-done', asyncWrap(async (req, res) => {
  const channelId = req.params.id
  const count = await db.story.count({
    where: {
      channelId,
      origin: 'manual',
      stage: { not: 'done' },
    },
  })
  res.json({ count })
}))

// Helper: fetch recent videos from YouTube and create pipeline items for a channel (used on add + manual sync)
async function importVideosForChannel(channelId) {
  const channel = await db.channel.findUniqueOrThrow({ where: { id: channelId } })
  if (channel.status === 'paused') throw new Error('Channel is paused. Set to Active to fetch videos.')
  const parentId = channel.parentChannelId || channel.id

  const existingVideos = await db.video.findMany({
    where: { channelId: channel.id },
    select: { youtubeId: true },
  })
  const knownVideoIds = new Set(existingVideos.map(v => v.youtubeId))

  const videos = await fetchRecentVideos(channel.youtubeId, 500, parentId, knownVideoIds)
  const BATCH_SIZE = 25
  for (let i = 0; i < videos.length; i += BATCH_SIZE) {
    const batch = videos.slice(i, i + BATCH_SIZE)
    await db.$transaction(
      batch.map(v => db.video.upsert({
        where: { youtubeId: v.youtubeId },
        create: { ...v, channelId: channel.id },
        update: { viewCount: v.viewCount, likeCount: v.likeCount, commentCount: v.commentCount },
      }))
    )
  }
  const newVideos = await db.video.findMany({
    where: { channelId: channel.id, pipelineItem: null },
    select: { id: true },
    take: 500,
  })
  const queue = getQueue()
  const PIPELINE_BATCH = 25
  for (let i = 0; i < newVideos.length; i += PIPELINE_BATCH) {
    const batch = newVideos.slice(i, i + PIPELINE_BATCH)
    await db.$transaction(
      batch.map(v => db.pipelineItem.create({ data: { videoId: v.id } }))
    )
    if (queue) {
      const created = await db.pipelineItem.findMany({
        where: { videoId: { in: batch.map(v => v.id) } },
        orderBy: { createdAt: 'desc' },
        distinct: ['videoId'],
      })
      for (const item of created) await addJob(item.id, 'import')
    }
  }
  return { added: videos.length }
}

// ── POST /api/channels — add a new channel (and auto-import videos into pipeline)
router.post('/', requireRole('owner', 'admin', 'editor'), asyncWrap(async (req, res) => {
  const { input, type, parentChannelId, nationality } = parseBody(req.body, createChannelBodySchema)

  const parentChannel = await db.channel.findUnique({ where: { id: parentChannelId } })
  if (!parentChannel) throw NotFound('Parent channel not found')
  if (parentChannel.type !== 'ours') throw Forbidden('Parent channel must be type "ours"')
  if (parentChannel.status === 'paused') throw Forbidden('Parent channel is paused. Set to Active to add channels.')

  const ytData = await fetchChannel(input, parentChannelId)

  // Check for duplicate
  const exists = await db.channel.findUnique({ where: { youtubeId: ytData.youtubeId } })
  if (exists) return res.status(409).json({ error: 'Channel already added' })

  const channel = await db.channel.create({
    data: {
      ...ytData,
      type: type || 'competitor',
      parentChannelId,
      lastFetchedAt: new Date(),
      ...(nationality ? { nationality: nationality.trim() || null } : {}),
    }
  })

  // Auto-import videos and create pipeline items so the pipeline starts right away
  try {
    await importVideosForChannel(channel.id)
  } catch (importErr) {
    console.warn('Auto-import videos after add channel failed:', importErr.message)
  }

  res.json(channel)
}))

// ── POST /api/channels/:id/refresh — re-fetch from YouTube; snapshot created here when channel data changes
router.post('/:id/refresh', requireRole('owner', 'admin', 'editor'), async (req, res) => {
  try {
    const channel = await db.channel.findUniqueOrThrow({ where: { id: req.params.id } })
    if (channel.status === 'paused') return res.status(403).json({ error: 'Channel is paused. Set to Active to sync.' })
    const parentId = channel.parentChannelId || channel.id
    const ytData = await fetchChannel(channel.youtubeId, parentId)
    const updated = await db.channel.update({
      where: { id: channel.id },
      data: { ...ytData, lastFetchedAt: new Date() }
    })
    const { avgViews, engagement } = await getChannelStats(updated.id)
    await db.channelSnapshot.create({
      data: {
        channelId: updated.id,
        subscribers: BigInt(updated.subscribers ?? 0),
        totalViews: BigInt(updated.totalViews ?? 0),
        videoCount: updated.videoCount ?? 0,
        avgViews,
        engagement,
      }
    })
    res.json(updated)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── POST /api/channels/:id/fetch-videos — pull latest videos and create pipeline items
router.post('/:id/fetch-videos', requireRole('owner', 'admin', 'editor'), async (req, res) => {
  try {
    const { added } = await importVideosForChannel(req.params.id)
    res.json({ added, message: `Fetched ${added} videos` })
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Channel not found' })
    if (e.message && e.message.includes('paused')) return res.status(403).json({ error: 'Channel is paused. Set to Active to fetch videos.' })
    res.status(500).json({ error: e.message })
  }
})

// ── POST /api/channels/:id/analyze-all — queue all unanalyzed videos for AI analysis
router.post('/:id/analyze-all', requireRole('owner', 'admin', 'editor'), async (req, res) => {
  try {
    const channel = await db.channel.findUnique({ where: { id: req.params.id }, select: { id: true } })
    if (!channel) return res.status(404).json({ error: 'Channel not found' })
    const videos = await db.video.findMany({
      where: { channelId: req.params.id },
      select: { id: true },
      take: 2000,
    })
    const videoIds = videos.map(v => v.id)
    const existingItems = await db.pipelineItem.findMany({
      where: { videoId: { in: videoIds }, stage: 'analyzing', status: { in: ['queued', 'processing'] } },
      select: { videoId: true },
    })
    const existingSet = new Set(existingItems.map(i => i.videoId))
    const toCreate = videoIds.filter(id => !existingSet.has(id))
    const BATCH = 25
    for (let i = 0; i < toCreate.length; i += BATCH) {
      const batch = toCreate.slice(i, i + BATCH)
      await db.$transaction(
        batch.map(videoId => db.pipelineItem.create({ data: { videoId, stage: 'analyzing', status: 'queued' } }))
      )
    }
    res.json({ queued: toCreate.length, total: videos.length })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── PATCH /api/channels/:id — update channel (e.g. type, branded hooks)
router.patch('/:id', requireRole('owner', 'admin', 'editor'), async (req, res) => {
  try {
    const { type, startHook, endHook, nationality } = req.body
    const data = {}
    const VALID_TYPES = ['ours', 'competitor']
    if (type !== undefined) {
      if (!VALID_TYPES.includes(type)) return res.status(400).json({ error: `type must be one of: ${VALID_TYPES.join(', ')}` })
      data.type = type
    }
    if (startHook !== undefined) data.startHook = startHook === '' ? null : startHook
    if (endHook !== undefined) data.endHook = endHook === '' ? null : endHook
    if (nationality !== undefined) data.nationality = nationality === '' ? null : nationality
    const channel = await db.channel.update({
      where: { id: req.params.id },
      data
    })
    res.json(serialise(channel))
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── GET /api/channels/:id/niche-tags — read Content DNA tags
const nicheTagsBodySchema = z.object({
  nicheTags: z.array(z.string().max(50)).max(100),
  nicheTagsAr: z.array(z.string().max(50)).max(100),
})

router.get('/:id/niche-tags', asyncWrap(async (req, res) => {
  const channelId = req.params.id
  const profile = await db.scoreProfile.upsert({
    where: { channelId },
    create: { channelId },
    update: {},
    select: { nicheTags: true, nicheTagsAr: true },
  })
  res.json({ nicheTags: profile.nicheTags, nicheTagsAr: profile.nicheTagsAr })
}))

// ── PATCH /api/channels/:id/niche-tags — update Content DNA tags
router.patch('/:id/niche-tags', requireRole('owner', 'admin', 'editor'), asyncWrap(async (req, res) => {
  const { nicheTags, nicheTagsAr } = parseBody(req.body, nicheTagsBodySchema)
  const channelId = req.params.id
  const profile = await db.scoreProfile.upsert({
    where: { channelId },
    create: { channelId, nicheTags, nicheTagsAr },
    update: { nicheTags, nicheTagsAr },
    select: { nicheTags: true, nicheTagsAr: true },
  })
  res.json({ nicheTags: profile.nicheTags, nicheTagsAr: profile.nicheTagsAr })
}))

// ── POST /api/channels/:id/generate-niche-embedding — generate embedding from Content DNA tags
router.post('/:id/generate-niche-embedding', requireRole('owner', 'admin', 'editor'), asyncWrap(async (req, res) => {
  try {
    const { generateNicheEmbedding } = require('../services/embeddings')
    const result = await generateNicheEmbedding(req.params.id)
    res.json(result)
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
}))

// ── GET /api/channels/:id/niche-embedding-status — check if niche embedding exists
router.get('/:id/niche-embedding-status', asyncWrap(async (req, res) => {
  const channelId = req.params.id
  const profile = await db.scoreProfile.upsert({
    where: { channelId },
    create: { channelId },
    update: {},
    select: { nicheTags: true, nicheTagsAr: true, nicheEmbeddingGeneratedAt: true },
  })
  res.json({
    hasEmbedding: !!profile.nicheEmbeddingGeneratedAt,
    generatedAt: profile.nicheEmbeddingGeneratedAt,
    tagCount: (profile.nicheTags || []).length + (profile.nicheTagsAr || []).length,
  })
}))

// ── DELETE /api/channels/all — delete every channel (owner/admin only)
router.delete('/all', requireRole('owner', 'admin'), async (req, res) => {
  try {
    const result = await db.channel.deleteMany({})
    res.json({ ok: true, deleted: result.count })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── DELETE /api/channels/:id
router.delete('/:id', requireRole('owner', 'admin'), async (req, res) => {
  try {
    await db.channel.delete({ where: { id: req.params.id } })
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

module.exports = router
