const fs = require('fs')
const os = require('os')
const path = require('path')
const { pipeline } = require('stream/promises')
const { execFile } = require('child_process')
const { promisify } = require('util')
const sharp = require('sharp')
const ffmpegPath = require('ffmpeg-static')
const { getSignedReadUrl, putObject, getPublicUrl } = require('./r2')

const execFileAsync = promisify(execFile)

const THUMB_WIDTH = 480
const THUMB_QUALITY = 75

function thumbnailKey(originalKey) {
  const base = originalKey.replace(/\.[^.]+$/, '')
  return `thumbs/${base}.jpg`
}

async function generateImageThumbnail(r2Key) {
  const signedUrl = await getSignedReadUrl(r2Key, 300)
  const res = await fetch(signedUrl)
  if (!res.ok) throw new Error(`Failed to download image: ${res.status}`)

  const inputBuffer = Buffer.from(await res.arrayBuffer())
  const thumbBuffer = await sharp(inputBuffer)
    .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
    .jpeg({ quality: THUMB_QUALITY, progressive: true })
    .toBuffer()

  const thumbKey = thumbnailKey(r2Key)
  const thumbUrl = await putObject(thumbKey, thumbBuffer, 'image/jpeg')
  return { thumbnailR2Key: thumbKey, thumbnailR2Url: thumbUrl }
}

async function generateVideoThumbnail(r2Key) {
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'falak-thumb-'))
  const ext = (r2Key.split('.').pop() || 'mp4').toLowerCase()
  const videoPath = path.join(tmpDir, `input.${ext}`)
  const framePath = path.join(tmpDir, 'frame.jpg')

  try {
    const signedUrl = await getSignedReadUrl(r2Key, 600)
    const res = await fetch(signedUrl)
    if (!res.ok) throw new Error(`Failed to download video: ${res.status}`)
    await pipeline(res.body, fs.createWriteStream(videoPath))

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
    await fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
  }
}

async function generateThumbnail(r2Key, contentType) {
  const mime = String(contentType || '').toLowerCase()
  if (mime.startsWith('image/')) return generateImageThumbnail(r2Key)
  if (mime.startsWith('video/')) return generateVideoThumbnail(r2Key)
  return null
}

module.exports = { generateThumbnail, thumbnailKey }
