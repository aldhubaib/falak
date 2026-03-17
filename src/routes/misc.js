const express = require('express')
const db = require('../lib/db')
const { requireAuth, requireRole } = require('../middleware/auth')
const { encrypt, decrypt } = require('../services/crypto')

function stripProjectKeys(p) {
  const {
    youtubeApiKeyEncrypted,
    anthropicApiKeyEncrypted,
    perplexityApiKeyEncrypted,
    ytTranscriptApiKeyEncrypted,
    firecrawlApiKeyEncrypted,
    newsapiApiKeyEncrypted,
    gnewsApiKeyEncrypted,
    guardianApiKeyEncrypted,
    nytApiKeyEncrypted,
    ...rest
  } = p
  return {
    ...rest,
    hasYoutubeKey:      !!youtubeApiKeyEncrypted,
    hasAnthropicKey:    !!anthropicApiKeyEncrypted,
    hasPerplexityKey:   !!perplexityApiKeyEncrypted,
    hasYtTranscriptKey: !!ytTranscriptApiKeyEncrypted,
    hasFirecrawlKey:    !!firecrawlApiKeyEncrypted,
    hasNewsapiKey:      !!newsapiApiKeyEncrypted,
    hasGnewsKey:        !!gnewsApiKeyEncrypted,
    hasGuardianKey:     !!guardianApiKeyEncrypted,
    hasNytKey:          !!nytApiKeyEncrypted,
  }
}

// ── MONITOR ────────────────────────────────────────────────────
const monitor = express.Router()
monitor.use(requireAuth)

monitor.get('/', async (req, res) => {
  try {
    const { projectId } = req.query
    const where = projectId ? { projectId } : {}
    const channels = await db.channel.findMany({
      where,
      select: {
        id: true, nameAr: true, nameEn: true, handle: true, avatarUrl: true,
        type: true, status: true, lastFetchedAt: true, uploadCadence: true,
        _count: { select: { videos: true } },
        videos: { orderBy: { publishedAt: 'desc' }, take: 1, select: { publishedAt: true } }
      },
      orderBy: { lastFetchedAt: 'asc' }
    })
    const list = channels.map(ch => {
      const { videos, ...rest } = ch
      const lastVideoPublishedAt = videos && videos[0] ? videos[0].publishedAt : null
      return { ...rest, lastVideoPublishedAt }
    })
    res.json(list)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── ADMIN (user management) ────────────────────────────────────
const admin = express.Router()
admin.use(requireAuth)
admin.use(requireRole('owner', 'admin'))

admin.get('/users', async (req, res) => {
  try {
    const users = await db.user.findMany({
      select: {
        id: true, email: true, name: true, avatarUrl: true,
        role: true, note: true, isActive: true,
        pageAccess: true, projectAccess: true,
        createdAt: true, updatedAt: true,
      },
      orderBy: { createdAt: 'asc' }
    })
    res.json(users)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

admin.post('/users', async (req, res) => {
  try {
    const { email, role, note, pageAccess, projectAccess } = req.body
    if (!email) return res.status(400).json({ error: 'email required' })

    const existing = await db.user.findUnique({ where: { email } })
    if (existing) return res.status(409).json({ error: 'User already exists' })

    const user = await db.user.create({
      data: { email, role: role || 'viewer', note, pageAccess, projectAccess }
    })
    res.json(user)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

admin.patch('/users/:id', async (req, res) => {
  try {
    // Prevent owner from demoting themselves
    if (req.params.id === req.user.id && req.body.role && req.body.role !== 'owner') {
      return res.status(400).json({ error: 'Cannot change your own role' })
    }
    const allowed = ['role', 'note', 'isActive', 'pageAccess', 'projectAccess']
    const data = {}
    for (const k of allowed) if (req.body[k] !== undefined) data[k] = req.body[k]

    const user = await db.user.update({ where: { id: req.params.id }, data })
    res.json(user)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

admin.delete('/users/:id', async (req, res) => {
  try {
    if (req.params.id === req.user.id) return res.status(400).json({ error: 'Cannot delete yourself' })
    await db.user.delete({ where: { id: req.params.id } })
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// Re-queue videos that have a plain-string transcription (not yet migrated to JSON segments).
// Call once after deploying the segment-storage update to re-process existing videos.
admin.post('/retranscribe-all', async (req, res) => {
  try {
    const videos = await db.video.findMany({
      where: { transcription: { not: null } },
      select: {
        id: true,
        transcription: true,
        pipelineItem: { select: { id: true, stage: true } },
      },
    })

    // A transcription is "already migrated" if it's valid JSON containing an array.
    const needsMigration = videos.filter(v => {
      try {
        const p = JSON.parse(v.transcription)
        return !Array.isArray(p)   // has content but it's not an array
      } catch (_) {
        return true                // plain string — not valid JSON at all
      }
    })

    let reset = 0
    for (const v of needsMigration) {
      if (v.pipelineItem) {
        await db.pipelineItem.update({
          where: { id: v.pipelineItem.id },
          data: { stage: 'transcribe', status: 'queued', error: null, retries: 0 },
        })
        reset++
      }
    }

    res.json({ ok: true, total: videos.length, reset })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── PROJECTS ───────────────────────────────────────────────────
const projects = express.Router()
projects.use(requireAuth)

projects.get('/', async (req, res) => {
  try {
    const items = await db.project.findMany({
      include: { _count: { select: { channels: true, stories: true } } },
      orderBy: { createdAt: 'asc' }
    })
    res.json(items.map(stripProjectKeys))
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

projects.post('/', requireRole('owner', 'admin'), async (req, res) => {
  try {
    const { name, nameAr, color } = req.body
    if (!name) return res.status(400).json({ error: 'name required' })
    const project = await db.project.create({ data: { name, nameAr, color } })
    res.json(project)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

projects.patch('/:id', requireRole('owner', 'admin'), async (req, res) => {
  try {
    const { name, nameAr, color, status } = req.body
    const data = {}
    if (name !== undefined) data.name = name
    if (nameAr !== undefined) data.nameAr = nameAr
    if (color !== undefined) data.color = color
    if (status !== undefined) data.status = status
    const project = await db.project.update({ where: { id: req.params.id }, data })
    res.json(stripProjectKeys(project))
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// Returns the first `prefixLen` characters of a decrypted key followed by bullet mask.
// Never throws — returns null if the value is missing or decryption fails.
function keyPreview(enc, prefixLen = 16) {
  if (!enc) return null
  try {
    const plain = decrypt(enc)
    return plain.slice(0, prefixLen) + '••••••••'
  } catch (_) {
    return null
  }
}

const PROJECT_KEY_SELECT = {
  youtubeApiKeyEncrypted: true,
  anthropicApiKeyEncrypted: true,
  perplexityApiKeyEncrypted: true,
  ytTranscriptApiKeyEncrypted: true,
  firecrawlApiKeyEncrypted: true,
  newsapiApiKeyEncrypted: true,
  gnewsApiKeyEncrypted: true,
  guardianApiKeyEncrypted: true,
  nytApiKeyEncrypted: true,
}

// Helper: parse the YouTube key field — supports both single key and JSON array
function parseYoutubeKeys(raw) {
  if (!raw) return []
  try {
    if (raw.trimStart().startsWith('[')) return JSON.parse(raw)
  } catch (_) {}
  // Legacy: single encrypted key — wrap as one entry with no label
  return [{ label: 'Key 1', enc: raw }]
}

function buildKeyStatus(project) {
  const ytKeys = parseYoutubeKeys(project.youtubeApiKeyEncrypted)
  return {
    hasYoutubeKey:          ytKeys.length > 0,
    youtubeKeys:            ytKeys.map(({ label, enc }) => ({ label, preview: keyPreview(enc, 8) })),
    hasAnthropicKey:        !!project.anthropicApiKeyEncrypted,
    anthropicKeyPreview:    keyPreview(project.anthropicApiKeyEncrypted, 16),
    hasPerplexityKey:       !!project.perplexityApiKeyEncrypted,
    perplexityKeyPreview:   keyPreview(project.perplexityApiKeyEncrypted, 16),
    hasYtTranscriptKey:     !!project.ytTranscriptApiKeyEncrypted,
    ytTranscriptKeyPreview: keyPreview(project.ytTranscriptApiKeyEncrypted, 16),
    hasFirecrawlKey:        !!project.firecrawlApiKeyEncrypted,
    firecrawlKeyPreview:    keyPreview(project.firecrawlApiKeyEncrypted, 12),
    hasNewsapiKey:          !!project.newsapiApiKeyEncrypted,
    newsapiKeyPreview:      keyPreview(project.newsapiApiKeyEncrypted, 12),
    hasGnewsKey:            !!project.gnewsApiKeyEncrypted,
    gnewsKeyPreview:        keyPreview(project.gnewsApiKeyEncrypted, 12),
    hasGuardianKey:         !!project.guardianApiKeyEncrypted,
    guardianKeyPreview:     keyPreview(project.guardianApiKeyEncrypted, 12),
    hasNytKey:              !!project.nytApiKeyEncrypted,
    nytKeyPreview:          keyPreview(project.nytApiKeyEncrypted, 12),
  }
}

// GET /api/projects/:id/keys — return key presence for all 5 services
projects.get('/:id/keys', requireRole('owner', 'admin'), async (req, res) => {
  try {
    const project = await db.project.findUnique({
      where: { id: req.params.id },
      select: PROJECT_KEY_SELECT,
    })
    if (!project) return res.status(404).json({ error: 'Project not found' })
    res.json(buildKeyStatus(project))
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// PATCH /api/projects/:id/keys — save/clear anthropic, perplexity, ytTranscript, firecrawl keys
projects.patch('/:id/keys', requireRole('owner', 'admin'), async (req, res) => {
  try {
    const { anthropicKey, perplexityKey, ytTranscriptKey, firecrawlKey, newsapiKey, gnewsKey, guardianKey, nytKey } = req.body
    const data = {}
    if (anthropicKey !== undefined)
      data.anthropicApiKeyEncrypted = anthropicKey ? encrypt(anthropicKey) : null
    if (perplexityKey !== undefined)
      data.perplexityApiKeyEncrypted = perplexityKey ? encrypt(perplexityKey) : null
    if (ytTranscriptKey !== undefined)
      data.ytTranscriptApiKeyEncrypted = ytTranscriptKey ? encrypt(ytTranscriptKey) : null
    if (firecrawlKey !== undefined)
      data.firecrawlApiKeyEncrypted = firecrawlKey ? encrypt(firecrawlKey) : null
    if (newsapiKey !== undefined)
      data.newsapiApiKeyEncrypted = newsapiKey ? encrypt(newsapiKey) : null
    if (gnewsKey !== undefined)
      data.gnewsApiKeyEncrypted = gnewsKey ? encrypt(gnewsKey) : null
    if (guardianKey !== undefined)
      data.guardianApiKeyEncrypted = guardianKey ? encrypt(guardianKey) : null
    if (nytKey !== undefined)
      data.nytApiKeyEncrypted = nytKey ? encrypt(nytKey) : null

    const project = await db.project.update({
      where: { id: req.params.id },
      data,
      select: PROJECT_KEY_SELECT,
    })
    res.json(buildKeyStatus(project))
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /api/projects/:id/keys/youtube — add a YouTube Data API v3 key with a label
projects.post('/:id/keys/youtube', requireRole('owner', 'admin'), async (req, res) => {
  try {
    const { key, label } = req.body
    if (!key) return res.status(400).json({ error: 'key is required' })

    const project = await db.project.findUnique({
      where: { id: req.params.id },
      select: { youtubeApiKeyEncrypted: true },
    })
    if (!project) return res.status(404).json({ error: 'Project not found' })

    const existing = parseYoutubeKeys(project.youtubeApiKeyEncrypted)
    existing.push({ label: label || `Key ${existing.length + 1}`, enc: encrypt(key) })

    const updated = await db.project.update({
      where: { id: req.params.id },
      data: { youtubeApiKeyEncrypted: JSON.stringify(existing) },
      select: PROJECT_KEY_SELECT,
    })
    res.json(buildKeyStatus(updated))
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// DELETE /api/projects/:id/keys/youtube/:idx — remove a YouTube key by index
projects.delete('/:id/keys/youtube/:idx', requireRole('owner', 'admin'), async (req, res) => {
  try {
    const idx = parseInt(req.params.idx, 10)
    const project = await db.project.findUnique({
      where: { id: req.params.id },
      select: { youtubeApiKeyEncrypted: true },
    })
    if (!project) return res.status(404).json({ error: 'Project not found' })

    const keys = parseYoutubeKeys(project.youtubeApiKeyEncrypted)
    if (idx < 0 || idx >= keys.length) return res.status(400).json({ error: 'Invalid index' })
    keys.splice(idx, 1)

    const updated = await db.project.update({
      where: { id: req.params.id },
      data: { youtubeApiKeyEncrypted: keys.length > 0 ? JSON.stringify(keys) : null },
      select: PROJECT_KEY_SELECT,
    })
    res.json(buildKeyStatus(updated))
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

projects.delete('/:id', requireRole('owner'), async (req, res) => {
  try {
    await db.project.delete({ where: { id: req.params.id } })
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// GET /api/projects/:id/usage?limit=50&cursor=<lastId>
// Returns paginated API usage records, newest first.
projects.get('/:id/usage', requireRole('owner', 'admin'), async (req, res) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit || '50', 10), 100)
    const cursor = req.query.cursor || null          // ID of the last item from previous page

    const rows = await db.apiUsage.findMany({
      where: { projectId: req.params.id },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,                               // fetch one extra to detect hasMore
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    })

    const hasMore = rows.length > limit
    const page    = hasMore ? rows.slice(0, limit) : rows
    const nextCursor = hasMore ? page[page.length - 1].id : null

    const shaped = page.map(r => ({
      id:     r.id,
      ts:     new Date(r.createdAt).toISOString(),
      api:    r.service,
      action: r.action || '—',
      tokens: r.tokensUsed,
      status: r.status,
      error:  r.error,
    }))

    res.json({ rows: shaped, nextCursor, hasMore })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// GET /api/projects/:id/news-stats — aggregated stats for news API providers
const NEWS_DAILY_LIMITS = { newsapi: 100, gnews: 100, guardian: 5000, nyt: 500 }
const NEWS_SERVICES = Object.keys(NEWS_DAILY_LIMITS)

projects.get('/:id/news-stats', requireRole('owner', 'admin'), async (req, res) => {
  try {
    const projectId = req.params.id
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    const [todayRows, allTimeRows] = await Promise.all([
      db.apiUsage.groupBy({
        by: ['service', 'status'],
        where: { projectId, service: { in: NEWS_SERVICES }, createdAt: { gte: todayStart } },
        _count: { id: true },
      }),
      db.apiUsage.groupBy({
        by: ['service', 'status'],
        where: { projectId, service: { in: NEWS_SERVICES } },
        _count: { id: true },
      }),
    ])

    const stats = {}
    for (const svc of NEWS_SERVICES) {
      const todayOk   = todayRows.find(r => r.service === svc && r.status === 'ok')?._count?.id || 0
      const todayFail = todayRows.find(r => r.service === svc && r.status === 'fail')?._count?.id || 0
      const allOk     = allTimeRows.find(r => r.service === svc && r.status === 'ok')?._count?.id || 0
      const allFail   = allTimeRows.find(r => r.service === svc && r.status === 'fail')?._count?.id || 0
      const todayTotal = todayOk + todayFail
      const allTotal   = allOk + allFail
      const limit = NEWS_DAILY_LIMITS[svc]

      stats[svc] = {
        today: todayTotal,
        todayOk,
        todayFail,
        allTime: allTotal,
        allTimeOk: allOk,
        allTimeFail: allFail,
        successRate: allTotal > 0 ? Math.round((allOk / allTotal) * 100) : null,
        dailyLimit: limit,
        remaining: Math.max(0, limit - todayTotal),
      }
    }

    res.json(stats)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

module.exports = { monitor, admin, projects }
