const express = require('express')
const db = require('../lib/db')
const { requireAuth, requireRole } = require('../middleware/auth')
const { deleteObject, getSignedReadUrl } = require('../services/r2')

const router = express.Router()
router.use(requireAuth)

function parsePagination(req) {
  const page = Math.max(1, Number.parseInt(String(req.query.page || '1'), 10) || 1)
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(String(req.query.pageSize || '30'), 10) || 30))
  return { page, pageSize, skip: (page - 1) * pageSize }
}

async function ensureChannel(channelId) {
  const channel = await db.channel.findUnique({ where: { id: channelId }, select: { id: true } })
  return Boolean(channel)
}

function normalizeMediaType(value) {
  if (!value) return null
  const upper = String(value).toUpperCase()
  if (upper === 'PHOTO' || upper === 'VIDEO') return upper
  return null
}

function toFiniteNumber(value) {
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

// GET /api/gallery/:channelId
router.get('/:channelId', async (req, res) => {
  try {
    const { channelId } = req.params
    if (!(await ensureChannel(channelId))) return res.status(404).json({ error: 'Channel not found' })

    const { page, pageSize, skip } = parsePagination(req)
    const type = normalizeMediaType(req.query.type)
    const albumId = req.query.albumId ? String(req.query.albumId) : null
    const q = req.query.q ? String(req.query.q).trim() : ''
    const sortBy = String(req.query.sortBy || 'createdAt')
    const sortOrder = String(req.query.sortOrder || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc'

    const where = {
      channelId,
      ...(type ? { type } : {}),
      ...(albumId === 'none' ? { albumId: null } : albumId ? { albumId } : {}),
      ...(q
        ? {
            OR: [
              { fileName: { contains: q, mode: 'insensitive' } },
              { mimeType: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    }

    const orderBy = sortBy === 'fileName'
      ? { fileName: sortOrder }
      : sortBy === 'fileSize'
      ? { fileSize: sortOrder }
      : { createdAt: sortOrder }

    const [items, total] = await Promise.all([
      db.galleryMedia.findMany({
        where,
        include: {
          album: { select: { id: true, name: true } },
          uploadedBy: { select: { id: true, name: true, email: true } },
        },
        orderBy,
        skip,
        take: pageSize,
      }),
      db.galleryMedia.count({ where }),
    ])

    res.json({
      items,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    })
  } catch (e) {
    console.error('[gallery/list]', e)
    res.status(500).json({ error: e.message || 'Failed to list gallery media' })
  }
})

// POST /api/gallery/:channelId
router.post('/:channelId', requireRole('owner', 'admin', 'editor'), async (req, res) => {
  try {
    const { channelId } = req.params
    if (!(await ensureChannel(channelId))) return res.status(404).json({ error: 'Channel not found' })

    const {
      albumId,
      type,
      fileName,
      fileSize,
      mimeType,
      width,
      height,
      duration,
      r2Key,
      r2Url,
      thumbnailR2Key,
      thumbnailR2Url,
    } = req.body

    const normalizedType = normalizeMediaType(type)
    if (!normalizedType || !fileName || !fileSize || !mimeType || !r2Key || !r2Url) {
      return res.status(400).json({ error: 'type, fileName, fileSize, mimeType, r2Key, and r2Url are required' })
    }

    if (albumId) {
      const album = await db.galleryAlbum.findFirst({ where: { id: albumId, channelId }, select: { id: true } })
      if (!album) return res.status(404).json({ error: 'Album not found' })
    }

    const created = await db.galleryMedia.create({
      data: {
        channelId,
        albumId: albumId || null,
        type: normalizedType,
        fileName,
        fileSize: BigInt(fileSize),
        mimeType,
        width: toFiniteNumber(width) != null ? Math.round(Number(width)) : null,
        height: toFiniteNumber(height) != null ? Math.round(Number(height)) : null,
        duration: toFiniteNumber(duration),
        r2Key,
        r2Url,
        thumbnailR2Key: thumbnailR2Key || null,
        thumbnailR2Url: thumbnailR2Url || null,
        uploadedById: req.user.id,
      },
      include: {
        album: { select: { id: true, name: true } },
        uploadedBy: { select: { id: true, name: true, email: true } },
      },
    })

    res.status(201).json(created)
  } catch (e) {
    console.error('[gallery/create]', e)
    res.status(500).json({ error: e.message || 'Failed to create gallery media' })
  }
})

// POST /api/gallery/:channelId/bulk-delete
router.post('/:channelId/bulk-delete', requireRole('owner', 'admin', 'editor'), async (req, res) => {
  try {
    const { channelId } = req.params
    if (!(await ensureChannel(channelId))) return res.status(404).json({ error: 'Channel not found' })
    const mediaIds = Array.isArray(req.body?.mediaIds) ? req.body.mediaIds.filter(Boolean) : []
    if (mediaIds.length === 0) return res.status(400).json({ error: 'mediaIds is required' })

    const items = await db.galleryMedia.findMany({
      where: { channelId, id: { in: mediaIds } },
      select: { id: true, r2Key: true, thumbnailR2Key: true },
    })

    await db.$transaction([
      db.galleryAlbum.updateMany({
        where: { channelId, coverMediaId: { in: items.map((item) => item.id) } },
        data: { coverMediaId: null },
      }),
      db.galleryMedia.deleteMany({ where: { channelId, id: { in: mediaIds } } }),
    ])

    await Promise.allSettled(
      items.flatMap((item) => [item.r2Key, item.thumbnailR2Key].filter(Boolean).map((key) => deleteObject(key)))
    )

    res.json({ ok: true, deleted: items.length })
  } catch (e) {
    console.error('[gallery/bulk-delete]', e)
    res.status(500).json({ error: e.message || 'Failed to bulk delete media' })
  }
})

// Album routes
router.get('/:channelId/albums', async (req, res) => {
  try {
    const { channelId } = req.params
    if (!(await ensureChannel(channelId))) return res.status(404).json({ error: 'Channel not found' })

    const albums = await db.galleryAlbum.findMany({
      where: { channelId },
      include: {
        coverMedia: { select: { id: true, r2Url: true, thumbnailR2Url: true, type: true } },
        _count: { select: { media: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
    res.json(albums)
  } catch (e) {
    console.error('[gallery/albums-list]', e)
    res.status(500).json({ error: e.message || 'Failed to list albums' })
  }
})

router.post('/:channelId/albums', requireRole('owner', 'admin', 'editor'), async (req, res) => {
  try {
    const { channelId } = req.params
    const { name, description } = req.body
    if (!(await ensureChannel(channelId))) return res.status(404).json({ error: 'Channel not found' })
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'name is required' })

    const created = await db.galleryAlbum.create({
      data: {
        channelId,
        name: String(name).trim(),
        description: description ? String(description) : null,
        createdById: req.user.id,
      },
      include: { _count: { select: { media: true } } },
    })
    res.status(201).json(created)
  } catch (e) {
    console.error('[gallery/albums-create]', e)
    res.status(500).json({ error: e.message || 'Failed to create album' })
  }
})

router.get('/:channelId/albums/:albumId', async (req, res) => {
  try {
    const { channelId, albumId } = req.params
    const album = await db.galleryAlbum.findFirst({
      where: { id: albumId, channelId },
      include: {
        coverMedia: { select: { id: true, r2Url: true, thumbnailR2Url: true, type: true } },
        media: {
          include: {
            uploadedBy: { select: { id: true, name: true, email: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
        _count: { select: { media: true } },
      },
    })
    if (!album) return res.status(404).json({ error: 'Album not found' })
    res.json(album)
  } catch (e) {
    console.error('[gallery/albums-get]', e)
    res.status(500).json({ error: e.message || 'Failed to get album' })
  }
})

router.patch('/:channelId/albums/:albumId', requireRole('owner', 'admin', 'editor'), async (req, res) => {
  try {
    const { channelId, albumId } = req.params
    const { name, description, coverMediaId } = req.body
    const existing = await db.galleryAlbum.findFirst({ where: { id: albumId, channelId }, select: { id: true } })
    if (!existing) return res.status(404).json({ error: 'Album not found' })

    if (coverMediaId) {
      const cover = await db.galleryMedia.findFirst({ where: { id: coverMediaId, channelId }, select: { id: true } })
      if (!cover) return res.status(404).json({ error: 'Cover media not found' })
    }

    const updated = await db.galleryAlbum.update({
      where: { id: albumId },
      data: {
        name: name !== undefined ? String(name).trim() : undefined,
        description: description !== undefined ? (description ? String(description) : null) : undefined,
        coverMediaId: coverMediaId !== undefined ? (coverMediaId || null) : undefined,
      },
      include: { _count: { select: { media: true } } },
    })
    res.json(updated)
  } catch (e) {
    console.error('[gallery/albums-patch]', e)
    res.status(500).json({ error: e.message || 'Failed to update album' })
  }
})

router.delete('/:channelId/albums/:albumId', requireRole('owner', 'admin', 'editor'), async (req, res) => {
  try {
    const { channelId, albumId } = req.params
    const existing = await db.galleryAlbum.findFirst({ where: { id: albumId, channelId }, select: { id: true } })
    if (!existing) return res.status(404).json({ error: 'Album not found' })

    await db.$transaction([
      db.galleryMedia.updateMany({ where: { channelId, albumId }, data: { albumId: null } }),
      db.galleryAlbum.delete({ where: { id: albumId } }),
    ])
    res.json({ ok: true })
  } catch (e) {
    console.error('[gallery/albums-delete]', e)
    res.status(500).json({ error: e.message || 'Failed to delete album' })
  }
})

router.post('/:channelId/albums/:albumId/add', requireRole('owner', 'admin', 'editor'), async (req, res) => {
  try {
    const { channelId, albumId } = req.params
    const mediaIds = Array.isArray(req.body?.mediaIds) ? req.body.mediaIds.filter(Boolean) : []
    if (mediaIds.length === 0) return res.status(400).json({ error: 'mediaIds is required' })

    const existing = await db.galleryAlbum.findFirst({ where: { id: albumId, channelId }, select: { id: true } })
    if (!existing) return res.status(404).json({ error: 'Album not found' })

    const result = await db.galleryMedia.updateMany({
      where: { channelId, id: { in: mediaIds } },
      data: { albumId },
    })
    res.json({ ok: true, updated: result.count })
  } catch (e) {
    console.error('[gallery/albums-add]', e)
    res.status(500).json({ error: e.message || 'Failed to add media to album' })
  }
})

router.post('/:channelId/albums/:albumId/remove', requireRole('owner', 'admin', 'editor'), async (req, res) => {
  try {
    const { channelId, albumId } = req.params
    const mediaIds = Array.isArray(req.body?.mediaIds) ? req.body.mediaIds.filter(Boolean) : []
    if (mediaIds.length === 0) return res.status(400).json({ error: 'mediaIds is required' })

    const result = await db.galleryMedia.updateMany({
      where: { channelId, albumId, id: { in: mediaIds } },
      data: { albumId: null },
    })
    res.json({ ok: true, updated: result.count })
  } catch (e) {
    console.error('[gallery/albums-remove]', e)
    res.status(500).json({ error: e.message || 'Failed to remove media from album' })
  }
})

// Item routes must be after album routes
router.get('/:channelId/:mediaId', async (req, res) => {
  try {
    const { channelId, mediaId } = req.params
    const item = await db.galleryMedia.findFirst({
      where: { id: mediaId, channelId },
      include: {
        album: { select: { id: true, name: true } },
        uploadedBy: { select: { id: true, name: true, email: true } },
      },
    })
    if (!item) return res.status(404).json({ error: 'Media not found' })
    res.json(item)
  } catch (e) {
    console.error('[gallery/get-one]', e)
    res.status(500).json({ error: e.message || 'Failed to get media details' })
  }
})

router.patch('/:channelId/:mediaId', requireRole('owner', 'admin', 'editor'), async (req, res) => {
  try {
    const { channelId, mediaId } = req.params
    const { fileName, albumId } = req.body
    const existing = await db.galleryMedia.findFirst({ where: { id: mediaId, channelId }, select: { id: true } })
    if (!existing) return res.status(404).json({ error: 'Media not found' })

    if (albumId) {
      const album = await db.galleryAlbum.findFirst({ where: { id: albumId, channelId }, select: { id: true } })
      if (!album) return res.status(404).json({ error: 'Album not found' })
    }

    const updated = await db.galleryMedia.update({
      where: { id: mediaId },
      data: {
        fileName: fileName !== undefined ? String(fileName) : undefined,
        albumId: albumId !== undefined ? (albumId || null) : undefined,
      },
      include: {
        album: { select: { id: true, name: true } },
        uploadedBy: { select: { id: true, name: true, email: true } },
      },
    })
    res.json(updated)
  } catch (e) {
    console.error('[gallery/patch]', e)
    res.status(500).json({ error: e.message || 'Failed to update media' })
  }
})

router.get('/:channelId/:mediaId/download', async (req, res) => {
  try {
    const { channelId, mediaId } = req.params
    const item = await db.galleryMedia.findFirst({
      where: { id: mediaId, channelId },
      select: { id: true, r2Key: true },
    })
    if (!item) return res.status(404).json({ error: 'Media not found' })

    const url = await getSignedReadUrl(item.r2Key, 3600)
    res.json({ url })
  } catch (e) {
    console.error('[gallery/download]', e)
    res.status(500).json({ error: e.message || 'Failed to get download URL' })
  }
})

router.delete('/:channelId/:mediaId', requireRole('owner', 'admin', 'editor'), async (req, res) => {
  try {
    const { channelId, mediaId } = req.params
    const item = await db.galleryMedia.findFirst({
      where: { id: mediaId, channelId },
      select: { id: true, r2Key: true, thumbnailR2Key: true },
    })
    if (!item) return res.status(404).json({ error: 'Media not found' })

    await db.$transaction([
      db.galleryAlbum.updateMany({ where: { channelId, coverMediaId: mediaId }, data: { coverMediaId: null } }),
      db.galleryMedia.delete({ where: { id: mediaId } }),
    ])

    await Promise.allSettled([deleteObject(item.r2Key), item.thumbnailR2Key ? deleteObject(item.thumbnailR2Key) : Promise.resolve()])

    res.json({ ok: true })
  } catch (e) {
    console.error('[gallery/delete]', e)
    res.status(500).json({ error: e.message || 'Failed to delete media' })
  }
})

module.exports = router
