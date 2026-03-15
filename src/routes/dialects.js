const express = require('express')
const db = require('../lib/db')
const { requireAuth } = require('../middleware/auth')
const { asyncWrap } = require('../middleware/errors')

const router = express.Router()
router.use(requireAuth)

const DEFAULT_ENGINE = 'claude'

// GET /api/dialects?engine=claude — list all dialects for an engine
router.get('/', asyncWrap(async (req, res) => {
  const engine = req.query.engine || DEFAULT_ENGINE
  const dialects = await db.dialect.findMany({
    where: { engine },
    orderBy: { countryCode: 'asc' },
    select: { id: true, countryCode: true, name: true, short: true, long: true },
  })
  res.json({ dialects })
}))

// GET /api/dialects/:countryCode?engine=claude — get dialect for a country (for channel nationality)
router.get('/:countryCode', asyncWrap(async (req, res) => {
  const countryCode = (req.params.countryCode || '').toUpperCase()
  const engine = req.query.engine || DEFAULT_ENGINE
  const dialect = await db.dialect.findUnique({
    where: { countryCode_engine: { countryCode, engine } },
    select: { id: true, countryCode: true, name: true, short: true, long: true },
  })
  if (!dialect) return res.status(404).json({ error: 'Dialect not found for this country/engine' })
  res.json(dialect)
}))

module.exports = router
