const express = require('express')
const db = require('../lib/db')
const { requireAuth, requireRole } = require('../middleware/auth')
const { encrypt } = require('../services/crypto')
const router = express.Router()
router.use(requireAuth)

// GET /api/settings — return all key metadata (no actual keys)
router.get('/', requireRole('owner', 'admin'), async (req, res) => {
  try {
    const keys = await db.apiKey.findMany({ orderBy: { service: 'asc' } })
    const youtubeKeys = await db.youtubeApiKey.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, label: true, isActive: true, lastUsedAt: true, usageCount: true, sortOrder: true }
    })
    res.json({
      keys: keys.map(k => ({
        id: k.id, service: k.service, hasKey: !!k.encryptedKey,
        isActive: k.isActive, usageCount: k.usageCount, lastUsedAt: k.lastUsedAt,
        quotaUsed: k.quotaUsed, quotaLimit: k.quotaLimit
      })),
      youtubeKeys: youtubeKeys.map(k => ({
        id: k.id, label: k.label, isActive: k.isActive,
        usageCount: k.usageCount, lastUsedAt: k.lastUsedAt, sortOrder: k.sortOrder
      }))
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

// ── Embedding API key (stored on Project for vector intelligence) ──────
router.post('/embedding-key', requireRole('owner', 'admin'), async (req, res) => {
  try {
    const { projectId, key } = req.body
    if (!projectId || !key) return res.status(400).json({ error: 'projectId and key required' })
    await db.project.update({
      where: { id: projectId },
      data: { embeddingApiKeyEncrypted: encrypt(key) },
    })
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.delete('/embedding-key', requireRole('owner', 'admin'), async (req, res) => {
  try {
    const { projectId } = req.body
    if (!projectId) return res.status(400).json({ error: 'projectId required' })
    await db.project.update({
      where: { id: projectId },
      data: { embeddingApiKeyEncrypted: null },
    })
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── Check if embedding key is configured for a project ────────
router.get('/embedding-status', requireRole('owner', 'admin'), async (req, res) => {
  try {
    const { projectId } = req.query
    if (!projectId) return res.status(400).json({ error: 'projectId required' })
    const project = await db.project.findUnique({
      where: { id: projectId },
      select: { embeddingApiKeyEncrypted: true, lastStatsRefreshAt: true, rescoreIntervalHours: true },
    })
    const profile = await db.scoreProfile.findUnique({
      where: { projectId },
      select: {
        totalOutcomes: true, totalDecisions: true,
        aiViralAccuracy: true, channelAvgViews: true, lastLearnedAt: true,
      },
    }).catch(() => null)
    res.json({
      hasEmbeddingKey: !!project?.embeddingApiKeyEncrypted,
      lastStatsRefreshAt: project?.lastStatsRefreshAt,
      rescoreIntervalHours: project?.rescoreIntervalHours ?? 24,
      scoreProfile: profile,
    })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

module.exports = router
