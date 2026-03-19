const { PrismaClient } = require('@prisma/client')
const config = require('../config')
const logger = require('./logger')

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
  if (!url.includes('connection_limit')) params.push('connection_limit=20')
  if (!url.includes('pool_timeout')) params.push('pool_timeout=60')
  return params.length ? `${url}${sep}${params.join('&')}` : url
}

prisma.$on?.('error', (e) => {
  logger.error({ prismaError: e }, 'Prisma client error')
})

module.exports = prisma
