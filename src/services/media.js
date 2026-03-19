const fs = require('fs')
const os = require('os')
const path = require('path')
const { pipeline } = require('stream/promises')
const { execFile } = require('child_process')
const { promisify } = require('util')
const sharp = require('sharp')
const exifReader = require('exif-reader')
const ffmpegPath = require('ffmpeg-static')
const ffprobePath = require('@ffprobe-installer/ffprobe').path
const { getSignedReadUrl, putObject, getPublicUrl } = require('./r2')

const execFileAsync = promisify(execFile)
const nodeFetch = require('node-fetch')

const THUMB_WIDTH = 480
const THUMB_QUALITY = 75
const MEDIA_FETCH_TIMEOUT_MS = 120_000

function fetchWithTimeout(url, opts = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs || MEDIA_FETCH_TIMEOUT_MS)
  return nodeFetch(url, { ...opts, signal: controller.signal }).finally(() => clearTimeout(timer))
}

function thumbnailKey(originalKey) {
  const base = originalKey.replace(/\.[^.]+$/, '')
  return `thumbs/${base}.jpg`
}

async function generateImageThumbnail(r2Key, inputBuffer) {
  if (!inputBuffer) {
    const signedUrl = await getSignedReadUrl(r2Key, 300)
    const res = await fetchWithTimeout(signedUrl)
    if (!res.ok) throw new Error(`Failed to download image: ${res.status}`)
    inputBuffer = Buffer.from(await res.arrayBuffer())
  }

  const thumbBuffer = await sharp(inputBuffer)
    .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
    .jpeg({ quality: THUMB_QUALITY, progressive: true })
    .toBuffer()

  const thumbKey = thumbnailKey(r2Key)
  const thumbUrl = await putObject(thumbKey, thumbBuffer, 'image/jpeg')
  return { thumbnailR2Key: thumbKey, thumbnailR2Url: thumbUrl }
}

async function generateVideoThumbnail(r2Key, videoPath) {
  const ownTmp = !videoPath
  let tmpDir
  if (ownTmp) {
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'falak-thumb-'))
    const ext = (r2Key.split('.').pop() || 'mp4').toLowerCase()
    videoPath = path.join(tmpDir, `input.${ext}`)
    const signedUrl = await getSignedReadUrl(r2Key, 600)
    const res = await fetchWithTimeout(signedUrl)
    if (!res.ok) throw new Error(`Failed to download video: ${res.status}`)
    await pipeline(res.body, fs.createWriteStream(videoPath))
  }

  const frameTmp = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'falak-frame-'))
  const framePath = path.join(frameTmp, 'frame.jpg')

  try {
    await execFileAsync(ffmpegPath, [
      '-i', videoPath,
      '-ss', '0.5',
      '-vframes', '1',
      '-vf', `scale=${THUMB_WIDTH}:-2`,
      '-q:v', '3',
      '-y',
      framePath,
    ], { timeout: 30_000 })

    const frameBuffer = await fs.promises.readFile(framePath)
    const thumbBuffer = await sharp(frameBuffer)
      .jpeg({ quality: THUMB_QUALITY, progressive: true })
      .toBuffer()

    const thumbKey = thumbnailKey(r2Key)
    const thumbUrl = await putObject(thumbKey, thumbBuffer, 'image/jpeg')
    return { thumbnailR2Key: thumbKey, thumbnailR2Url: thumbUrl }
  } finally {
    await fs.promises.rm(frameTmp, { recursive: true, force: true }).catch(() => {})
    if (ownTmp && tmpDir) await fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
  }
}

async function processImage(r2Key) {
  const signedUrl = await getSignedReadUrl(r2Key, 300)
  const res = await fetchWithTimeout(signedUrl)
  if (!res.ok) throw new Error(`Failed to download image: ${res.status}`)
  const buffer = Buffer.from(await res.arrayBuffer())

  const [thumbnail, metadata] = await Promise.all([
    generateImageThumbnail(r2Key, buffer).catch(e => { console.error('[media] image thumb failed:', e.message); return null }),
    extractImageMetadata(buffer).catch(e => { console.error('[media] image meta failed:', e.message); return null }),
  ])
  return { thumbnail, metadata }
}

async function processVideo(r2Key) {
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'falak-proc-'))
  const ext = (r2Key.split('.').pop() || 'mp4').toLowerCase()
  const videoPath = path.join(tmpDir, `input.${ext}`)

  try {
    const signedUrl = await getSignedReadUrl(r2Key, 600)
    const res = await fetchWithTimeout(signedUrl)
    if (!res.ok) throw new Error(`Failed to download video: ${res.status}`)
    await pipeline(res.body, fs.createWriteStream(videoPath))

    const [thumbnail, metadata] = await Promise.all([
      generateVideoThumbnail(r2Key, videoPath).catch(e => { console.error('[media] video thumb failed:', e.message); return null }),
      extractVideoMetadata(videoPath).catch(e => { console.error('[media] video meta failed:', e.message); return null }),
    ])
    return { thumbnail, metadata }
  } finally {
    await fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
  }
}

async function processMedia(r2Key, contentType) {
  const mime = String(contentType || '').toLowerCase()
  if (mime.startsWith('image/')) return processImage(r2Key)
  if (mime.startsWith('video/')) return processVideo(r2Key)
  return { thumbnail: null, metadata: null }
}

async function generateThumbnail(r2Key, contentType) {
  const mime = String(contentType || '').toLowerCase()
  if (mime.startsWith('image/')) return generateImageThumbnail(r2Key)
  if (mime.startsWith('video/')) return generateVideoThumbnail(r2Key)
  return null
}

// ── Metadata extraction ─────────────────────────────────────────────

function safe(fn) {
  try { return fn() } catch { return undefined }
}

function dmsToDecimal(dms, ref) {
  if (!Array.isArray(dms) || dms.length < 3) return undefined
  const [d, m, s] = dms
  const dec = d + m / 60 + s / 3600
  return (ref === 'S' || ref === 'W') ? -dec : dec
}

function parseGpsFromExif(gps) {
  if (!gps) return undefined
  const lat = dmsToDecimal(gps.GPSLatitude, gps.GPSLatitudeRef)
  const lng = dmsToDecimal(gps.GPSLongitude, gps.GPSLongitudeRef)
  if (lat == null || lng == null) return undefined
  const result = { latitude: Math.round(lat * 1e6) / 1e6, longitude: Math.round(lng * 1e6) / 1e6 }
  if (gps.GPSAltitude != null) result.altitude = Math.round(Number(gps.GPSAltitude) * 100) / 100
  if (gps.GPSImgDirection != null) result.direction = Math.round(Number(gps.GPSImgDirection) * 100) / 100
  return result
}

async function extractImageMetadata(buffer) {
  const meta = await sharp(buffer).metadata()
  const result = {
    width: meta.width || null,
    height: meta.height || null,
    format: meta.format || null,
    colorSpace: meta.space || null,
    density: meta.density || null,
    hasAlpha: meta.hasAlpha || false,
  }

  if (meta.exif) {
    try {
      const exif = exifReader(meta.exif)
      const img = exif.Image || exif.image || {}
      const photo = exif.Photo || exif.exif || {}
      const gpsData = exif.GPSInfo || exif.gps || {}

      result.dateTaken = safe(() => (photo.DateTimeOriginal || photo.DateTimeDigitized || img.DateTime)?.toISOString()) || null
      result.cameraMake = img.Make || null
      result.cameraModel = img.Model || null
      result.lens = photo.LensModel || null
      result.aperture = photo.FNumber != null ? `f/${photo.FNumber}` : null
      result.shutterSpeed = photo.ExposureTime != null
        ? (photo.ExposureTime < 1 ? `1/${Math.round(1 / photo.ExposureTime)}` : `${photo.ExposureTime}`)
        : null
      result.iso = photo.ISOSpeedRatings ?? photo.ISO ?? null
      result.focalLength = photo.FocalLength != null ? `${photo.FocalLength}mm` : null
      result.flash = photo.Flash != null ? (photo.Flash & 1 ? 'On' : 'Off') : null
      result.software = img.Software || null
      result.orientation = img.Orientation || null
      result.gps = parseGpsFromExif(gpsData)
    } catch (e) {
      console.warn('[media] EXIF parse failed:', e.message)
    }
  }

  return result
}

function parseGpsString(location) {
  if (!location || typeof location !== 'string') return undefined
  const m = location.match(/([+-][\d.]+)([+-][\d.]+)/)
  if (!m) return undefined
  return { latitude: parseFloat(m[1]), longitude: parseFloat(m[2]) }
}

async function extractVideoMetadata(filePath) {
  try {
    const { stdout } = await execFileAsync(ffprobePath, [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      filePath,
    ], { timeout: 15_000 })

    const probe = JSON.parse(stdout)
    const fmt = probe.format || {}
    const tags = fmt.tags || {}
    const videoStream = (probe.streams || []).find(s => s.codec_type === 'video') || {}
    const audioStream = (probe.streams || []).find(s => s.codec_type === 'audio')
    const vTags = videoStream.tags || {}

    const result = {
      width: videoStream.width || null,
      height: videoStream.height || null,
      codec: videoStream.codec_name || null,
      codecLong: videoStream.codec_long_name || null,
      frameRate: safe(() => {
        const parts = (videoStream.r_frame_rate || '').split('/')
        if (parts.length === 2 && Number(parts[1])) return Math.round((Number(parts[0]) / Number(parts[1])) * 100) / 100
        return null
      }),
      bitrate: fmt.bit_rate ? Math.round(Number(fmt.bit_rate) / 1000) : null,
      duration: fmt.duration ? Math.round(Number(fmt.duration) * 100) / 100 : null,
      audioCodec: audioStream?.codec_name || null,
      audioSampleRate: audioStream?.sample_rate ? Number(audioStream.sample_rate) : null,
      audioChannels: audioStream?.channels || null,
      dateCreated: tags.creation_time || vTags.creation_time || null,
      cameraMake: tags['com.apple.quicktime.make'] || tags.make || null,
      cameraModel: tags['com.apple.quicktime.model'] || tags.model || null,
      software: tags['com.apple.quicktime.software'] || tags.encoder || null,
      gps: parseGpsString(tags['com.apple.quicktime.location.ISO6709'] || tags.location || null),
    }

    return result
  } catch (e) {
    console.warn('[media] ffprobe failed:', e.message)
    return null
  }
}

async function extractMetadata(r2Key, contentType, opts = {}) {
  const mime = String(contentType || '').toLowerCase()

  if (mime.startsWith('image/')) {
    if (opts.buffer) return extractImageMetadata(opts.buffer)
    const signedUrl = await getSignedReadUrl(r2Key, 300)
    const res = await fetchWithTimeout(signedUrl)
    if (!res.ok) return null
    return extractImageMetadata(Buffer.from(await res.arrayBuffer()))
  }

  if (mime.startsWith('video/') && opts.filePath) {
    return extractVideoMetadata(opts.filePath)
  }

  if (mime.startsWith('video/')) {
    const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'falak-meta-'))
    const ext = (r2Key.split('.').pop() || 'mp4').toLowerCase()
    const videoPath = path.join(tmpDir, `input.${ext}`)
    try {
      const signedUrl = await getSignedReadUrl(r2Key, 600)
      const res = await fetchWithTimeout(signedUrl)
      if (!res.ok) return null
      await pipeline(res.body, fs.createWriteStream(videoPath))
      return await extractVideoMetadata(videoPath)
    } finally {
      await fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
    }
  }

  return null
}

module.exports = { generateThumbnail, thumbnailKey, extractMetadata, processMedia }
