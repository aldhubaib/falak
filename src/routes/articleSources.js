const express = require('express')
const db = require('../lib/db')
const { requireAuth, requireRole } = require('../middleware/auth')
const { encrypt } = require('../services/crypto')
const {
  VALID_SOURCE_TYPES,
  validateConfig,
  testSourceFetch,
  deriveYouTubeStatus,
  computeYouTubeCadence,
  sanitizeString,
} = require('../services/articlePipeline')

const router = express.Router()
router.use(requireAuth)

function sanitizeSource(source) {
  const { apiKeyEncrypted, _count, apifyRuns, ...rest } = source
  return {
    ...rest,
    hasApiKey: !!apiKeyEncrypted,
    ...(typeof _count?.articles === 'number' ? { articleCount: _count.articles } : {}),
  }
}

const MAX_IMAGE_SIZE = 2 * 1024 * 1024 // 2 MB base64

// ── GET /api/article-sources?channelId=X ──────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { channelId } = req.query
    if (!channelId) return res.status(400).json({ error: 'channelId required' })

    const sources = await db.articleSource.findMany({
      where: { channelId, type: { in: VALID_SOURCE_TYPES } },
      include: {
        _count: { select: { articles: true } },
        apifyRuns: {
          orderBy: { startedAt: 'desc' },
          take: 20,
          select: {
            id: true,
            runId: true,
            datasetId: true,
            startedAt: true,
            finishedAt: true,
            itemCount: true,
            status: true,
            importedAt: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    })

    const sourceIds = sources.map(s => s.id)
    const allStageCounts = sourceIds.length > 0
      ? await db.article.groupBy({
          by: ['sourceId', 'stage'],
          where: { sourceId: { in: sourceIds } },
          _count: true,
        })
      : []
    const statsMap = new Map()
    for (const row of allStageCounts) {
      if (!statsMap.has(row.sourceId)) statsMap.set(row.sourceId, {})
      statsMap.get(row.sourceId)[row.stage] = row._count
    }
    const withStats = sources.map(s => ({
      ...sanitizeSource(s),
      stats: statsMap.get(s.id) || {},
      apifyRuns: s.apifyRuns || [],
    }))

    res.json(withStats)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── POST /api/article-sources ─────────────────────────────────────────────
router.post('/', requireRole('owner', 'admin', 'editor'), async (req, res) => {
  try {
    const { channelId, type, label, config, language, apiKey, image } = req.body
    if (!channelId || !type || !label || !config) {
      return res.status(400).json({ error: 'channelId, type, label, and config are required' })
    }
    if (!VALID_SOURCE_TYPES.includes(type)) {
      return res.status(400).json({ error: `Invalid type. Must be one of: ${VALID_SOURCE_TYPES.join(', ')}` })
    }
    const configError = validateConfig(type, config)
    if (configError) return res.status(400).json({ error: configError })

    if (type === 'apify_actor' && !apiKey?.trim()) {
      return res.status(400).json({ error: 'Apify Actor requires an API token for this source' })
    }
    if (image && image.length > MAX_IMAGE_SIZE) {
      return res.status(400).json({ error: 'Image too large (max 2 MB)' })
    }

    // Resolve YouTube channel metadata
    if (type === 'youtube_channel') {
      try {
        const { fetchChannel } = require('../services/youtube')
        let handleOrId = config.channelUrl || config.handle || config.youtubeChannelId || ''
        handleOrId = handleOrId.trim()
        // Extract handle from full YouTube URL
        const urlMatch = handleOrId.match(/youtube\.com\/@?([\w-]+)/)
        if (urlMatch) handleOrId = urlMatch[1]
        if (handleOrId.startsWith('https://')) {
          const parsed = new URL(handleOrId)
          handleOrId = parsed.pathname.replace(/^\//, '').replace(/\/$/, '')
        }
        const ytData = await fetchChannel(handleOrId, channelId)
        config.youtubeChannelId = ytData.youtubeId
        config.handle = ytData.handle
        config.channelName = ytData.nameAr || ytData.nameEn
        config.avatarUrl = ytData.avatarUrl
        config.subscribers = Number(ytData.subscribers || 0)
        if (!req.body.label || req.body.label === 'YouTube Channel') {
          req.body.label = ytData.nameAr || ytData.nameEn || handleOrId
        }
        if (!req.body.image && ytData.avatarUrl) {
          req.body.image = null // will use config.avatarUrl instead
        }
      } catch (e) {
        return res.status(400).json({ error: `Could not resolve YouTube channel: ${e.message}` })
      }

      // Prevent duplicate youtube channels
      const existing = await db.articleSource.findMany({
        where: { channelId, type: 'youtube_channel' },
        select: { label: true, config: true },
      })
      const dup = existing.find(s => s.config?.youtubeChannelId === config.youtubeChannelId)
      if (dup) {
        return res.status(400).json({ error: `YouTube channel already added as "${dup.label}"` })
      }
    }

    // Prevent duplicate actorId/datasetId — same config would import same articles and cause wrong source attribution
    if (type === 'apify_actor' && config?.actorId) {
      const existing = await db.articleSource.findMany({
        where: { channelId, type: 'apify_actor' },
        select: { label: true, config: true },
      })
      const newActorId = String(config.actorId).trim()
      const newDatasetId = config.datasetId ? String(config.datasetId).trim() : null
      const dup = existing.find((s) => {
        const c = s.config || {}
        const a = (c.actorId || '').toString().trim()
        const d = c.datasetId ? String(c.datasetId).trim() : null
        return a === newActorId && d === newDatasetId
      })
      if (dup) {
        return res.status(400).json({
          error: `Another source "${dup.label}" already uses this actor${newDatasetId ? ' and dataset' : ''}. Each source must have a unique actor/dataset to avoid wrong article attribution.`,
        })
      }
    }

    const finalLabel = (req.body.label || label || type).trim()
    const source = await db.articleSource.create({
      data: {
        channelId,
        type,
        label: finalLabel,
        config,
        image: image || null,
        apiKeyEncrypted: type === 'apify_actor' && apiKey ? encrypt(apiKey.trim()) : null,
        language: type === 'youtube_channel' ? (config.language || 'ar') : (language || 'en'),
      },
    })
    res.json(sanitizeSource(source))
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── PATCH /api/article-sources/:id ────────────────────────────────────────
router.patch('/:id', requireRole('owner', 'admin', 'editor'), async (req, res) => {
  try {
    const existing = await db.articleSource.findUnique({ where: { id: req.params.id } })
    if (!existing) return res.status(404).json({ error: 'Source not found' })

    const data = {}
    const nextType = req.body.type || existing.type
    if (req.body.label !== undefined) data.label = String(req.body.label || '').trim()
    if (req.body.isActive !== undefined) data.isActive = !!req.body.isActive
    if (req.body.language !== undefined) data.language = req.body.language
    if (req.body.image !== undefined) {
      if (req.body.image && req.body.image.length > MAX_IMAGE_SIZE) {
        return res.status(400).json({ error: 'Image too large (max 2 MB)' })
      }
      data.image = req.body.image || null
    }
    if (req.body.apiKey !== undefined) {
      if (nextType === 'apify_actor') {
        data.apiKeyEncrypted = req.body.apiKey ? encrypt(req.body.apiKey.trim()) : null
      }
    } else if (req.body.type && nextType !== 'apify_actor') {
      data.apiKeyEncrypted = null
    }
    if (req.body.config !== undefined) {
      const configError = validateConfig(nextType, req.body.config)
      if (configError) return res.status(400).json({ error: configError })
      // Prevent duplicate actorId/datasetId when updating config
      if (nextType === 'apify_actor' && req.body.config?.actorId) {
        const existing = await db.articleSource.findMany({
          where: { channelId: existing.channelId, type: 'apify_actor', id: { not: req.params.id } },
          select: { label: true, config: true },
        })
        const newActorId = String(req.body.config.actorId).trim()
        const newDatasetId = req.body.config.datasetId ? String(req.body.config.datasetId).trim() : null
        const dup = existing.find((s) => {
          const c = s.config || {}
          const a = (c.actorId || '').toString().trim()
          const d = c.datasetId ? String(c.datasetId).trim() : null
          return a === newActorId && d === newDatasetId
        })
        if (dup) {
          return res.status(400).json({
            error: `Another source "${dup.label}" already uses this actor${newDatasetId ? ' and dataset' : ''}. Each source must have a unique actor/dataset.`,
          })
        }
      }
      data.config = req.body.config
      if (req.body.type) data.type = req.body.type
    }

    const updated = await db.articleSource.update({ where: { id: req.params.id }, data })
    res.json(sanitizeSource(updated))
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── DELETE /api/article-sources/:id?deleteStories=true ────────────────────
router.delete('/:id', requireRole('owner', 'admin'), async (req, res) => {
  try {
    const deleteStories = req.query.deleteStories === 'true'
    let storiesDeleted = 0

    if (deleteStories) {
      const articles = await db.article.findMany({
        where: { sourceId: req.params.id, storyId: { not: null } },
        select: { storyId: true },
      })
      const storyIds = [...new Set(articles.map(a => a.storyId).filter(Boolean))]
      if (storyIds.length > 0) {
        await db.storyLog.deleteMany({ where: { storyId: { in: storyIds } } })
        const result = await db.story.deleteMany({ where: { id: { in: storyIds } } })
        storiesDeleted = result.count
      }
    }

    await db.articleSource.delete({ where: { id: req.params.id } })
    res.json({ ok: true, storiesDeleted })
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Source not found' })
    res.status(500).json({ error: e.message })
  }
})

// ── POST /api/article-sources/:id/test — dry-run fetch ────────────────────
router.post('/:id/test', requireRole('owner', 'admin', 'editor'), async (req, res) => {
  try {
    const source = await db.articleSource.findUnique({
      where: { id: req.params.id },
      include: { channel: true },
    })
    if (!source) return res.status(404).json({ error: 'Source not found' })

    const articles = await testSourceFetch(source.type, source.config, source.channel, source)
    res.json({ articles, count: articles.length })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── POST /api/article-sources/:id/reimport-run — re-import a specific Apify run
router.post('/:id/reimport-run', requireRole('owner', 'admin', 'editor'), async (req, res) => {
  try {
    const { runId } = req.body
    if (!runId) return res.status(400).json({ error: 'runId required' })

    const source = await db.articleSource.findUnique({
      where: { id: req.params.id },
      include: { channel: true },
    })
    if (!source) return res.status(404).json({ error: 'Source not found' })

    const apifyRun = await db.apifyRun.findFirst({
      where: { sourceId: source.id, runId },
    })
    if (!apifyRun) return res.status(404).json({ error: 'Run not found' })
    if (!apifyRun.datasetId) return res.status(400).json({ error: 'Run has no dataset' })

    const { getApifyToken, fetchDatasetItemsByDatasetId } = require('../services/apify')
    const { applyKeywordGate, canonicalizeArticleUrl } = require('../services/articlePipeline')

    const apiKey = getApifyToken(source)
    if (!apiKey) return res.status(400).json({ error: 'No API key for this source' })

    const limit = source.config?.limit || 0
    const result = await fetchDatasetItemsByDatasetId(apifyRun.datasetId, apiKey, limit, source.language || 'en')
    const rawArticles = result.articles || []

    const searchConfig = source.config?.search || null
    const { passed } = applyKeywordGate(rawArticles, searchConfig)

    let dupes = 0
    let runDupes = 0
    const seenInRun = new Set()
    const toInsert = []

    for (const raw of passed) {
      const url = canonicalizeArticleUrl(raw.url)
      if (!url) { dupes++; continue }
      if (seenInRun.has(url)) { runDupes++; continue }
      seenInRun.add(url)
      toInsert.push({
        channelId: source.channelId,
        sourceId: source.id,
        url,
        title: sanitizeString(raw.title) || null,
        description: sanitizeString(raw.description) || null,
        content: sanitizeString(raw.content) || null,
        publishedAt: raw.publishedAt ? new Date(raw.publishedAt) : null,
        language: raw.language || source.language || 'en',
        category: sanitizeString(raw.category) || null,
        tags: raw.tags && raw.tags.length > 0 ? raw.tags.map(sanitizeString) : undefined,
        featuredImage: raw.featuredImage || null,
        images: raw.images && raw.images.length > 0 ? raw.images : undefined,
        stage: 'imported',
        status: 'queued',
      })
    }
    let inserted = 0
    if (toInsert.length > 0) {
      const result = await db.article.createMany({ data: toInsert, skipDuplicates: true })
      inserted = result.count
      dupes += toInsert.length - result.count
    }

    await db.apifyRun.update({
      where: { id: apifyRun.id },
      data: { itemCount: result.rawCount, status: 'imported', importedAt: new Date() },
    })

    res.json({ fetched: rawArticles.length, inserted, dupes, runDupes })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── GET /api/article-sources/field-schema — API-specific SEARCH fields ────
router.get('/field-schema', async (req, res) => {
  const schema = {
    rss: {
      label: 'RSS Feed',
      docs: null,
      fields: [
        { key: 'url', label: 'Feed URL', type: 'url', required: true, placeholder: 'https://example.com/feed.xml', help: 'Full URL to the RSS/Atom feed.' },
      ],
    },
    apify_actor: {
      label: 'Apify Actor',
      docs: 'https://docs.apify.com/',
      fields: [],
    },
    youtube_channel: {
      label: 'YouTube Channel',
      docs: null,
      fields: [
        { key: 'channelUrl', label: 'Channel URL or @handle', type: 'text', required: true, placeholder: 'https://youtube.com/@ChannelName or @ChannelName', help: 'YouTube channel URL, handle, or channel ID.' },
      ],
    },
  }
  res.json(schema)
})

// ── POST /api/article-sources/test-config — dry-run with arbitrary config ─
router.post('/test-config', requireRole('owner', 'admin', 'editor'), async (req, res) => {
  try {
    const { channelId, type, config, apiKey } = req.body
    if (!channelId || !type || !config) {
      return res.status(400).json({ error: 'channelId, type, and config required' })
    }
    const configError = validateConfig(type, config)
    if (configError) return res.status(400).json({ error: configError })

    const channel = await db.channel.findUnique({ where: { id: channelId } })
    if (!channel) return res.status(404).json({ error: 'Channel not found' })

    if (type === 'youtube_channel') {
      const { fetchRecentVideos, fetchChannel } = require('../services/youtube')
      let handleOrId = config.channelUrl || config.handle || config.youtubeChannelId || ''
      const urlMatch = handleOrId.match(/youtube\.com\/@?([\w-]+)/)
      if (urlMatch) handleOrId = urlMatch[1]
      const ytData = await fetchChannel(handleOrId, channelId)
      const videos = await fetchRecentVideos(ytData.youtubeId, 10, channelId)
      const articles = videos
        .filter(v => v.videoType !== 'short')
        .slice(0, 10)
        .map(v => ({
          url: `https://www.youtube.com/watch?v=${v.youtubeId}`,
          title: v.titleAr || v.titleEn || '',
        }))
      return res.json({ articles, count: articles.length, channel: { name: ytData.nameAr, handle: ytData.handle, avatarUrl: ytData.avatarUrl } })
    }

    const source = type === 'apify_actor' && apiKey ? { apiKeyEncrypted: encrypt(apiKey.trim()) } : null
    const articles = await testSourceFetch(type, config, channel, source)
    res.json({ articles, count: articles.length })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

module.exports = router
