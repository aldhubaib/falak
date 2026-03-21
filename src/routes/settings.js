const express = require('express')
const db = require('../lib/db')
const { requireAuth, requireRole } = require('../middleware/auth')
const { encrypt, decrypt } = require('../services/crypto')
const registry = require('../lib/serviceRegistry')
const { unblockReady } = require('../lib/pipelinePreflight')
const router = express.Router()
router.use(requireAuth)

// GET /api/settings — return all key metadata (no actual keys)
router.get('/', requireRole('owner', 'admin'), async (req, res) => {
  try {
    const [keys, youtubeKeys, googleSearchKeys] = await Promise.all([
      db.apiKey.findMany({ orderBy: { service: 'asc' } }),
      db.youtubeApiKey.findMany({
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        select: { id: true, label: true, isActive: true, lastUsedAt: true, usageCount: true, sortOrder: true }
      }),
      db.googleSearchKey.findMany({
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        select: { id: true, label: true, isActive: true, lastUsedAt: true, usageCount: true, sortOrder: true }
      }),
    ])
    res.json({
      keys: keys.map(k => ({
        id: k.id, service: k.service, hasKey: !!k.encryptedKey,
        isActive: k.isActive, usageCount: k.usageCount, lastUsedAt: k.lastUsedAt,
        quotaUsed: k.quotaUsed, quotaLimit: k.quotaLimit
      })),
      youtubeKeys: youtubeKeys.map(k => ({
        id: k.id, label: k.label, isActive: k.isActive,
        usageCount: k.usageCount, lastUsedAt: k.lastUsedAt, sortOrder: k.sortOrder
      })),
      googleSearchKeys: googleSearchKeys.map(k => ({
        id: k.id, label: k.label, isActive: k.isActive,
        usageCount: k.usageCount, lastUsedAt: k.lastUsedAt, sortOrder: k.sortOrder
      })),
    })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// POST /api/settings/keys — save or update an API key
router.post('/keys', requireRole('owner', 'admin'), async (req, res) => {
  try {
    const { service, key } = req.body
    if (!service || !key) return res.status(400).json({ error: 'service and key required' })
    const encryptedKey = encrypt(key)
    const result = await db.apiKey.upsert({
      where: { service },
      create: { service, encryptedKey, isActive: true },
      update: { encryptedKey, isActive: true }
    })
    registry.invalidateHealth(service)
    registry.markUp(service)
    unblockReady().catch(() => {})
    res.json({ ok: true, service: result.service })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// DELETE /api/settings/keys/:service — clear a key
router.delete('/keys/:service', requireRole('owner', 'admin'), async (req, res) => {
  try {
    await db.apiKey.update({
      where: { service: req.params.service },
      data: { encryptedKey: '', isActive: false }
    })
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── YouTube keys (multiple for quota rotation) ─────────────────
router.get('/youtube-keys', requireRole('owner', 'admin'), async (req, res) => {
  try {
    const list = await db.youtubeApiKey.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, label: true, isActive: true, lastUsedAt: true, usageCount: true }
    })
    res.json(list)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.post('/youtube-keys', requireRole('owner', 'admin'), async (req, res) => {
  try {
    const { key, label } = req.body
    if (!key) return res.status(400).json({ error: 'key required' })
    const count = await db.youtubeApiKey.count()
    const row = await db.youtubeApiKey.create({
      data: {
        encryptedKey: encrypt(key),
        label: (label && String(label).trim()) || `Key ${count + 1}`,
        isActive: true,
        sortOrder: count
      }
    })
    registry.invalidateHealth('youtube')
    registry.markUp('youtube')
    unblockReady().catch(() => {})
    res.json({ id: row.id, label: row.label, isActive: row.isActive })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.delete('/youtube-keys/:id', requireRole('owner', 'admin'), async (req, res) => {
  try {
    await db.youtubeApiKey.delete({ where: { id: req.params.id } })
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.patch('/youtube-keys/:id', requireRole('owner', 'admin'), async (req, res) => {
  try {
    const { isActive, label } = req.body
    const data = {}
    if (typeof isActive === 'boolean') data.isActive = isActive
    if (typeof label === 'string') data.label = label.trim() || undefined
    const row = await db.youtubeApiKey.update({
      where: { id: req.params.id },
      data
    })
    res.json({ id: row.id, label: row.label, isActive: row.isActive })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── Google Search keys (multiple for quota rotation) ─────────────
router.get('/google-search-keys', requireRole('owner', 'admin'), async (req, res) => {
  try {
    const list = await db.googleSearchKey.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, label: true, isActive: true, lastUsedAt: true, usageCount: true }
    })
    res.json(list)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.post('/google-search-keys', requireRole('owner', 'admin'), async (req, res) => {
  try {
    const { key, label } = req.body
    if (!key) return res.status(400).json({ error: 'key required' })
    const count = await db.googleSearchKey.count()
    const row = await db.googleSearchKey.create({
      data: {
        encryptedKey: encrypt(key),
        label: (label && String(label).trim()) || `Key ${count + 1}`,
        isActive: true,
        sortOrder: count
      }
    })
    registry.invalidateHealth('google_search')
    registry.markUp('google_search')
    unblockReady().catch(() => {})
    res.json({ id: row.id, label: row.label, isActive: row.isActive })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.delete('/google-search-keys/:id', requireRole('owner', 'admin'), async (req, res) => {
  try {
    await db.googleSearchKey.delete({ where: { id: req.params.id } })
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.patch('/google-search-keys/:id', requireRole('owner', 'admin'), async (req, res) => {
  try {
    const { isActive, label } = req.body
    const data = {}
    if (typeof isActive === 'boolean') data.isActive = isActive
    if (typeof label === 'string') data.label = label.trim() || undefined
    const row = await db.googleSearchKey.update({
      where: { id: req.params.id },
      data
    })
    res.json({ id: row.id, label: row.label, isActive: row.isActive })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── Embedding API key (global via ApiKey table) ──────
router.post('/embedding-key', requireRole('owner', 'admin'), async (req, res) => {
  try {
    const { key } = req.body
    if (!key) return res.status(400).json({ error: 'key required' })
    await db.apiKey.upsert({
      where: { service: 'embedding' },
      create: { service: 'embedding', encryptedKey: encrypt(key), isActive: true },
      update: { encryptedKey: encrypt(key), isActive: true },
    })
    registry.invalidateHealth('embedding')
    registry.markUp('embedding')
    unblockReady().catch(() => {})
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.delete('/embedding-key', requireRole('owner', 'admin'), async (req, res) => {
  try {
    await db.apiKey.update({
      where: { service: 'embedding' },
      data: { encryptedKey: '', isActive: false },
    })
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── Check if embedding key is configured ────────
router.get('/embedding-status', requireRole('owner', 'admin'), async (req, res) => {
  try {
    const { channelId } = req.query
    if (!channelId) return res.status(400).json({ error: 'channelId required' })
    const [embeddingKey, channel, profile] = await Promise.all([
      db.apiKey.findUnique({ where: { service: 'embedding' } }),
      db.channel.findUnique({
        where: { id: channelId },
        select: { lastStatsRefreshAt: true, rescoreIntervalHours: true },
      }),
      db.scoreProfile.findUnique({
        where: { channelId },
        select: {
          totalOutcomes: true, totalDecisions: true,
          aiViralAccuracy: true, channelAvgViews: true, lastLearnedAt: true,
        },
      }).catch(() => null),
    ])
    res.json({
      hasEmbeddingKey: !!embeddingKey?.encryptedKey,
      lastStatsRefreshAt: channel?.lastStatsRefreshAt,
      rescoreIntervalHours: channel?.rescoreIntervalHours ?? 24,
      scoreProfile: profile,
    })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── GET /api/settings/service-health — live health of all registered services ──
router.get('/service-health', requireRole('owner', 'admin'), async (req, res) => {
  try {
    registry.autoDiscover()
    const statuses = await registry.checkAllHealth()
    const [blockedVideos, blockedArticles] = await Promise.all([
      db.pipelineItem.count({ where: { status: 'blocked' } }),
      db.article.count({ where: { status: 'blocked' } }),
    ])
    res.json({ services: statuses, blockedVideos, blockedArticles })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── POST /api/settings/unblock — manually trigger unblock sweep ─────────
router.post('/unblock', requireRole('owner', 'admin'), async (req, res) => {
  try {
    registry.invalidateAllHealth()
    await unblockReady()
    const [blockedVideos, blockedArticles] = await Promise.all([
      db.pipelineItem.count({ where: { status: 'blocked' } }),
      db.article.count({ where: { status: 'blocked' } }),
    ])
    res.json({ ok: true, blockedVideos, blockedArticles })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── POST /api/settings/test-key — lightweight test for any API key ──────
router.post('/test-key', requireRole('owner', 'admin'), async (req, res) => {
  const { service, keyId } = req.body
  if (!service) return res.status(400).json({ error: 'service required' })

  try {
    let apiKey

    if (service === 'youtube') {
      const row = keyId
        ? await db.youtubeApiKey.findUnique({ where: { id: keyId } })
        : await db.youtubeApiKey.findFirst({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } })
      if (!row?.encryptedKey) return res.json({ ok: false, error: 'No active YouTube key found' })
      apiKey = decrypt(row.encryptedKey)
    } else if (service === 'google_search') {
      const row = keyId
        ? await db.googleSearchKey.findUnique({ where: { id: keyId } })
        : await db.googleSearchKey.findFirst({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } })
      if (!row?.encryptedKey) return res.json({ ok: false, error: 'No active Google Search key found' })
      apiKey = decrypt(row.encryptedKey)
    } else {
      const row = await db.apiKey.findUnique({ where: { service } })
      if (!row?.encryptedKey) return res.json({ ok: false, error: `No key set for ${service}` })
      apiKey = decrypt(row.encryptedKey)
    }

    const result = await testServiceKey(service, apiKey)
    res.json(result)
  } catch (e) {
    res.json({ ok: false, error: e.message || 'Test failed' })
  }
})

async function testServiceKey(service, apiKey) {
  const start = Date.now()

  switch (service) {
    case 'anthropic': {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 5,
          messages: [{ role: 'user', content: 'Say "ok"' }],
        }),
      })
      const data = await r.json()
      if (!r.ok) return { ok: false, error: data.error?.message || `HTTP ${r.status}`, ms: Date.now() - start }
      return { ok: true, detail: `Model: ${data.model}`, ms: Date.now() - start }
    }

    case 'embedding': {
      const r = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'text-embedding-3-small', input: 'test', dimensions: 16 }),
      })
      const data = await r.json()
      if (!r.ok) return { ok: false, error: data.error?.message || `HTTP ${r.status}`, ms: Date.now() - start }
      return { ok: true, detail: `${data.data?.[0]?.embedding?.length || '?'}-dim embedding`, ms: Date.now() - start }
    }

    case 'youtube': {
      const r = await fetch(`https://www.googleapis.com/youtube/v3/channels?part=id&mine=false&id=UC_x5XG1OV2P6uZZ5FSM9Ttw&key=${apiKey}`)
      const data = await r.json()
      if (data.error) return { ok: false, error: data.error.message || `HTTP ${r.status}`, ms: Date.now() - start }
      return { ok: true, detail: `${data.items?.length || 0} channel(s) returned`, ms: Date.now() - start }
    }

    case 'transcript': {
      const r = await fetch('https://www.youtube-transcript.io/api/transcript?url=https://www.youtube.com/watch?v=dQw4w9WgXcQ', {
        headers: { Authorization: `Bearer ${apiKey}` },
      })
      if (r.status === 401 || r.status === 403) return { ok: false, error: 'Invalid or expired key', ms: Date.now() - start }
      return { ok: true, detail: `HTTP ${r.status}`, ms: Date.now() - start }
    }

    case 'google_search': {
      const r = await fetch(`https://serpapi.com/search.json?engine=google_images_light&q=test&api_key=${apiKey}`)
      const data = await r.json()
      if (data.error) return { ok: false, error: data.error, ms: Date.now() - start }
      const count = data.images_results?.length || 0
      return { ok: true, detail: `${count} image results`, ms: Date.now() - start }
    }

    case 'firecrawl': {
      const r = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'https://example.com', formats: ['markdown'], onlyMainContent: true }),
      })
      const data = await r.json()
      if (!r.ok && !data.success) return { ok: false, error: data.error || `HTTP ${r.status}`, ms: Date.now() - start }
      return { ok: true, detail: `${data.data?.markdown?.length || 0} chars scraped`, ms: Date.now() - start }
    }

    case 'perplexity': {
      const r = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'sonar',
          messages: [{ role: 'user', content: 'Say ok' }],
          max_tokens: 5,
        }),
      })
      const data = await r.json()
      if (!r.ok) return { ok: false, error: data.error?.message || `HTTP ${r.status}`, ms: Date.now() - start }
      return { ok: true, detail: `Model: ${data.model || 'sonar'}`, ms: Date.now() - start }
    }

    default:
      return { ok: false, error: `No test available for "${service}"` }
  }
}

module.exports = router
