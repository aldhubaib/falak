/**
 * Central config: read process.env once, validate required vars, export frozen object.
 * Fail fast at startup if anything required is missing.
 */

const required = [
  'DATABASE_URL',
  'JWT_SECRET',
  'APP_URL',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
]

const optional = {
  REDIS_URL: null,
  NODE_ENV: 'development',
  OWNER_EMAIL: null,
  ANTHROPIC_API_KEY: null,
  ENCRYPTION_KEY: null,
}

function load() {
  const missing = required.filter((key) => !process.env[key] || String(process.env[key]).trim() === '')
  if (missing.length) {
    throw new Error(`Missing required env: ${missing.join(', ')}. Set them before starting the server.`)
  }

  const config = {
    DATABASE_URL: process.env.DATABASE_URL,
    JWT_SECRET: process.env.JWT_SECRET,
    APP_URL: String(process.env.APP_URL).replace(/\/+$/, ''),
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  }
  config.PORT = parseInt(process.env.PORT, 10) || 3000

  for (const [key, defaultVal] of Object.entries(optional)) {
    config[key] = process.env[key] != null && String(process.env[key]).trim() !== '' ? process.env[key] : defaultVal
  }

  return Object.freeze(config)
}

const config = load()
module.exports = config
