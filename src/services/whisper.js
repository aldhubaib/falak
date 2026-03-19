const fs = require('fs')
const os = require('os')
const path = require('path')
const { pipeline } = require('stream/promises')
const { execFile } = require('child_process')
const { promisify } = require('util')
const fetch = require('node-fetch')
const FormData = require('form-data')
const db = require('../lib/db')
const { decrypt } = require('./crypto')
const { getSignedReadUrl } = require('./r2')
const { trackUsage } = require('./usageTracker')

const execFileAsync = promisify(execFile)

const OPENAI_WHISPER_URL = 'https://api.openai.com/v1/audio/transcriptions'
const MAX_WHISPER_BYTES = 24 * 1024 * 1024 // 24 MB safety margin under 25 MB limit

async function transcribeFromR2(r2Key, channelId) {
  if (!r2Key) throw new Error('No video file to transcribe')

  const keyRow = await db.apiKey.findFirst({
    where: { OR: [{ service: 'openai' }, { service: 'embedding' }] },
  })
  if (!keyRow?.encryptedKey) {
    throw new Error('OpenAI API key not configured. Add it in Settings → API Keys (service: openai or embedding).')
  }
  const apiKey = decrypt(keyRow.encryptedKey)

  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'falak-whisper-'))
  const ext = (r2Key.split('.').pop() || 'mp4').toLowerCase()
  const videoPath = path.join(tmpDir, `input.${ext}`)
  const audioPath = path.join(tmpDir, 'audio.mp3')

  try {
    const signedUrl = await getSignedReadUrl(r2Key, 600)

    const videoRes = await fetch(signedUrl)
    if (!videoRes.ok) throw new Error(`Failed to download video from R2: ${videoRes.status}`)
    await pipeline(videoRes.body, fs.createWriteStream(videoPath))

    await execFileAsync('ffmpeg', [
      '-i', videoPath,
      '-vn',                 // drop video
      '-ac', '1',            // mono
      '-ar', '16000',        // 16 kHz (Whisper's native rate)
      '-b:a', '64k',         // 64 kbps — keeps files small
      '-f', 'mp3',
      '-y',
      audioPath,
    ], { timeout: 300_000 }) // 5 min timeout

    const audioStat = await fs.promises.stat(audioPath)
    if (audioStat.size === 0) throw new Error('ffmpeg produced empty audio — video may have no audio track')

    let allSegments = []
    let allText = ''

    if (audioStat.size <= MAX_WHISPER_BYTES) {
      const result = await callWhisper(apiKey, audioPath, channelId)
      allSegments = result.segments
      allText = result.text
    } else {
      const durationSec = await getAudioDuration(audioPath)
      const chunkDuration = Math.floor((durationSec * MAX_WHISPER_BYTES) / audioStat.size)
      const chunks = await splitAudio(audioPath, tmpDir, chunkDuration)

      let offsetSec = 0
      for (const chunk of chunks) {
        const result = await callWhisper(apiKey, chunk.path, channelId)
        for (const seg of result.segments) {
          allSegments.push({
            text: seg.text,
            start: seg.start + offsetSec,
            end: seg.end + offsetSec,
          })
        }
        allText += (allText ? ' ' : '') + result.text
        offsetSec += chunk.duration
      }
    }

    const srt = segmentsToSRT(allSegments)
    return { text: allText, segments: allSegments, srt }
  } finally {
    fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
  }
}

async function callWhisper(apiKey, filePath, channelId) {
  const form = new FormData()
  form.append('file', fs.createReadStream(filePath), {
    filename: 'audio.mp3',
    contentType: 'audio/mpeg',
  })
  form.append('model', 'whisper-1')
  form.append('language', 'ar')
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
  return { text, segments }
}

async function getAudioDuration(filePath) {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    filePath,
  ])
  return parseFloat(stdout.trim()) || 0
}

async function splitAudio(audioPath, tmpDir, chunkDurationSec) {
  const totalDuration = await getAudioDuration(audioPath)
  const chunks = []
  let start = 0
  let idx = 0

  while (start < totalDuration) {
    const chunkPath = path.join(tmpDir, `chunk_${idx}.mp3`)
    const duration = Math.min(chunkDurationSec, totalDuration - start)

    await execFileAsync('ffmpeg', [
      '-i', audioPath,
      '-ss', String(start),
      '-t', String(duration),
      '-acodec', 'copy',
      '-y',
      chunkPath,
    ], { timeout: 120_000 })

    chunks.push({ path: chunkPath, duration })
    start += chunkDurationSec
    idx++
  }

  return chunks
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
