const express = require('express')
const { requireAuth, requireRole } = require('../middleware/auth')
const { initMultipartUpload, getPartPresignedUrls, getSpecificPartUrls, completeMultipartUpload, abortMultipartUpload, deleteObject, getChunkSize, getDirectUploadUrl, getPublicUrl, getSignedReadUrl } = require('../services/r2')
const db = require('../lib/db')
const { v4: uuidv4 } = require('uuid')

const router = express.Router()
router.use(express.json({ limit: '2mb' }))
router.use(requireAuth)

function toFiniteNumber(value) {
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

// POST /api/upload/init — start an upload, return presigned URLs
router.post('/init', requireRole('owner', 'admin', 'editor'), async (req, res) => {
  try {
    const { fileName, fileSize, contentType, storyId, galleryChannelId } = req.body
    if (!fileName || !fileSize || !contentType) {
      return res.status(400).json({ error: 'fileName, fileSize, and contentType are required' })
    }
    if (storyId && galleryChannelId) {
      return res.status(400).json({ error: 'Provide either storyId or galleryChannelId, not both' })
    }
    if (storyId) {
      const story = await db.story.findUnique({ where: { id: storyId } })
      if (!story) return res.status(404).json({ error: 'Story not found' })
    }
    if (galleryChannelId) {
      const channel = await db.channel.findUnique({ where: { id: galleryChannelId }, select: { id: true } })
      if (!channel) return res.status(404).json({ error: 'Channel not found' })
    }

    const ext = fileName.split('.').pop() || 'mp4'
    const key = galleryChannelId
      ? `gallery/${galleryChannelId}/${uuidv4()}.${ext}`
      : `videos/${storyId || 'general'}/${uuidv4()}.${ext}`

    const chunkSize = getChunkSize(fileSize)
    const totalParts = Math.ceil(fileSize / chunkSize)

    if (totalParts <= 1) {
      const presignedUrl = await getDirectUploadUrl(key, contentType)
      return res.json({ mode: 'direct', key, presignedUrl, contentType, chunkSize: fileSize, totalParts: 1 })
    }

    const uploadId = await initMultipartUpload(key, contentType)
    const presignedUrls = await getPartPresignedUrls(key, uploadId, totalParts)

    res.json({ mode: 'multipart', uploadId, key, chunkSize, totalParts, presignedUrls })
  } catch (e) {
    console.error('[upload/init]', e)
    res.status(500).json({ error: e.message || 'Failed to init upload' })
  }
})

// POST /api/upload/resume — get fresh presigned URLs for remaining parts of an existing multipart upload
router.post('/resume', requireRole('owner', 'admin', 'editor'), async (req, res) => {
  try {
    const { uploadId, key, partNumbers } = req.body
    if (!uploadId || !key || !Array.isArray(partNumbers) || partNumbers.length === 0) {
      return res.status(400).json({ error: 'uploadId, key, and partNumbers[] are required' })
    }
    const presignedUrls = await getSpecificPartUrls(key, uploadId, partNumbers)
    res.json({ presignedUrls })
  } catch (e) {
    console.error('[upload/resume]', e)
    res.status(500).json({ error: e.message || 'Failed to resume upload' })
  }
})

// POST /api/upload/complete — finalize upload, save to story brief or gallery
router.post('/complete', requireRole('owner', 'admin', 'editor'), async (req, res) => {
  try {
    const { uploadId, key, parts, mode, storyId, galleryChannelId, albumId, fileName, fileSize, contentType, width, height, duration, thumbnailR2Key, thumbnailR2Url } = req.body
    if (!key) {
      return res.status(400).json({ error: 'key is required' })
    }
    if (mode !== 'direct' && (!uploadId || !parts)) {
      return res.status(400).json({ error: 'uploadId and parts are required for multipart uploads' })
    }
    if (storyId && galleryChannelId) {
      return res.status(400).json({ error: 'Provide either storyId or galleryChannelId, not both' })
    }

    let publicUrl
    if (mode === 'direct') {
      publicUrl = getPublicUrl(key)
    } else {
      publicUrl = await completeMultipartUpload(key, uploadId, parts)
    }

    if (storyId) {
      const story = await db.story.findUnique({ where: { id: storyId } })
      if (story) {
        const brief = (story.brief && typeof story.brief === 'object') ? { ...story.brief } : {}

        if (brief.videoR2Key && brief.videoR2Key !== key) {
          deleteObject(brief.videoR2Key).catch(() => {})
        }

        brief.videoR2Key = key
        brief.videoR2Url = publicUrl
        brief.videoFileName = fileName || null
        brief.videoFileSize = fileSize || null

        await db.story.update({
          where: { id: storyId },
          data: { brief },
        })
      }
    }

    let createdMedia = null
    if (galleryChannelId) {
      const channel = await db.channel.findUnique({ where: { id: galleryChannelId }, select: { id: true } })
      if (!channel) return res.status(404).json({ error: 'Channel not found' })

      let validAlbumId = null
      if (albumId) {
        const album = await db.galleryAlbum.findFirst({ where: { id: albumId, channelId: galleryChannelId }, select: { id: true } })
        if (!album) return res.status(404).json({ error: 'Album not found' })
        validAlbumId = album.id
      }

      const mime = String(contentType || '').trim() || 'application/octet-stream'
      const mediaType = mime.startsWith('video/') ? 'VIDEO' : 'PHOTO'
      createdMedia = await db.galleryMedia.create({
        data: {
          channelId: galleryChannelId,
          albumId: validAlbumId,
          type: mediaType,
          fileName: fileName || key.split('/').pop() || 'upload',
          fileSize: fileSize ? BigInt(fileSize) : BigInt(0),
          mimeType: mime,
          width: toFiniteNumber(width) != null ? Math.round(Number(width)) : null,
          height: toFiniteNumber(height) != null ? Math.round(Number(height)) : null,
          duration: toFiniteNumber(duration),
          r2Key: key,
          r2Url: publicUrl,
          thumbnailR2Key: thumbnailR2Key || null,
          thumbnailR2Url: thumbnailR2Url || null,
          uploadedById: req.user.id,
        },
      })
    }

    res.json({ url: publicUrl, key, media: createdMedia })
  } catch (e) {
    console.error('[upload/complete]', e)
    res.status(500).json({ error: e.message || 'Failed to complete upload' })
  }
})

// GET /api/upload/signed-url/:key(*) — get a temporary signed URL to read a private R2 object
router.get('/signed-url/:key(*)', async (req, res) => {
  try {
    const { key } = req.params
    if (!key) return res.status(400).json({ error: 'key is required' })
    const url = await getSignedReadUrl(key, 3600)
    res.json({ url })
  } catch (e) {
    console.error('[upload/signed-url]', e)
    res.status(500).json({ error: e.message || 'Failed to generate signed URL' })
  }
})

// POST /api/upload/abort — cancel a multipart upload
router.post('/abort', requireRole('owner', 'admin', 'editor'), async (req, res) => {
  try {
    const { uploadId, key } = req.body
    if (!uploadId || !key) {
      return res.status(400).json({ error: 'uploadId and key are required' })
    }
    await abortMultipartUpload(key, uploadId)
    res.json({ ok: true })
  } catch (e) {
    console.error('[upload/abort]', e)
    res.status(500).json({ error: e.message || 'Failed to abort upload' })
  }
})

module.exports = router
