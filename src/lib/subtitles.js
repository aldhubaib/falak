/**
 * Convert timestamped script text to SRT subtitle format.
 *
 * Input format (each line starts with a timestamp):
 *   0:00 مقدمة — كيف يمكن أن يتحوّل...
 *   0:30 في مستشفى خاص بمدينة صغيرة
 *   1:15 بعد الوفاة السابعة بدأ التحقيق
 *
 * Output: SRT string ready for YouTube captions.insert
 */

function parseTimestamp(ts) {
  const parts = ts.split(':').map(Number)
  if (parts.length === 2) {
    const [min, sec] = parts
    return min * 60 + sec
  }
  if (parts.length === 3) {
    const [hr, min, sec] = parts
    return hr * 3600 + min * 60 + sec
  }
  return null
}

function secondsToSRT(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = Math.floor(totalSeconds % 60)
  const ms = Math.round((totalSeconds % 1) * 1000)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`
}

function scriptToSRT(scriptText, { defaultEndOffsetSec = 5 } = {}) {
  if (!scriptText || typeof scriptText !== 'string') return ''

  const timestampRegex = /^(\d{1,2}:\d{2}(?::\d{2})?)\s+(.+)$/
  const entries = []

  for (const line of scriptText.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const match = trimmed.match(timestampRegex)
    if (match) {
      const seconds = parseTimestamp(match[1])
      if (seconds !== null) {
        entries.push({ start: seconds, text: match[2].trim() })
      }
    } else if (entries.length > 0) {
      entries[entries.length - 1].text += ' ' + trimmed
    }
  }

  if (entries.length === 0) return ''

  const srtLines = []
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]
    const nextStart = i < entries.length - 1 ? entries[i + 1].start : entry.start + defaultEndOffsetSec
    const endTime = Math.max(nextStart, entry.start + 1)

    srtLines.push(String(i + 1))
    srtLines.push(`${secondsToSRT(entry.start)} --> ${secondsToSRT(endTime)}`)
    srtLines.push(entry.text)
    srtLines.push('')
  }

  return srtLines.join('\n')
}

module.exports = { scriptToSRT, parseTimestamp, secondsToSRT }
