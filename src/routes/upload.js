const express = require('express')
const { requireAuth, requireRole } = require('../middleware/auth')
const { initMultipartUpload, getPartPresignedUrls, completeMultipartUpload, abortMultipartUpload, deleteObject, CHUNK_SIZE, getPublicUrl } = require('../services/r2')
const db = require('../lib/db')
const { v4: uuidv4 } = require('uuid')

const router = express.Router()
router.use(requireAuth)

// POST /api/upload/init — start a multipart upload, return presigned URLs for each chunk
router.post('/init', requireRole('owner', 'admin', 'editor'), async (req, res) => {
  try {
    const { fileName, fileSize, contentType, storyId } = req.body
    if (!fileName || !fileSize || !contentType) {
      return res.status(400).json({ error: 'fileName, fileSize, and contentType are required' })
    }
    if (storyId) {
      const story = await db.story.findUnique({ where: { id: storyId } })
      if (!story) return res.status(404).json({ error: 'Story not found' })
    }

    const ext = fileName.split('.').pop() || 'mp4'
    const key = `videos/${storyId || 'general'}/${uuidv4()}.${ext}`
    const totalParts = Math.ceil(fileSize / CHUNK_SIZE)

    const uploadId = await initMultipartUpload(key, contentType)
    const presignedUrls = await getPartPresignedUrls(key, uploadId, totalParts)

    res.json({
      uploadId,
      key,
      chunkSize: CHUNK_SIZE,
      totalParts,
      presignedUrls,
    })
  } catch (e) {
    console.error('[upload/init]', e)
    res.status(500).json({ error: e.message || 'Failed to init upload' })
  }
})

// POST /api/upload/complete — finalize multipart upload, save to story brief
router.post('/complete', requireRole('owner', 'admin', 'editor'), async (req, res) => {
  try {
    const { uploadId, key, parts, storyId, fileName, fileSize } = req.body
    if (!uploadId || !key || !parts) {
      return res.status(400).json({ error: 'uploadId, key, and parts are required' })
    }

    const publicUrl = await completeMultipartUpload(key, uploadId, parts)

    if (storyId) {
      const story = await db.story.findUnique({ where: { id: storyId } })
      if (story) {
        const brief = (story.brief && typeof story.brief === 'object') ? { ...story.brief } : {}

        // Delete previous video from R2 if replacing
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

    res.json({ url: publicUrl, key })
  } catch (e) {
    console.error('[upload/complete]', e)
    res.status(500).json({ error: e.message || 'Failed to complete upload' })
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
