/**
 * In-memory TTL cache with max-size eviction and periodic sweep.
 * Key → { value, expiresAt }.
 */
function createCache(ttlMs, maxSize = 500) {
  const store = new Map()
  let sweepTimer = null

  function evictExpired() {
    const now = Date.now()
    for (const [k, entry] of store) {
      if (now > entry.expiresAt) store.delete(k)
    }
  }

  if (typeof setInterval !== 'undefined') {
    sweepTimer = setInterval(evictExpired, Math.min(ttlMs, 5 * 60 * 1000))
    if (sweepTimer.unref) sweepTimer.unref()
  }

  return {
    get(key) {
      const entry = store.get(key)
      if (!entry || Date.now() > entry.expiresAt) {
        if (entry) store.delete(key)
        return undefined
      }
      store.delete(key)
      store.set(key, entry)
      return entry.value
    },
    set(key, value) {
      if (store.size >= maxSize) {
        const oldest = store.keys().next().value
        store.delete(oldest)
      }
      store.set(key, { value, expiresAt: Date.now() + ttlMs })
    },
    flush() {
      store.clear()
    },
    get size() {
      return store.size
    },
  }
}

const ANALYTICS_TTL_MS = 5 * 60 * 1000
const TRANSCRIPT_TTL_MS = 2 * 60 * 60 * 1000
const AUTH_SESSION_TTL_MS = 60 * 1000
const analyticsCache = createCache(ANALYTICS_TTL_MS, 50)
const transcriptCache = createCache(TRANSCRIPT_TTL_MS, 200)
const sessionCache = createCache(AUTH_SESSION_TTL_MS, 100)

module.exports = {
  createCache,
  analyticsCache,
  transcriptCache,
  sessionCache,
  ANALYTICS_TTL_MS,
  TRANSCRIPT_TTL_MS,
  AUTH_SESSION_TTL_MS,
}
