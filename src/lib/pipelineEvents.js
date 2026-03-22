const { EventEmitter } = require('events')

const emitter = new EventEmitter()
emitter.setMaxListeners(200)

// Ring buffer of recent batch events for SSE clients that connect mid-cycle
const MAX_RECENT = 500
const recentEvents = []

function emitBatch(pipeline, event) {
  const entry = { ...event, pipeline, ts: Date.now() }
  recentEvents.push(entry)
  if (recentEvents.length > MAX_RECENT) recentEvents.shift()
  emitter.emit('batch', entry)
}

function getRecent(since = 0) {
  return recentEvents.filter(e => e.ts > since)
}

module.exports = { emitter, emitBatch, getRecent }
