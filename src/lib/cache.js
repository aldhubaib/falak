/**
 * Simple in-memory TTL cache. Key → { value, expiresAt }.
 * Used for analytics (and optionally transcript) to reduce DB/API load.
 */
function createCache(ttlMs) {
  const store = new Map()
  return {
    get(key) {
      const entry = store.get(key)
      if (!entry || Date.now() > entry.expiresAt) {
        if (entry) store.delete(key)
        return undefined
      }
      return entry.value
    },
    set(key, value) {
      store.set(key, { value, expiresAt: Date.now() + ttlMs })
    },
    flush() {
      store.clear()
    },
  }
}

const ANALYTICS_TTL_MS = 5 * 60 * 1000 // 5 min
const TRANSCRIPT_TTL_MS = 2 * 60 * 60 * 1000 // 2 hours
const analyticsCache = createCache(ANALYTICS_TTL_MS)
const transcriptCache = createCache(TRANSCRIPT_TTL_MS)

module.exports = {
  createCache,
  analyticsCache,
  transcriptCache,
  ANALYTICS_TTL_MS,
  TRANSCRIPT_TTL_MS,
}
