const fetch = require('node-fetch')
const db = require('../lib/db')
const { decrypt } = require('./crypto')
const { transcriptCache } = require('../lib/cache')
const { trackUsage } = require('./usageTracker')

const YT_TRANSCRIPT_IO_URL = 'https://www.youtube-transcript.io/api/transcripts'
const MAX_RETRIES = 4
const RETRY_DELAY_MS = 2000
const FETCH_TIMEOUT_MS = 30_000

/**
 * Fetch transcript via youtube-transcript.io only.
 * Uses the global yt-transcript API key from the ApiKey table.
 * @param {string} youtubeVideoId - YouTube video ID (11 chars)
 * @param {string} channelId - Channel ID for usage tracking
 * @returns {Promise<Array|string|''>}
 *   - Array of {text, start, duration} segments when the API returns segment-level data
 *   - Plain string when only raw transcript text is available (fallback)
 *   - Empty string '' when the video has no transcript
 */
async function fetchTranscript(youtubeVideoId, channelId) {
  if (!youtubeVideoId || youtubeVideoId.length < 11) {
    throw new Error('Invalid YouTube video ID')
  }
  const id = youtubeVideoId.length === 11 ? youtubeVideoId : youtubeVideoId.slice(-11)
  const cached = transcriptCache.get(id)
  if (cached !== undefined) return cached

  const keyRow = await db.apiKey.findUnique({ where: { service: 'yt-transcript' } })
  if (!keyRow?.encryptedKey) {
    throw new Error('YouTube Transcript API key not configured. Go to Settings and add it.')
  }
  const token = decrypt(keyRow.encryptedKey)
  let lastErr
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const text = await fetchFromYoutubeTranscriptIo(id, token)
      const result = text !== null ? text : ''
      transcriptCache.set(id, result)
      trackUsage({ channelId, service: 'yttranscript', action: 'transcribe', status: 'ok' })
      return result
    } catch (e) {
      lastErr = e
      const isRetryable = e.retryable === true || e.status === 429 || (e.status >= 500 && e.status < 600)
      if (attempt < MAX_RETRIES && isRetryable) {
        const waitMs = e.retryAfterMs != null ? e.retryAfterMs : RETRY_DELAY_MS * Math.pow(2, attempt)
        await sleep(waitMs)
        continue
      }
      trackUsage({ channelId, service: 'yttranscript', action: 'transcribe', status: 'fail', error: e.message })
      throw e
    }
  }
  trackUsage({ channelId, service: 'yttranscript', action: 'transcribe', status: 'fail', error: lastErr?.message })
  throw lastErr
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Call youtube-transcript.io API (uses your account tokens).
 * @see https://www.youtube-transcript.io/api
 */
async function fetchFromYoutubeTranscriptIo(videoId, apiToken) {
  const auth = 'Basic ' + apiToken
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  let res
  try {
    res = await fetch(YT_TRANSCRIPT_IO_URL, {
      method: 'POST',
      headers: {
        'Authorization': auth,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ ids: [videoId] }),
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timer)
  }
  if (!res.ok) {
    const retryAfter = res.headers.get('Retry-After')
    const retryAfterMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : null
    let body = ''
    try { body = (await res.text()).slice(0, 500) } catch (_) {}
    console.error(`[transcript] youtube-transcript.io ${res.status} for ${videoId}:`, body || '(empty body)')
    let message
    if (res.status === 401) {
      message = `youtube-transcript.io 401 Unauthorized — check the API key in Settings. Body: ${body}`
    } else if (res.status === 429) {
      message = `youtube-transcript.io 429 rate limit — Retry-After: ${retryAfter ?? 'not set'}. Will retry.`
    } else {
      message = `youtube-transcript.io ${res.status}: ${body || '(no body)'}`
    }
    const err = new Error(message)
    err.status = res.status
    err.retryable = res.status === 429 || res.status >= 500
    if (retryAfterMs) err.retryAfterMs = retryAfterMs
    throw err
  }
  const data = await res.json()
  const list = Array.isArray(data) ? data : (data.transcripts || data.data || [])
  const one = list.find(t => (t.id || t.video_id) === videoId) || list[0]
  if (!one) return null

  // Prefer segment-level data — keeps timestamps for frontend rendering.
  if (Array.isArray(one.segments) && one.segments.length > 0) {
    return one.segments
      .filter(s => s.text && String(s.text).trim())
      .map(s => ({
        text: String(s.text).trim(),
        start: typeof s.start === 'number' ? s.start : (s.offset != null ? Number(s.offset) : 0),
        duration: typeof s.duration === 'number' ? s.duration : 0,
      }))
  }

  // Fallback: plain text transcript with no timing data.
  const text = one.transcript ?? one.text ?? null
  return text ? String(text).replace(/\s+/g, ' ').trim() : null
}

module.exports = { fetchTranscript }
