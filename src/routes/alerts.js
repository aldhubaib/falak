const express = require('express')
const router = express.Router()
const db = require('../lib/db')
const { requireRole } = require('../middleware/auth')

// ── GET /api/alerts?projectId=xxx&unreadOnly=true&limit=50
router.get('/', requireRole('owner', 'admin', 'editor', 'viewer'), async (req, res) => {
  try {
    const { projectId, unreadOnly, limit = '50' } = req.query
    if (!projectId) return res.status(400).json({ error: 'projectId required' })

    const where = { projectId }
    if (unreadOnly === 'true') where.isRead = false

    const alerts = await db.alert.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(100, parseInt(limit, 10) || 50),
    })

    const unreadCount = await db.alert.count({
      where: { projectId, isRead: false },
    })

    res.json({ alerts, unreadCount })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── POST /api/alerts/mark-read
router.post('/mark-read', requireRole('owner', 'admin', 'editor', 'viewer'), async (req, res) => {
  try {
    const { ids, projectId } = req.body
    if (Array.isArray(ids) && ids.length > 0) {
      await db.alert.updateMany({
        where: { id: { in: ids } },
        data: { isRead: true },
      })
    } else if (projectId) {
      await db.alert.updateMany({
        where: { projectId, isRead: false },
        data: { isRead: true },
      })
    }
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

module.exports = router
