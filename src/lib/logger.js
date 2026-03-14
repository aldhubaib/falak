/**
 * Structured logger (Pino). Use in app and worker; logs JSON with level, timestamp, message, requestId when in request context.
 */
const pino = require('pino')
const config = require('../config')

const logger = pino({
  level: config.NODE_ENV === 'production' ? 'info' : 'debug',
})

module.exports = logger
