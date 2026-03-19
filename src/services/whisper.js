const fetch = require('node-fetch')
const FormData = require('form-data')
const db = require('../lib/db')
const { decrypt } = require('./crypto')
const { getSignedReadUrl } = require('./r2')
const { trackUsage } = require('./usageTracker')

const OPENAI_WHISPER_URL = 'https://api.openai.com/v1/audio/transcriptions'

/**
 * Transcribe a video stored in R2 using OpenAI Whisper.
 * Downloads the file from R2, extracts audio, sends to Whisper API.
 * Returns { text, segments, srt }.
 */
async function transcribeFromR2(r2Key, channelId) {
  if (!r2Key) throw new Error('No video file to transcribe')

  const keyRow = await db.apiKey.findFirst({
    where: { OR: [{ service: 'openai' }, { service: 'embedding' }] },
  })
  if (!keyRow?.encryptedKey) {
    throw new Error('OpenAI API key not configured. Add it in Settings → API Keys (service: openai or embedding).')
  }
  const apiKey = decrypt(keyRow.encryptedKey)
  const signedUrl = await getSignedReadUrl(r2Key, 600)

  const videoRes = await fetch(signedUrl)
  if (!videoRes.ok) throw new Error(`Failed to download video from R2: ${videoRes.status}`)
  const videoBuffer = await videoRes.buffer()

  const ext = (r2Key.split('.').pop() || 'mp4').toLowerCase()
  const mimeTypes = {
    mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
    m4a: 'audio/m4a', mp3: 'audio/mpeg', wav: 'audio/wav',
    avi: 'video/x-msvideo', mkv: 'video/x-matroska',
  }
  const contentType = mimeTypes[ext] || 'video/mp4'

  const form = new FormData()
  form.append('file', videoBuffer, { filename: `video.${ext}`, contentType })
  form.append('model', 'whisper-1')
  form.append('response_format', 'verbose_json')
  form.append('timestamp_granularities[]', 'segment')

  const res = await fetch(OPENAI_WHISPER_URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, ...form.getHeaders() },
    body: form,
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    trackUsage({ channelId, service: 'openai', action: 'whisper', status: 'fail', error: `${res.status}: ${body.slice(0, 200)}` })
    throw new Error(`Whisper API error ${res.status}: ${body.slice(0, 300)}`)
  }

  const data = await res.json()
  trackUsage({ channelId, service: 'openai', action: 'whisper', status: 'ok' })

  const segments = (data.segments || []).map(s => ({
    text: (s.text || '').trim(),
    start: s.start || 0,
    end: s.end || 0,
  }))

  const text = data.text || segments.map(s => s.text).join(' ')
  const srt = segmentsToSRT(segments)

  return { text, segments, srt }
}

function segmentsToSRT(segments) {
  const lines = []
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i]
    lines.push(String(i + 1))
    lines.push(`${fmtSRT(s.start)} --> ${fmtSRT(s.end)}`)
    lines.push(s.text)
    lines.push('')
  }
  return lines.join('\n')
}

function fmtSRT(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = Math.floor(totalSeconds % 60)
  const ms = Math.round((totalSeconds % 1) * 1000)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`
}

module.exports = { transcribeFromR2 }
