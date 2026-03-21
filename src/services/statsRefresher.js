/**
 * Stats refresher: keeps competition data and own video stats fresh.
 * Called by the rescore worker (scheduled) and the manual re-evaluate endpoint.
 */
const db = require('../lib/db')
const { fetchChannel, fetchRecentVideos, fetchVideoMetadata } = require('./youtube')
const { trackUsage } = require('./usageTracker')
const logger = require('../lib/logger')

const INTER_CHANNEL_DELAY_MS = 2_000

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

/** Compute avgViews and engagement from Video aggregates. */
async function getChannelStats(channelId) {
  const [agg, engRow] = await Promise.all([
    db.video.aggregate({
      where: { channelId },
      _avg: { viewCount: true },
      _count: true,
    }),
    db.$queryRaw`
      SELECT AVG((COALESCE("likeCount",0)::float + COALESCE("commentCount",0)::float)
        / NULLIF(COALESCE("viewCount",1)::float, 0) * 100) as engagement
      FROM "Video" WHERE "channelId" = ${channelId}
    `.then(rows => rows[0]).catch(() => ({ engagement: null })),
  ])
  const count = agg._count
  const avgViews = count && agg._avg?.viewCount != null ? Math.round(Number(agg._avg.viewCount)) : 0
  const engagement = engRow?.engagement != null ? parseFloat(Number(engRow.engagement).toFixed(1)) : 0
  return { avgViews, engagement }
}

/**
 * Refresh all competition + own channel data from YouTube.
 * Updates Channel stats, creates ChannelSnapshots, and upserts Video stats.
 */
async function refreshCompetitionData(channelId) {
  const channels = await db.channel.findMany({
    where: { OR: [{ id: channelId }, { parentChannelId: channelId }], status: 'active' },
    select: { id: true, youtubeId: true },
  })

  let channelsRefreshed = 0
  let videosUpdated = 0

  for (const channel of channels) {
    try {
      const ytData = await fetchChannel(channel.youtubeId, channelId)
      await db.channel.update({
        where: { id: channel.id },
        data: {
          subscribers: ytData.subscribers,
          totalViews: ytData.totalViews,
          videoCount: ytData.videoCount,
          avatarUrl: ytData.avatarUrl,
          lastFetchedAt: new Date(),
        },
      })

      const { avgViews, engagement } = await getChannelStats(channel.id)
      await db.channelSnapshot.create({
        data: {
          channelId: channel.id,
          subscribers: BigInt(ytData.subscribers ?? 0),
          totalViews: BigInt(ytData.totalViews ?? 0),
          videoCount: ytData.videoCount ?? 0,
          avgViews,
          engagement,
        },
      })

      const videos = await fetchRecentVideos(channel.youtubeId, 50, channelId)
      const BATCH = 25
      for (let i = 0; i < videos.length; i += BATCH) {
        const batch = videos.slice(i, i + BATCH)
        await db.$transaction(
          batch.map(v => db.video.upsert({
            where: { youtubeId: v.youtubeId },
            create: { ...v, channelId: channel.id },
            update: { viewCount: v.viewCount, likeCount: v.likeCount, commentCount: v.commentCount },
          }))
        )
      }
      videosUpdated += videos.length

      channelsRefreshed++
      logger.info({ channelId: channel.id, videos: videos.length }, '[stats-refresh] channel refreshed')
    } catch (e) {
      logger.warn({ channelId: channel.id, error: e.message }, '[stats-refresh] channel refresh failed')
      trackUsage({ channelId, service: 'youtube-data', action: 'stats-refresh', status: 'fail', error: e.message })
    }

    if (channels.indexOf(channel) < channels.length - 1) {
      await sleep(INTER_CHANNEL_DELAY_MS)
    }
  }

  await db.channel.update({ where: { id: channelId }, data: { lastStatsRefreshAt: new Date() } })

  logger.info({ channelId, channelsRefreshed, videosUpdated }, '[stats-refresh] competition data refreshed')
  return { channelsRefreshed, videosUpdated }
}

/**
 * Fetch YouTube stats for our own published videos.
 * Primary path: stories with producedVideoId — read stats from the Video model (already fresh).
 * Fallback path: stories with brief.youtubeUrl but no producedVideoId — fetch via YouTube API.
 */
async function fetchOwnVideoStats(channelId) {
  const doneStories = await db.story.findMany({
    where: { channelId, stage: 'done' },
    select: { id: true, brief: true, producedVideoId: true },
  })

  let updated = 0
  const pendingUpdates = []

  for (const story of doneStories) {
    const brief = (story.brief && typeof story.brief === 'object') ? story.brief : {}

    if (story.producedVideoId) {
      try {
        const video = await db.video.findUnique({
          where: { id: story.producedVideoId },
          select: { viewCount: true, likeCount: true, commentCount: true, publishedAt: true },
        })
        if (video) {
          const newBrief = {
            ...brief,
            views: Number(video.viewCount),
            likes: Number(video.likeCount),
            comments: Number(video.commentCount),
            statsUpdatedAt: new Date().toISOString(),
          }
          pendingUpdates.push({ id: story.id, brief: newBrief })
          updated++
        }
      } catch (e) {
        logger.warn({ storyId: story.id, error: e.message }, '[stats-refresh] linked video stats read failed')
      }
      continue
    }

    const youtubeUrl = brief.youtubeUrl
    if (!youtubeUrl) continue

    let videoId = null
    try {
      const u = new URL(youtubeUrl)
      if (u.hostname === 'youtu.be') videoId = u.pathname.slice(1).split('/')[0]
      else if (u.pathname.startsWith('/watch')) videoId = u.searchParams.get('v')
      else if (u.pathname.startsWith('/shorts/')) videoId = u.pathname.split('/')[2]
      else if (u.pathname.startsWith('/live/')) videoId = u.pathname.split('/')[2]
    } catch (_) {}
    if (!videoId) continue

    try {
      const meta = await fetchVideoMetadata(videoId, channelId)
      const newBrief = {
        ...brief,
        views: Number(meta.viewCount),
        likes: Number(meta.likeCount),
        comments: Number(meta.commentCount),
        statsUpdatedAt: new Date().toISOString(),
      }
      pendingUpdates.push({ id: story.id, brief: newBrief })
      updated++
    } catch (e) {
      logger.warn({ storyId: story.id, error: e.message }, '[stats-refresh] own video stats fetch failed')
    }

    await sleep(500)
  }

  if (pendingUpdates.length > 0) {
    await db.$transaction(
      pendingUpdates.map(u => db.story.update({ where: { id: u.id }, data: { brief: u.brief } }))
    )
  }

  logger.info({ channelId, updated }, '[stats-refresh] own video stats refreshed')
  return { ownVideosUpdated: updated }
}

module.exports = { refreshCompetitionData, fetchOwnVideoStats, getChannelStats }
