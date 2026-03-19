const { S3Client, CreateMultipartUploadCommand, UploadPartCommand, CompleteMultipartUploadCommand, AbortMultipartUploadCommand, DeleteObjectCommand, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3')
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner')
const config = require('../config')

const MB = 1024 * 1024
const GB = 1024 * MB

function getChunkSize(fileSize) {
  let size = 25 * MB
  if (fileSize > 500 * MB) size = 50 * MB
  if (fileSize > 2 * GB) size = 100 * MB
  const minForLimit = Math.ceil(fileSize / 10_000)
  return Math.max(size, minForLimit)
}

let _client = null

function getClient() {
  if (_client) return _client
  if (!config.R2_ACCOUNT_ID || !config.R2_ACCESS_KEY_ID || !config.R2_SECRET_ACCESS_KEY) {
    return null
  }
  _client = new S3Client({
    region: 'auto',
    endpoint: `https://${config.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.R2_ACCESS_KEY_ID,
      secretAccessKey: config.R2_SECRET_ACCESS_KEY,
    },
  })
  return _client
}

function getBucket() {
  return config.R2_BUCKET_NAME || 'falak-uploads'
}

function getPublicUrl(key) {
  if (config.R2_PUBLIC_URL) {
    return `${config.R2_PUBLIC_URL.replace(/\/+$/, '')}/${key}`
  }
  return `https://${config.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${getBucket()}/${key}`
}

async function initMultipartUpload(key, contentType) {
  const client = getClient()
  if (!client) throw new Error('R2 not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY in env.')
  const cmd = new CreateMultipartUploadCommand({
    Bucket: getBucket(),
    Key: key,
    ContentType: contentType,
  })
  const res = await client.send(cmd)
  return res.UploadId
}

async function getDirectUploadUrl(key, contentType) {
  const client = getClient()
  if (!client) throw new Error('R2 not configured')
  const cmd = new PutObjectCommand({
    Bucket: getBucket(),
    Key: key,
    ContentType: contentType,
  })
  return getSignedUrl(client, cmd, { expiresIn: 3600 })
}

async function getPartPresignedUrls(key, uploadId, totalParts) {
  const client = getClient()
  if (!client) throw new Error('R2 not configured')
  const promises = []
  for (let part = 1; part <= totalParts; part++) {
    const cmd = new UploadPartCommand({
      Bucket: getBucket(),
      Key: key,
      UploadId: uploadId,
      PartNumber: part,
    })
    promises.push(
      getSignedUrl(client, cmd, { expiresIn: 3600 }).then(url => ({ partNumber: part, url }))
    )
  }
  return Promise.all(promises)
}

async function getSpecificPartUrls(key, uploadId, partNumbers) {
  const client = getClient()
  if (!client) throw new Error('R2 not configured')
  return Promise.all(
    partNumbers.map(part => {
      const cmd = new UploadPartCommand({
        Bucket: getBucket(),
        Key: key,
        UploadId: uploadId,
        PartNumber: part,
      })
      return getSignedUrl(client, cmd, { expiresIn: 3600 }).then(url => ({ partNumber: part, url }))
    })
  )
}

async function completeMultipartUpload(key, uploadId, parts) {
  const client = getClient()
  if (!client) throw new Error('R2 not configured')
  const cmd = new CompleteMultipartUploadCommand({
    Bucket: getBucket(),
    Key: key,
    UploadId: uploadId,
    MultipartUpload: {
      Parts: parts.map(p => ({ PartNumber: p.partNumber, ETag: p.etag })),
    },
  })
  await client.send(cmd)
  return getPublicUrl(key)
}

async function abortMultipartUpload(key, uploadId) {
  const client = getClient()
  if (!client) return
  try {
    const cmd = new AbortMultipartUploadCommand({
      Bucket: getBucket(),
      Key: key,
      UploadId: uploadId,
    })
    await client.send(cmd)
  } catch (_) {}
}

async function getSignedReadUrl(key, expiresIn = 3600) {
  const client = getClient()
  if (!client) throw new Error('R2 not configured')
  const cmd = new GetObjectCommand({ Bucket: getBucket(), Key: key })
  return getSignedUrl(client, cmd, { expiresIn })
}

async function deleteObject(key) {
  const client = getClient()
  if (!client) return
  try {
    const cmd = new DeleteObjectCommand({
      Bucket: getBucket(),
      Key: key,
    })
    await client.send(cmd)
  } catch (_) {}
}

module.exports = {
  getClient,
  getBucket,
  getPublicUrl,
  getSignedReadUrl,
  getChunkSize,
  getDirectUploadUrl,
  initMultipartUpload,
  getPartPresignedUrls,
  getSpecificPartUrls,
  completeMultipartUpload,
  abortMultipartUpload,
  deleteObject,
}
