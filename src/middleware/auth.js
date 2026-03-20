const jwt = require('jsonwebtoken')
const config = require('../config')
const db  = require('../lib/db')
const { sessionCache } = require('../lib/cache')

async function requireAuth(req, res, next) {
  try {
    const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '')
    if (!token) return res.status(401).json({ error: 'Not authenticated' })

    jwt.verify(token, config.JWT_SECRET, { algorithms: ['HS256'] })

    const cached = sessionCache.get(token)
    if (cached) {
      if (cached.expiresAt < new Date()) {
        sessionCache.delete(token)
        return res.status(401).json({ error: 'Session expired' })
      }
      if (!cached.user.isActive) {
        return res.status(403).json({ error: 'Account disabled' })
      }
      req.user = cached.user
      return next()
    }

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

    sessionCache.set(token, { expiresAt: session.expiresAt, user: session.user })
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
