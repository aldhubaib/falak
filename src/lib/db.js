const { PrismaClient } = require('@prisma/client')
const config = require('../config')
const { serialise } = require('./serialise')

const prisma = new PrismaClient({
  log: config.NODE_ENV === 'development' ? ['query', 'error'] : ['error'],
})

// Serialise all query results: BigInt → string so JSON responses never leak raw BigInt
prisma.$use(async (params, next) => {
  const result = await next(params)
  return serialise(result)
})

module.exports = prisma
