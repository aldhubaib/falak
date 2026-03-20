const crypto = require('crypto')
const config = require('../config')

const logger = require('../lib/logger')
const ALGORITHM = 'aes-256-gcm'

if (!config.ENCRYPTION_KEY) {
  if (config.NODE_ENV === 'production') {
    throw new Error('[crypto] ENCRYPTION_KEY must be set in production. All stored API keys would be decryptable with the fallback key.')
  }
  logger.warn('[crypto] ENCRYPTION_KEY is not set — using insecure fallback. Set ENCRYPTION_KEY in production!')
}
const KEY = Buffer.from(config.ENCRYPTION_KEY || 'dev_only_insecure_fallback_key!!', 'utf8').slice(0, 32)

function encrypt(text) {
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv)
  let encrypted = cipher.update(text, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  const tag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`
}

function decrypt(payload) {
  if (!payload || typeof payload !== 'string' || payload.split(':').length !== 3) {
    throw new Error('Invalid encrypted payload format')
  }
  const [ivHex, tagHex, encrypted] = payload.split(':')
  const iv = Buffer.from(ivHex, 'hex')
  const tag = Buffer.from(tagHex, 'hex')
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv)
  decipher.setAuthTag(tag)
  let decrypted = decipher.update(encrypted, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}

module.exports = { encrypt, decrypt }
