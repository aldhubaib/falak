/**
 * Brain v2 API: learning-based recommendations with ranked opportunities.
 * Returns all Brain v1 fields plus rankedOpportunities, modelSignals, queryMeta.
 */
const express = require('express')
const db = require('../lib/db')
const { requireAuth } = require('../middleware/auth')
const { extractTopics, normTopic } = require('../services/topicMemory')

const router = express.Router()
router.use(requireAuth)

function fmtViews(n) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`
  return String(n)
}

function buildAutoSearchQuery({ gapWinTitles, openTitles, takenTitles, competitorHandles }) {
  const gapSection = gapWinTitles.length
    ? `ابحث عن قصص مشابهة في النوع والشعور\nلـ: ${gapWinTitles.join('\nو')}\n(حققت أعلى مشاهدات لقناتنا).\n\n`
    : ''
  const openSection = openTitles.length
    ? `أولوية: ابحث عن تطورات جديدة في هذه القضايا الغير مغطاة:\n${openTitles.join('\n')}\n\n`
    : ''
  const takenSection = takenTitles.length
    ? `تجنب تماماً أي قصص مشابهة لـ:\n${takenTitles.join(',\n')} — هذه تم تصويرها بالفعل.\n\n`
    : ''
  const competitorSection = competitorHandles
    ? `لكل قصة: العنوان، ملخص جملتين، رابط المصدر، وهل غطاها أحد من منافسينا (${competitorHandles})؟`
    : 'لكل قصة: العنوان، ملخص جملتين، رابط المصدر.'
  return `أعطني أبرز 8 قضايا وأخبار من الجريمة والقضايا الحقيقية في السعودية والخليج: خليط من أخبار حديثة (آخر 7 أيام) وقصص قديمة ما زالت تستحق التغطية أو عادت للظهور (مثل قضايا شهيرة أو قضايا لم تُغطَّ بالكامل).

${openSection}${gapSection}${takenSection}${competitorSection}`
}

/**
 * Compute full Brain v2 payload (for GET /api/brain-v2 and for Stories Fetch).
 * @param {string} projectId
 * @returns {Promise<object>} payload with autoSearchQuery, competitorStories, etc.
 */
async function getBrainV2Data(projectId) {
  const requestTime = new Date()
  let debugStage = 'init'

  const competitorVideos = await db.video.findMany({
      where: {
        channel: { projectId, type: 'competitor' },
        analysisResult: { not: null },
        pipelineItem: { is: { stage: 'done', status: 'done' } },
      },
      select: {
        id: true, titleAr: true, titleEn: true, publishedAt: true, viewCount: true, analysisResult: true,
        channel: { select: { id: true, nameAr: true, nameEn: true, avatarUrl: true, handle: true } },
      },
      orderBy: { publishedAt: 'desc' },
    })

    debugStage = 'query-our-videos'
    const ourVideos = await db.video.findMany({
      where: {
        channel: { projectId, type: 'ours' },
        analysisResult: { not: null },
        pipelineItem: { is: { stage: 'done', status: 'done' } },
      },
      select: {
        id: true, titleAr: true, titleEn: true, publishedAt: true, viewCount: true, likeCount: true,
        commentCount: true, videoType: true, analysisResult: true,
        channel: { select: { id: true, nameAr: true, nameEn: true, avatarUrl: true } },
      },
      orderBy: { publishedAt: 'desc' },
    })

    debugStage = 'build-topic-map'
    const topicMap = new Map()
    for (const v of competitorVideos) {
      for (const rawTopic of extractTopics(v.analysisResult)) {
        const topic = rawTopic.trim()
        if (!topic) continue
        const key = normTopic(topic)
        if (!topicMap.has(key)) topicMap.set(key, [])
        topicMap.get(key).push({
          channelId: v.channel.id,
          channelName: v.channel.nameAr || v.channel.nameEn || v.channel.handle,
          avatarUrl: v.channel.avatarUrl,
          publishedAt: v.publishedAt,
          viewCount: v.viewCount,
          originalTopic: topic,
        })
      }
    }

    const ourTopicSet = new Set()
    for (const v of ourVideos) {
      for (const t of extractTopics(v.analysisResult)) {
        ourTopicSet.add(normTopic(t.trim()))
      }
    }

    debugStage = 'assemble-stories'
    const takenStories = []
    const untouchedStories = []
    const seenTopicKeys = new Set()
    const sortedTopics = [...topicMap.entries()].sort((a, b) => {
      const aT = Math.max(...a[1].map(x => x.publishedAt ? new Date(x.publishedAt).getTime() : 0))
      const bT = Math.max(...b[1].map(x => x.publishedAt ? new Date(x.publishedAt).getTime() : 0))
      return bT - aT
    })

    for (const [normKey, entries] of sortedTopics) {
      if (seenTopicKeys.has(normKey)) continue
      seenTopicKeys.add(normKey)
      const displayTopic = entries[0].originalTopic
      const competitorMap = new Map()
      let totalViews = BigInt(0)
      let earliestDate = null
      for (const e of entries) {
        if (!competitorMap.has(e.channelId)) competitorMap.set(e.channelId, { name: e.channelName, avatarUrl: e.avatarUrl, channelId: e.channelId })
        totalViews += BigInt(e.viewCount || 0)
        const pd = e.publishedAt ? new Date(e.publishedAt) : null
        if (pd && (!earliestDate || pd < earliestDate)) earliestDate = pd
      }
      const story = {
        id: normKey,
        title: displayTopic,
        date: earliestDate ? new Date(earliestDate).toISOString().split('T')[0] : '',
        status: ourTopicSet.has(normKey) ? 'taken_by_us' : 'taken',
        competitors: [...competitorMap.values()],
        totalViews: fmtViews(Number(totalViews)),
      }
      if (ourTopicSet.has(normKey)) {
        takenStories.push(story)
      } else {
        const daysSince = earliestDate ? Math.floor((requestTime.getTime() - earliestDate.getTime()) / 86400000) : 999
        if (daysSince <= 14) untouchedStories.push({ ...story, status: 'open', daysSince })
        else takenStories.push(story)
      }
    }
    untouchedStories.sort((a, b) => (a.daysSince || 0) - (b.daysSince || 0))

    debugStage = 'tag-published-videos'
    const publishedVideos = ourVideos.map((v) => {
      const topics = extractTopics(v.analysisResult)
      let result = 'gap_win'
      for (const rawTopic of topics) {
        const key = normTopic(rawTopic.trim())
        for (const ce of topicMap.get(key) || []) {
          const cpDate = ce.publishedAt ? new Date(ce.publishedAt) : null
          const ourDate = v.publishedAt ? new Date(v.publishedAt) : null
          if (cpDate && ourDate && cpDate < ourDate) { result = 'late'; break }
        }
        if (result === 'late') break
      }
      return {
        id: v.id,
        title: v.titleAr || v.titleEn || '—',
        date: v.publishedAt ? new Date(v.publishedAt).toISOString().split('T')[0] : '',
        views: fmtViews(Number(v.viewCount)),
        likes: fmtViews(Number(v.likeCount)),
        comments: fmtViews(Number(v.commentCount)),
        viewsRaw: Number(v.viewCount),
        result,
        type: v.videoType === 'short' ? 'short' : 'video',
        channelId: v.channel.id,
        channelName: v.channel.nameAr || v.channel.nameEn || '—',
        channelAvatarUrl: v.channel.avatarUrl,
      }
    })

    debugStage = 'query-competitor-channels'
    const competitorChannelsRaw = await db.channel.findMany({
      where: { projectId, type: 'competitor' },
      select: { id: true, nameAr: true, nameEn: true, handle: true, avatarUrl: true },
      orderBy: { subscribers: 'desc' },
    })
    const COLORS = ['bg-blue', 'bg-purple', 'bg-orange', 'bg-destructive', 'bg-success', 'bg-sensor']
    const competitorChannels = competitorChannelsRaw.map((ch, i) => ({
      id: ch.id, name: ch.nameAr || ch.nameEn || ch.handle, handle: ch.handle, avatarUrl: ch.avatarUrl,
      color: COLORS[i % COLORS.length], enabled: true,
    }))

    const activityCount = {}
    for (const [, entries] of topicMap) {
      for (const e of entries) activityCount[e.channelId] = (activityCount[e.channelId] || 0) + 1
    }
    const competitorActivity = competitorChannels.map((ch) => ({ ...ch, count: activityCount[ch.id] || 0 })).sort((a, b) => b.count - a.count)

    const gapWinTitles = publishedVideos.filter((v) => v.result === 'gap_win').slice(0, 3).map((v) => `"${v.title.slice(0, 40)}…"`)
    const openTitles = untouchedStories.slice(0, 3).map((s) => `• ${s.title.slice(0, 60)}`)
    const takenTitles = takenStories.slice(0, 5).map((s) => `"${s.title.slice(0, 40)}…"`)
    const competitorHandles = competitorChannels.map((c) => c.handle).join(', ')
    const autoSearchQuery = buildAutoSearchQuery({ gapWinTitles, openTitles, takenTitles, competitorHandles })

    const gapWins = publishedVideos.filter((v) => v.result === 'gap_win').length
    const lateCount = publishedVideos.filter((v) => v.result === 'late').length
    const winRate = publishedVideos.length ? Math.round((gapWins / publishedVideos.length) * 100) : 0

    debugStage = 'load-topic-memory'
    const topicMemories = await db.topicMemory.findMany({
      where: { projectId },
      orderBy: { weight: 'desc' },
      take: 50,
    })
    const memoryByKey = new Map(topicMemories.map((m) => [m.topicKey, m]))

    debugStage = 'score-and-rank'
    const scored = untouchedStories.map((s) => {
      const mem = memoryByKey.get(s.id)
      const winnerWeight = mem ? mem.weight : 0
      const freshness = Math.max(0, 1 - (s.daysSince || 0) / 14)
      const saturationPenalty = Math.min(1, (s.competitors?.length || 0) / 5) * 0.3
      const score = Math.round((winnerWeight * 0.4 + freshness * 0.5 - saturationPenalty) * 100) / 100
      const reasons = []
      if (winnerWeight > 0) reasons.push('winner-like')
      if (freshness > 0.7) reasons.push('fresh')
      if ((s.daysSince || 0) >= 7) reasons.push('closing-fast')
      const riskFlags = (s.daysSince || 0) >= 10 ? ['urgent'] : []
      return { ...s, score, reasons, riskFlags }
    })
    scored.sort((a, b) => b.score - a.score)
    const rankedOpportunities = scored.slice(0, 5)

  const queryMeta = {
    schemaVersion: 1,
    provider: 'internal',
    generatedAt: requestTime.toISOString(),
    fallbackReason: null,
  }

  return {
    competitorStories: takenStories,
    untouchedStories,
    publishedVideos,
    competitorChannels,
    competitorActivity,
    autoSearchQuery,
    stats: { gapWins, lateCount, winRate, totalCompetitorStories: takenStories.length, untouchedCount: untouchedStories.length },
    rankedOpportunities,
    modelSignals: { topicMemoryCount: topicMemories.length },
    queryMeta,
  }
}

/**
 * Ensure every untouched item exists as a Story in stage 'suggestion'. Called when Brain v2 data is loaded.
 */
async function syncUntouchedToStories(projectId, untouchedStories) {
  if (!untouchedStories?.length) return
  for (const item of untouchedStories) {
    const headline = (item.title || '').trim()
    if (!headline) continue
    const existing = await db.story.findFirst({
      where: { projectId, headline },
      select: { id: true },
    })
    if (!existing) {
      await db.story.create({
        data: {
          projectId,
          headline,
          stage: 'suggestion',
          sourceName: 'Brain v2',
        },
      }).catch((e) => console.error('[brainV2] sync story create', e.message))
    }
  }
}

router.get('/', async (req, res) => {
  try {
    const { projectId } = req.query
    if (!projectId) return res.status(400).json({ error: 'projectId required' })
    const data = await getBrainV2Data(projectId)
    await syncUntouchedToStories(projectId, data.untouchedStories)
    return res.json(data)
  } catch (err) {
    console.error('[brainV2] error', err)
    res.status(500).json({ error: 'Internal server error', message: err instanceof Error ? err.message : String(err) })
  }
})

module.exports = router
module.exports.getBrainV2Data = getBrainV2Data
