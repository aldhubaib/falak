const express = require('express')
const router = express.Router()
const db = require('../lib/db')
const { requireAuth, requireRole } = require('../middleware/auth')

router.use(requireAuth)

// ── GET /api/alerts?channelId=xxx&unreadOnly=true&limit=50
router.get('/', requireRole('owner', 'admin', 'editor', 'viewer'), async (req, res) => {
  try {
    const { channelId, unreadOnly, limit = '50' } = req.query
    if (!channelId) return res.status(400).json({ error: 'channelId required' })

    const where = { channelId }
    if (unreadOnly === 'true') where.isRead = false

    const alerts = await db.alert.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(100, parseInt(limit, 10) || 50),
    })

    const unreadCount = await db.alert.count({
      where: { channelId, isRead: false },
    })

    res.json({ alerts, unreadCount })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── POST /api/alerts/mark-read
router.post('/mark-read', requireRole('owner', 'admin', 'editor', 'viewer'), async (req, res) => {
  try {
    const { ids, channelId } = req.body
    if (Array.isArray(ids) && ids.length > 0) {
      await db.alert.updateMany({
        where: { id: { in: ids } },
        data: { isRead: true },
      })
    } else if (channelId) {
      await db.alert.updateMany({
        where: { channelId, isRead: false },
        data: { isRead: true },
      })
    }
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

module.exports = router
