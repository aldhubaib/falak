/**
 * Topic memory service for Brain v2.
 * Updates TopicMemory and TopicMemoryEvent when "ours" videos complete analyzing.
 * Fail-open: errors log and do not throw (pipeline continues).
 */
const db = require('../lib/db')

function extractTopics(analysisResult) {
  if (!analysisResult || typeof analysisResult !== 'object') return []
  const ar = analysisResult
  const candidates = [
    ar.topics,
    ar.mainTopics,
    ar.keywords,
    ar.storyTopics,
    ar.topic,
    ar.partA?.topics,
    ar.partA?.keywords,
    ar.partA?.tags,
    ar.partB?.topics,
    ar.partB?.keywords,
    ar.classify?.topics,
    ar.insights?.topics,
    ar.analysis?.topics,
  ]
  for (const c of candidates) {
    if (Array.isArray(c) && c.length > 0) return c.filter((x) => typeof x === 'string')
  }
  const fallback = ar.subject || ar.mainSubject || ar.storyTitle || ar.partA?.topic
  if (typeof fallback === 'string' && fallback.trim()) return [fallback.trim()]
  return []
}

function normTopic(t) {
  return t.toLowerCase().replace(/\s+/g, ' ').trim()
}

function median(arr) {
  if (!arr.length) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/**
 * Update topic memory from a newly analyzed video.
 * Only runs for channel type 'ours'. Fail-open: logs errors, does not throw.
 */
async function updateTopicMemoryFromVideo(videoId, projectId) {
  try {
    const video = await db.video.findUnique({
      where: { id: videoId },
      select: {
        id: true,
        publishedAt: true,
        viewCount: true,
        likeCount: true,
        commentCount: true,
        videoType: true,
        analysisResult: true,
        channel: { select: { type: true } },
      },
    })
    if (!video || video.channel?.type !== 'ours') return
    if (!video.analysisResult) return

    const topics = extractTopics(video.analysisResult)
    if (topics.length === 0) return

    const ourDate = video.publishedAt ? new Date(video.publishedAt) : null
    const views = Number(video.viewCount) || 0
    const likes = Number(video.likeCount) || 0
    const comments = Number(video.commentCount) || 0
    const isShort = video.videoType === 'short'

    const projectVideos = await db.video.findMany({
      where: { channel: { projectId, type: 'ours' }, viewCount: { gt: 0 } },
      select: { viewCount: true, likeCount: true, commentCount: true },
      orderBy: { viewCount: 'asc' },
    })
    const viewCounts = projectVideos.map(v => Number(v.viewCount))
    const medianViews = median(viewCounts) || 1
    const viewFactor = Math.min(3.0, Math.max(0.2, views / medianViews))

    const engagements = projectVideos.map(v => {
      const vw = Number(v.viewCount) || 1
      return (Number(v.likeCount) + Number(v.commentCount)) / vw
    })
    const medianEngagement = median(engagements) || 0.03
    const videoEngagement = views > 0 ? (likes + comments) / views : 0
    const engagementFactor = Math.min(2.0, Math.max(0.5,
      medianEngagement > 0 ? videoEngagement / medianEngagement : 1.0
    ))

    const competitorVideos = await db.video.findMany({
      where: {
        channel: { projectId, type: 'competitor' },
        analysisResult: { not: null },
        pipelineItem: { is: { stage: 'done', status: 'done' } },
      },
      select: { id: true, publishedAt: true, analysisResult: true, viewCount: true },
    })

    const topicToEarliestCompetitor = new Map()
    const topicCompetitorViews = new Map()
    for (const v of competitorVideos) {
      const compTopics = extractTopics(v.analysisResult)
      const cpDate = v.publishedAt ? new Date(v.publishedAt) : null
      const cpViews = Number(v.viewCount) || 0
      for (const t of compTopics) {
        const key = normTopic(t.trim())
        if (!key) continue
        if (!topicToEarliestCompetitor.has(key)) {
          topicToEarliestCompetitor.set(key, cpDate)
        } else if (cpDate) {
          const existing = topicToEarliestCompetitor.get(key)
          if (!existing || cpDate < existing) topicToEarliestCompetitor.set(key, cpDate)
        }
        topicCompetitorViews.set(key, (topicCompetitorViews.get(key) || 0) + cpViews)
      }
    }
    const maxCompetitorViews = Math.max(1, ...[...topicCompetitorViews.values()])

    const now = new Date()
    for (const rawTopic of topics) {
      const topic = rawTopic.trim()
      if (!topic) continue
      const key = normTopic(topic)
      const competitorEarliest = topicToEarliestCompetitor.get(key)
      const outcome = ourDate && competitorEarliest && competitorEarliest < ourDate ? 'late' : 'gap_win'

      let eventCreated = false
      try {
        await db.topicMemoryEvent.create({
          data: {
            projectId,
            videoId,
            topicKey: key,
            outcome,
            views: BigInt(views),
            occurredAt: now,
          },
        })
        eventCreated = true
      } catch (e) {
        if (e.code === 'P2002') continue
        throw e
      }
      if (!eventCreated) continue

      const existing = await db.topicMemory.findUnique({
        where: { projectId_topicKey: { projectId, topicKey: key } },
      })

      const isWin = outcome === 'gap_win'
      const winsDelta = isWin ? 1 : 0
      const lateDelta = isWin ? 0 : 1
      const baseReward = isWin ? 0.3 : -0.15
      const weightDelta = baseReward * viewFactor * engagementFactor
      const shortDelta = isWin && isShort ? 1 : 0
      const longDelta = isWin && !isShort ? 1 : 0
      const competitorViewsForTopic = topicCompetitorViews.get(key) || 0
      const demandScore = competitorViewsForTopic / maxCompetitorViews

      if (existing) {
        const newViewsSum = Number(existing.viewsSum || 0n) + views
        const newVideosCount = (existing.videosCount || 0) + 1
        const performanceScore = newViewsSum / newVideosCount / Math.max(1, medianViews)

        await db.topicMemory.update({
          where: { projectId_topicKey: { projectId, topicKey: key } },
          data: {
            topicLabel: topic,
            winsCount: { increment: winsDelta },
            lateCount: { increment: lateDelta },
            videosCount: { increment: 1 },
            viewsSum: { increment: BigInt(views) },
            weight: { increment: weightDelta },
            winsShort: { increment: shortDelta },
            winsLong: { increment: longDelta },
            performanceScore,
            demandScore,
            lastOutcomeAt: now,
            lastSeenAt: now,
            updatedAt: now,
          },
        })
      } else {
        await db.topicMemory.create({
          data: {
            projectId,
            topicKey: key,
            topicLabel: topic,
            winsCount: winsDelta,
            lateCount: lateDelta,
            videosCount: 1,
            viewsSum: BigInt(views),
            performanceScore: views / Math.max(1, medianViews),
            weight: isWin ? 0.3 * viewFactor * engagementFactor : 0,
            winsShort: shortDelta,
            winsLong: longDelta,
            demandScore,
            lastOutcomeAt: now,
            lastSeenAt: now,
          },
        })
      }
    }
  } catch (err) {
    console.warn('[topicMemory] update failed for video', videoId, err.message)
  }
}

module.exports = { updateTopicMemoryFromVideo, extractTopics, normTopic, median }
