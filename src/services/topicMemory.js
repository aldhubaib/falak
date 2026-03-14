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

    const competitorVideos = await db.video.findMany({
      where: {
        channel: { projectId, type: 'competitor' },
        analysisResult: { not: null },
        pipelineItem: { is: { stage: 'done', status: 'done' } },
      },
      select: { id: true, publishedAt: true, analysisResult: true },
    })

    const topicToEarliestCompetitor = new Map()
    for (const v of competitorVideos) {
      const compTopics = extractTopics(v.analysisResult)
      const cpDate = v.publishedAt ? new Date(v.publishedAt) : null
      for (const t of compTopics) {
        const key = normTopic(t.trim())
        if (!key) continue
        if (!topicToEarliestCompetitor.has(key)) {
          topicToEarliestCompetitor.set(key, cpDate)
        } else if (cpDate) {
          const existing = topicToEarliestCompetitor.get(key)
          if (!existing || cpDate < existing) topicToEarliestCompetitor.set(key, cpDate)
        }
      }
    }

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

      const winsDelta = outcome === 'gap_win' ? 1 : 0
      const lateDelta = outcome === 'late' ? 1 : 0

      if (existing) {
        const weightDelta = outcome === 'gap_win' ? 0.5 : -0.2
        await db.topicMemory.update({
          where: { projectId_topicKey: { projectId, topicKey: key } },
          data: {
            topicLabel: topic,
            winsCount: { increment: winsDelta },
            lateCount: { increment: lateDelta },
            videosCount: { increment: 1 },
            viewsSum: { increment: BigInt(views) },
            weight: { increment: weightDelta },
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
            performanceScore: 0,
            weight: outcome === 'gap_win' ? 1 : 0,
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

module.exports = { updateTopicMemoryFromVideo, extractTopics, normTopic }
