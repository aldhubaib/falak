const fetch = require('node-fetch')
const db = require('../lib/db')
const { decrypt } = require('./crypto')
const { trackUsage } = require('./usageTracker')
const registry = require('../lib/serviceRegistry')

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
  return registry.requireKey('youtube')
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
    const typed = registry.classifyHttpError('youtube', res.status, msg, res.headers)
    if (!typed.retryable) registry.markDown('youtube', typed.code, typed.message)
    throw typed
  }
  trackUsage({ channelId, service: 'youtube-data', action: endpoint, status: 'ok' })
  registry.markUp('youtube')
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
async function fetchRecentVideos(youtubeChannelId, maxResults = 500, channelId, knownVideoIds = new Set()) {
  const chData = await ytFetch('channels', {
    part: 'contentDetails',
    id: youtubeChannelId,
  }, channelId)
  const uploadsId = chData.items?.[0]?.contentDetails?.relatedPlaylists?.uploads
  if (!uploadsId) return []

  // Paginate playlistItems (newest-first). Stop early when we hit known videos.
  const newVideoIds = []
  let pageToken = undefined
  let hitKnown = false
  while (newVideoIds.length < maxResults) {
    const pageSize = Math.min(50, maxResults - newVideoIds.length)
    const params = {
      part: 'contentDetails',
      playlistId: uploadsId,
      maxResults: pageSize,
    }
    if (pageToken) params.pageToken = pageToken
    const plData = await ytFetch('playlistItems', params, channelId)
    const ids = (plData.items || []).map(i => i.contentDetails.videoId)
    if (ids.length === 0) break

    for (const id of ids) {
      if (knownVideoIds.has(id)) { hitKnown = true; break }
      newVideoIds.push(id)
    }

    if (hitKnown) break
    pageToken = plData.nextPageToken
    if (!pageToken) break
  }
  if (newVideoIds.length === 0) return []

  // Fetch video details only for new IDs, in batches of 50
  const allVideos = []
  for (let i = 0; i < newVideoIds.length; i += 50) {
    const batch = newVideoIds.slice(i, i + 50).join(',')
    const vData = await ytFetch('videos', {
      part: 'snippet,statistics,contentDetails',
      id: batch,
    }, channelId)
    const mapped = await Promise.all((vData.items || []).map(async v => ({
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
    allVideos.push(...mapped)
  }
  return allVideos
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
    return (data.items || []).map(i => ({
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

// Refresh stats (views, likes, comments) for videos we already have in DB — no playlistItems needed
async function refreshVideoStats(youtubeIds, channelId) {
  const results = []
  for (let i = 0; i < youtubeIds.length; i += 50) {
    const batch = youtubeIds.slice(i, i + 50).join(',')
    const vData = await ytFetch('videos', {
      part: 'statistics',
      id: batch,
    }, channelId)
    for (const v of (vData.items || [])) {
      results.push({
        youtubeId:    v.id,
        viewCount:    BigInt(v.statistics.viewCount || 0),
        likeCount:    BigInt(v.statistics.likeCount || 0),
        commentCount: BigInt(v.statistics.commentCount || 0),
      })
    }
  }
  return results
}

// ── Fetch trending videos (YouTube Data API chart=mostPopular) ──
const YOUTUBE_CATEGORIES = {
  '1': 'Film & Animation', '2': 'Autos & Vehicles', '10': 'Music',
  '15': 'Pets & Animals', '17': 'Sports', '19': 'Travel & Events',
  '20': 'Gaming', '22': 'People & Blogs', '23': 'Comedy',
  '24': 'Entertainment', '25': 'News & Politics', '26': 'Howto & Style',
  '27': 'Education', '28': 'Science & Technology', '29': 'Nonprofits & Activism',
}

async function fetchTrending(regionCode = 'SA', maxResults = 50) {
  const allItems = []
  let pageToken
  while (allItems.length < maxResults) {
    const pageSize = Math.min(50, maxResults - allItems.length)
    const params = {
      part: 'snippet,statistics,contentDetails',
      chart: 'mostPopular',
      regionCode,
      maxResults: String(pageSize),
    }
    if (pageToken) params.pageToken = pageToken
    const data = await ytFetch('videos', params, null)
    if (!data.items?.length) break
    for (const v of data.items) {
      allItems.push({
        youtubeVideoId: v.id,
        title: v.snippet.title,
        channelName: v.snippet.channelTitle,
        channelId: v.snippet.channelId,
        categoryId: v.snippet.categoryId || null,
        categoryName: YOUTUBE_CATEGORIES[v.snippet.categoryId] || null,
        viewCount: BigInt(v.statistics.viewCount || 0),
        likeCount: BigInt(v.statistics.likeCount || 0),
        commentCount: BigInt(v.statistics.commentCount || 0),
        duration: v.contentDetails.duration,
        publishedAt: v.snippet.publishedAt ? new Date(v.snippet.publishedAt) : null,
        thumbnailUrl: v.snippet.thumbnails?.high?.url || v.snippet.thumbnails?.default?.url || null,
      })
    }
    pageToken = data.nextPageToken
    if (!pageToken) break
  }
  return allItems
}

const SERVICE_DESCRIPTOR = {
  name: 'youtube',
  displayName: 'YouTube Data API v3',
  keySource: 'youtubeApiKey',
}

module.exports = { fetchChannel, fetchRecentVideos, refreshVideoStats, fetchComments, fetchVideoMetadata, isYouTubeShort, fetchTrending, YOUTUBE_CATEGORIES, SERVICE_DESCRIPTOR }
