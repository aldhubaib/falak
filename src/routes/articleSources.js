const express = require('express')
const db = require('../lib/db')
const { requireAuth, requireRole } = require('../middleware/auth')
const { encrypt } = require('../services/crypto')
const {
  VALID_SOURCE_TYPES,
  validateConfig,
  testSourceFetch,
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

// ── GET /api/article-sources?projectId=X ──────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { projectId } = req.query
    if (!projectId) return res.status(400).json({ error: 'projectId required' })

    const sources = await db.articleSource.findMany({
      where: { projectId, type: { in: VALID_SOURCE_TYPES } },
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

    const withStats = await Promise.all(sources.map(async (s) => {
      const stageCounts = await db.article.groupBy({
        by: ['stage'],
        where: { sourceId: s.id },
        _count: true,
      })
      const stats = {}
      for (const row of stageCounts) {
        stats[row.stage] = row._count
      }
      return { ...sanitizeSource(s), stats, apifyRuns: s.apifyRuns || [] }
    }))

    res.json(withStats)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── POST /api/article-sources ─────────────────────────────────────────────
router.post('/', requireRole('owner', 'admin', 'editor'), async (req, res) => {
  try {
    const { projectId, type, label, config, language, apiKey } = req.body
    if (!projectId || !type || !label || !config) {
      return res.status(400).json({ error: 'projectId, type, label, and config are required' })
    }
    if (!VALID_SOURCE_TYPES.includes(type)) {
      return res.status(400).json({ error: `Invalid type. Must be one of: ${VALID_SOURCE_TYPES.join(', ')}` })
    }
    const configError = validateConfig(type, config)
    if (configError) return res.status(400).json({ error: configError })

    if (type === 'apify_actor' && !apiKey?.trim()) {
      return res.status(400).json({ error: 'Apify Actor requires an API token for this source' })
    }

    const source = await db.articleSource.create({
      data: {
        projectId,
        type,
        label: label.trim(),
        config,
        apiKeyEncrypted: type === 'apify_actor' ? encrypt(apiKey.trim()) : null,
        language: language || 'en',
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
    if (req.body.label !== undefined) data.label = req.body.label.trim()
    if (req.body.isActive !== undefined) data.isActive = !!req.body.isActive
    if (req.body.language !== undefined) data.language = req.body.language
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
      data.config = req.body.config
      if (req.body.type) data.type = req.body.type
    }

    const updated = await db.articleSource.update({ where: { id: req.params.id }, data })
    res.json(sanitizeSource(updated))
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── DELETE /api/article-sources/:id ───────────────────────────────────────
router.delete('/:id', requireRole('owner', 'admin'), async (req, res) => {
  try {
    await db.articleSource.delete({ where: { id: req.params.id } })
    res.json({ ok: true })
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
      include: { project: true },
    })
    if (!source) return res.status(404).json({ error: 'Source not found' })

    const articles = await testSourceFetch(source.type, source.config, source.project, source)
    res.json({ articles, count: articles.length })
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
  }
  res.json(schema)
})

// ── POST /api/article-sources/test-config — dry-run with arbitrary config ─
router.post('/test-config', requireRole('owner', 'admin', 'editor'), async (req, res) => {
  try {
    const { projectId, type, config, apiKey } = req.body
    if (!projectId || !type || !config) {
      return res.status(400).json({ error: 'projectId, type, and config required' })
    }
    const configError = validateConfig(type, config)
    if (configError) return res.status(400).json({ error: configError })

    const project = await db.project.findUnique({ where: { id: projectId } })
    if (!project) return res.status(404).json({ error: 'Project not found' })

    const source = type === 'apify_actor' && apiKey ? { apiKeyEncrypted: encrypt(apiKey.trim()) } : null
    const articles = await testSourceFetch(type, config, project, source)
    res.json({ articles, count: articles.length })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

module.exports = router
