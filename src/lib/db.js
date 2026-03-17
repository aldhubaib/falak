const { PrismaClient } = require('@prisma/client')
const config = require('../config')
const { serialise } = require('./serialise')

const prisma = new PrismaClient({
  log: config.NODE_ENV === 'development' ? ['query', 'error'] : ['error'],
  datasources: {
    db: {
      url: appendPoolParams(config.DATABASE_URL),
    },
  },
})

function appendPoolParams(url) {
  if (!url) return url
  const sep = url.includes('?') ? '&' : '?'
  const params = []
  if (!url.includes('connection_limit')) params.push('connection_limit=10')
  if (!url.includes('pool_timeout')) params.push('pool_timeout=30')
  return params.length ? `${url}${sep}${params.join('&')}` : url
}

// Serialise all query results: BigInt → string so JSON responses never leak raw BigInt
prisma.$use(async (params, next) => {
  const result = await next(params)
  return serialise(result)
})

module.exports = prisma
