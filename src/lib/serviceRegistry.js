/**
 * Service Registry — single source of truth for external service health and API keys.
 *
 * Each service file exports a SERVICE_DESCRIPTOR; the registry auto-discovers them
 * at startup. Workers call `preflight(stage)` before running a stage, and
 * `classifyHttpError(service, res, body)` to convert HTTP failures into typed errors.
 *
 * Health status is cached in-memory with a 5-minute TTL (single Railway process).
 */
const path = require('path')
const fs = require('fs')
const db = require('./db')
const { decrypt } = require('../services/crypto')
const logger = require('./logger')
const {
  ServiceKeyMissingError,
  ServiceKeyInvalidError,
  ServiceQuotaExhaustedError,
  ServiceTransientError,
} = require('./serviceErrors')

const HEALTH_TTL_MS = 5 * 60 * 1000

// ── Internal state ───────────────────────────────────────────────────────────
const services = new Map()
const healthCache = new Map()

// ── Registration ─────────────────────────────────────────────────────────────

function register(descriptor) {
  if (!descriptor || !descriptor.name) return
  services.set(descriptor.name, descriptor)
}

/**
 * Scan src/services/*.js for SERVICE_DESCRIPTOR exports and register them.
 * Safe to call multiple times (idempotent).
 */
function autoDiscover() {
  const dir = path.join(__dirname, '..', 'services')
  let files
  try { files = fs.readdirSync(dir).filter(f => f.endsWith('.js')) } catch { return }
  for (const file of files) {
    try {
      const mod = require(path.join(dir, file))
      if (mod.SERVICE_DESCRIPTOR) register(mod.SERVICE_DESCRIPTOR)
    } catch (_) { /* skip files that fail to load */ }
  }
}

function getDescriptor(serviceName) {
  return services.get(serviceName) || null
}

function getAllDescriptors() {
  return [...services.values()]
}

// ── Key retrieval ────────────────────────────────────────────────────────────

/**
 * Retrieve and decrypt the API key for a service. Returns null if unavailable.
 */
async function getKey(serviceName) {
  const desc = services.get(serviceName)
  if (!desc) return null

  try {
    if (desc.keySource === 'apiKey') {
      const row = await db.apiKey.findUnique({ where: { service: serviceName } })
      if (!row?.encryptedKey || !row.isActive) return null
      return decrypt(row.encryptedKey)
    }

    if (desc.keySource === 'youtubeApiKey') {
      const keys = await db.youtubeApiKey.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
      })
      if (!keys.length) return null
      const entry = keys[Math.floor(Math.random() * keys.length)]
      return decrypt(entry.encryptedKey)
    }

    if (desc.keySource === 'googleSearchKey') {
      const keys = await db.googleSearchKey.findMany({
        where: { isActive: true },
        orderBy: [
          { lastUsedAt: { sort: 'asc', nulls: 'first' } },
          { sortOrder: 'asc' },
        ],
      })
      if (!keys.length) return null
      return decrypt(keys[0].encryptedKey)
    }

    if (desc.keySource === 'env') {
      const config = require('../config')
      return desc.envKeys?.every(k => config[k]) ? '__env_configured__' : null
    }
  } catch (e) {
    logger.warn({ service: serviceName, error: e.message }, '[registry] key retrieval failed')
  }
  return null
}

/**
 * Retrieve key or throw ServiceKeyMissingError. For use in required service calls.
 */
async function requireKey(serviceName) {
  const key = await getKey(serviceName)
  if (!key) {
    const desc = services.get(serviceName)
    throw new ServiceKeyMissingError(serviceName, desc?.displayName)
  }
  return key
}

/**
 * Check if a service has a valid key configured (quick boolean check).
 */
async function hasKey(serviceName) {
  return (await getKey(serviceName)) !== null
}

// ── Health cache ─────────────────────────────────────────────────────────────

function getCachedHealth(serviceName) {
  const cached = healthCache.get(serviceName)
  if (!cached) return null
  if (Date.now() - cached.checkedAt > HEALTH_TTL_MS) return null
  return cached
}

/**
 * Mark a service as down. Called when an HTTP call returns a non-retryable error.
 * Immediately poisons the health cache so other items avoid the same failure.
 */
function markDown(serviceName, code, errorMessage) {
  healthCache.set(serviceName, {
    status: code === 'KEY_MISSING' ? 'no_key'
      : code === 'KEY_INVALID' ? 'invalid_key'
      : code === 'QUOTA_EXHAUSTED' ? 'no_balance'
      : 'down',
    error: errorMessage,
    checkedAt: Date.now(),
  })
  logger.warn({ service: serviceName, code, error: errorMessage }, '[registry] service marked down')
}

/**
 * Mark a service as healthy. Called after a successful API call or key save.
 */
function markUp(serviceName) {
  healthCache.set(serviceName, {
    status: 'healthy',
    error: null,
    checkedAt: Date.now(),
  })
}

/**
 * Check health of a single service (cache-first, then key presence).
 */
async function checkHealth(serviceName) {
  const cached = getCachedHealth(serviceName)
  if (cached) return cached

  const key = await getKey(serviceName)
  const status = key ? 'healthy' : 'no_key'
  const entry = { status, error: key ? null : 'No API key configured', checkedAt: Date.now() }
  healthCache.set(serviceName, entry)
  return entry
}

/**
 * Check health of all registered services.
 */
async function checkAllHealth() {
  const results = []
  for (const desc of services.values()) {
    const health = await checkHealth(desc.name)
    results.push({
      service: desc.name,
      displayName: desc.displayName,
      status: health.status,
      error: health.error,
      checkedAt: new Date(health.checkedAt).toISOString(),
    })
  }
  return results
}

/**
 * Invalidate the health cache for a service (e.g. when a key is saved).
 */
function invalidateHealth(serviceName) {
  healthCache.delete(serviceName)
}

function invalidateAllHealth() {
  healthCache.clear()
}

// ── HTTP error classification ────────────────────────────────────────────────

/**
 * Classify an HTTP error response into a typed ServiceError.
 * Called from service wrappers after a non-2xx response.
 *
 * @param {string} serviceName - registry service name
 * @param {number} status - HTTP status code
 * @param {string} body - response body text (or parsed message)
 * @param {object} [headers] - response headers (for Retry-After)
 * @returns {import('./serviceErrors').ServiceError}
 */
function classifyHttpError(serviceName, status, body, headers) {
  const msg = typeof body === 'string' ? body : JSON.stringify(body)
  const lowerMsg = msg.toLowerCase()

  // 401 / 403 → key invalid or revoked
  if (status === 401 || status === 403) {
    if (lowerMsg.includes('quota') || lowerMsg.includes('quotaexceeded')) {
      return new ServiceQuotaExhaustedError(serviceName, msg)
    }
    return new ServiceKeyInvalidError(serviceName, msg)
  }

  // 402 → payment required / balance exhausted
  if (status === 402) {
    return new ServiceQuotaExhaustedError(serviceName, msg)
  }

  // 429 → could be rate limit (transient) or quota exhaustion (permanent)
  if (status === 429) {
    const retryAfter = headers?.get?.('retry-after') ?? headers?.['retry-after']
    const hasQuotaKeywords = lowerMsg.includes('quota') ||
      lowerMsg.includes('credit balance') ||
      lowerMsg.includes('insufficient') ||
      lowerMsg.includes('exceeded your current quota') ||
      lowerMsg.includes('run out of') ||
      lowerMsg.includes('billing')
    if (hasQuotaKeywords) {
      return new ServiceQuotaExhaustedError(serviceName, msg)
    }
    // Has Retry-After → genuine rate limit (transient)
    if (retryAfter) {
      return new ServiceTransientError(serviceName, `Rate limited (Retry-After: ${retryAfter})`)
    }
    // No Retry-After, no quota keywords → treat as transient (benefit of the doubt)
    return new ServiceTransientError(serviceName, `Rate limited (429, no Retry-After)`)
  }

  // 400 with specific balance/credit messages
  if (status === 400) {
    if (lowerMsg.includes('credit balance') || lowerMsg.includes('insufficient')) {
      return new ServiceQuotaExhaustedError(serviceName, msg)
    }
  }

  // 5xx → transient
  if (status >= 500) {
    return new ServiceTransientError(serviceName, `HTTP ${status}: ${msg.slice(0, 200)}`)
  }

  // Default: transient (let the worker decide via retries)
  return new ServiceTransientError(serviceName, `HTTP ${status}: ${msg.slice(0, 200)}`)
}

module.exports = {
  register,
  autoDiscover,
  getDescriptor,
  getAllDescriptors,
  getKey,
  requireKey,
  hasKey,
  checkHealth,
  checkAllHealth,
  markDown,
  markUp,
  invalidateHealth,
  invalidateAllHealth,
  classifyHttpError,
  getCachedHealth,
}
