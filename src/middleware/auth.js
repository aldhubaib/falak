const jwt = require('jsonwebtoken')
const config = require('../config')
const db  = require('../lib/db')

async function requireAuth(req, res, next) {
  try {
    const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '')
    if (!token) return res.status(401).json({ error: 'Not authenticated' })

    const payload = jwt.verify(token, config.JWT_SECRET)

    // Check session still exists in DB
    const session = await db.session.findUnique({
      where: { token },
      include: { user: true },
    })
    if (!session || session.expiresAt < new Date()) {
      return res.status(401).json({ error: 'Session expired' })
    }
    if (!session.user.isActive) {
      return res.status(403).json({ error: 'Account disabled' })
    }

    req.user = session.user
    next()
  } catch (e) {
    res.status(401).json({ error: 'Invalid token' })
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' })
    }
    next()
  }
}

module.exports = { requireAuth, requireRole }
