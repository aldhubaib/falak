const fetch = require('node-fetch')
const db = require('../lib/db')
const { decrypt } = require('./crypto')
const { trackUsage } = require('./usageTracker')

const BASE = 'https://www.googleapis.com/youtube/v3'
const FETCH_TIMEOUT_MS = 30_000

function fetchWithTimeout(url, opts = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs || FETCH_TIMEOUT_MS)
  return fetch(url, { ...opts, signal: controller.signal }).finally(() => clearTimeout(timer))
}

// Parse ISO 8601 duration (e.g. "PT1M30S") → total seconds
function parseDurationSecs(iso) {
  if (!iso) return null
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
  if (!m) return null
  return (parseInt(m[1] || 0) * 3600) + (parseInt(m[2] || 0) * 60) + parseInt(m[3] || 0)
}

// Detect if a video is a YouTube Short by checking the /shorts/ URL
// YouTube returns 200 for shorts, 303/redirect for regular videos
async function isYouTubeShort(youtubeId) {
  try {
    const res = await fetchWithTimeout(`https://www.youtube.com/shorts/${youtubeId}`, {
      method: 'HEAD',
      redirect: 'manual',
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeoutMs: 10_000,
    })
    // Shorts return 200; regular videos get redirected (301/303) away from /shorts/
    return res.status === 200
  } catch (_) {
    return false
  }
}

// Detect video type: use /shorts/ URL check, fallback to duration ≤ 180s
async function detectVideoType(youtubeId, duration) {
  const secs = parseDurationSecs(duration)
  // Fast path: clearly a long video
  if (secs !== null && secs > 180) return 'video'
  // For anything ≤ 3min, verify via YouTube Shorts URL
  try {
    const short = await isYouTubeShort(youtubeId)
    return short ? 'short' : 'video'
  } catch (_) {
    // Fallback to duration heuristic
    return (secs !== null && secs <= 180) ? 'short' : 'video'
  }
}

async function getApiKey() {
  const keys = await db.youtubeApiKey.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
  })
  if (keys.length === 0) {
    throw new Error('YouTube Data API v3 key not configured. Go to Settings and add it.')
  }
  const entry = keys[Math.floor(Math.random() * keys.length)]
  return decrypt(entry.encryptedKey)
}

async function ytFetch(endpoint, params, channelId) {
  const key = await getApiKey()
  const url = new URL(`${BASE}/${endpoint}`)
  url.searchParams.set('key', key)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)

  const res = await fetchWithTimeout(url.toString())
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    const msg = err?.error?.message || String(res.status)
    trackUsage({ channelId, service: 'youtube-data', action: endpoint, status: 'fail', error: msg })
    throw new Error(`YouTube API error: ${msg}`)
  }
  trackUsage({ channelId, service: 'youtube-data', action: endpoint, status: 'ok' })
  return res.json()
}

// ── Fetch channel metadata by handle or ID ────────────────────
async function fetchChannel(handleOrId, channelId) {
  const isId = handleOrId.startsWith('UC')
  const params = isId
    ? { part: 'snippet,statistics,contentDetails', id: handleOrId }
    : { part: 'snippet,statistics,contentDetails', forHandle: handleOrId.replace('@', '') }

  const data = await ytFetch('channels', params, channelId)
  if (!data.items?.length) throw new Error('Channel not found')

  const ch = data.items[0]
  return {
    youtubeId: ch.id,
    handle:    ch.snippet.customUrl || handleOrId,
    nameAr:    ch.snippet.title,
    nameEn:    ch.snippet.title,
    avatarUrl: ch.snippet.thumbnails?.high?.url || ch.snippet.thumbnails?.default?.url,
    subscribers: BigInt(ch.statistics.subscriberCount || 0),
    totalViews:  BigInt(ch.statistics.viewCount || 0),
    videoCount:  parseInt(ch.statistics.videoCount || 0),
  }
}

// ── Fetch metadata for a single video by YouTube ID ───────────
async function fetchVideoMetadata(youtubeVideoId, channelId) {
  const data = await ytFetch('videos', {
    part: 'snippet,statistics,contentDetails',
    id: youtubeVideoId,
  }, channelId)
  if (!data.items?.length) throw new Error('Video not found')
  const v = data.items[0]
  return {
    youtubeId:    v.id,
    titleAr:      v.snippet.title,
    titleEn:      v.snippet.title,
    description:  v.snippet.description,
    publishedAt:  new Date(v.snippet.publishedAt),
    thumbnailUrl: v.snippet.thumbnails?.high?.url,
    viewCount:    BigInt(v.statistics.viewCount || 0),
    likeCount:    BigInt(v.statistics.likeCount || 0),
    commentCount: BigInt(v.statistics.commentCount || 0),
    duration:     v.contentDetails.duration,
    videoType:    await detectVideoType(v.id, v.contentDetails.duration),
  }
}
async function fetchRecentVideos(youtubeChannelId, maxResults = 50, channelId) {
  // 1. Get upload playlist ID
  const chData = await ytFetch('channels', {
    part: 'contentDetails',
    id: youtubeChannelId,
  }, channelId)
  const uploadsId = chData.items?.[0]?.contentDetails?.relatedPlaylists?.uploads
  if (!uploadsId) return []

  // 2. Get video IDs from playlist
  const plData = await ytFetch('playlistItems', {
    part: 'contentDetails',
    playlistId: uploadsId,
    maxResults,
  }, channelId)
  const videoIds = plData.items.map(i => i.contentDetails.videoId).join(',')
  if (!videoIds) return []

  // 3. Get full video details
  const vData = await ytFetch('videos', {
    part: 'snippet,statistics,contentDetails',
    id: videoIds,
  }, channelId)

  return Promise.all(vData.items.map(async v => ({
    youtubeId:    v.id,
    titleAr:      v.snippet.title,
    titleEn:      v.snippet.title,
    description:  v.snippet.description,
    publishedAt:  new Date(v.snippet.publishedAt),
    thumbnailUrl: v.snippet.thumbnails?.high?.url,
    viewCount:    BigInt(v.statistics.viewCount || 0),
    likeCount:    BigInt(v.statistics.likeCount || 0),
    commentCount: BigInt(v.statistics.commentCount || 0),
    duration:     v.contentDetails.duration,
    videoType:    await detectVideoType(v.id, v.contentDetails.duration),
  })))
}

// ── Fetch top comments for a video ───────────────────────────
async function fetchComments(youtubeVideoId, maxResults = 100, channelId) {
  try {
    const data = await ytFetch('commentThreads', {
      part: 'snippet',
      videoId: youtubeVideoId,
      maxResults,
      order: 'relevance',
    }, channelId)
    return data.items.map(i => ({
      youtubeId:   i.id,
      text:        i.snippet.topLevelComment.snippet.textDisplay,
      authorName:  i.snippet.topLevelComment.snippet.authorDisplayName,
      likeCount:   i.snippet.topLevelComment.snippet.likeCount || 0,
      publishedAt: new Date(i.snippet.topLevelComment.snippet.publishedAt),
    }))
  } catch (e) {
    // Comments disabled on this video — not an error
    if (e.message.includes('disabled')) return []
    throw e
  }
}

module.exports = { fetchChannel, fetchRecentVideos, fetchComments, fetchVideoMetadata, isYouTubeShort }
