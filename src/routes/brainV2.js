/**
 * Brain v2 API: learning-based recommendations with ranked opportunities.
 * Returns all Brain v1 fields plus rankedOpportunities, modelSignals, queryMeta.
 */
const express = require('express')
const db = require('../lib/db')
const { requireAuth } = require('../middleware/auth')
const { updateTopicMemoryFromVideo, extractTopics, normTopic, median } = require('../services/topicMemory')

const router = express.Router()
router.use(requireAuth)

function fmtViews(n) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`
  return String(n)
}

function buildDynamicBase(topTags, preferShorts) {
  const formatHint = preferShorts
    ? ' (أفضّل موضوعات قصيرة وصادمة تصلح لـ Shorts)'
    : ' (أفضّل موضوعات تصلح لفيديو مطوّل وعميق)'

  if (!topTags.length) {
    return (
      `أعطني أبرز 8 قصص وقضايا متنوعة من أي مكان في العالم${formatHint}.` +
      ` خليط من أخبار حديثة (آخر 7 أيام) وقصص قديمة لم تُروَ بالعربية بعد.\n\n`
    )
  }

  return (
    `أعطني أبرز 8 قصص وقضايا من أي مكان في العالم من نوع: ${topTags.slice(0, 5).join('، ')}${formatHint}.` +
    ` خليط من أخبار حديثة (آخر 7 أيام) وقصص قديمة لم تُروَ بالعربية بعد.\n\n`
  )
}

// Learns from COMPETITOR videos — they are your market research.
// Their view counts tell you what audiences actually want.
// YOUR videos are only used for gap-win/late analysis (execution tracking).
function buildDynamicQuery({
  competitorVideos,
  ourVideos,
  topicMemories,
  gapWinTitles,
  openTitles,
  takenTitles,
  competitorHandles,
  passedHeadlines,
}) {
  const pipeline = []

  // ── 1. Audience Demand: tags from COMPETITOR videos weighted by views ──
  // What topics get the most views in your niche?
  const tagViews = {}
  const tagAppearances = {}
  for (const v of competitorVideos) {
    const tags = v.analysisResult?.partA?.tags
    if (!Array.isArray(tags)) continue
    const views = Number(v.viewCount) || 0
    for (const tag of tags) {
      const t = tag.trim()
      if (!t) continue
      tagViews[t] = (tagViews[t] || 0) + views
      tagAppearances[t] = (tagAppearances[t] || 0) + 1
    }
  }
  const tagScore = {}
  for (const [tag, views] of Object.entries(tagViews)) {
    const appearances = tagAppearances[tag] || 1
    tagScore[tag] = views * (1 + (appearances - 1) * 0.3)
  }
  const allTagScores = Object.entries(tagScore)
    .sort((a, b) => b[1] - a[1])
    .map(([tag, score]) => ({ tag, score: Math.round(score), appearances: tagAppearances[tag] || 1, totalViews: tagViews[tag] || 0 }))
  const topTags = allTagScores.slice(0, 6).map(t => t.tag)

  pipeline.push({
    id: 'tags',
    title: 'Audience Demand',
    description: `What topics get the most views? Learned from ${competitorVideos.length} competitor videos.`,
    inputCount: competitorVideos.length,
    inputLabel: 'competitor videos',
    outputCount: allTagScores.length,
    outputLabel: 'topics found',
    selected: topTags,
    details: allTagScores.slice(0, 15),
    active: allTagScores.length > 0,
  })

  // ── 2. Winning Patterns: top-performing competitor video topics ──
  // What exact story types get the highest views?
  const compViewCounts = competitorVideos.map(v => Number(v.viewCount) || 0)
  const medianCompViews = median(compViewCounts) || 1
  const topCompVideos = competitorVideos
    .filter(v => (Number(v.viewCount) || 0) >= medianCompViews)
    .sort((a, b) => (Number(b.viewCount) || 0) - (Number(a.viewCount) || 0))
    .slice(0, 5)
  const topCompTopics = topCompVideos
    .map(v => v.analysisResult?.partA?.topic || '')
    .filter(Boolean)

  pipeline.push({
    id: 'patterns',
    title: 'Winning Patterns',
    description: `Story types from the highest-performing competitor videos (>${fmtViews(medianCompViews)} views).`,
    inputCount: topCompVideos.length,
    inputLabel: 'top competitor videos',
    outputCount: topCompTopics.length,
    outputLabel: 'patterns found',
    selected: topCompTopics,
    details: topCompVideos.map(v => ({
      title: v.titleAr || v.titleEn || '—',
      topic: v.analysisResult?.partA?.topic || '',
      views: Number(v.viewCount) || 0,
      channel: v.channel?.nameAr || v.channel?.nameEn || v.channel?.handle || '',
    })),
    active: topCompTopics.length > 0,
  })

  // ── 3. Format preference from competitor data ──
  // Do audiences in this niche prefer shorts or long-form?
  let compShorts = 0
  let compLong = 0
  let compShortsViews = 0
  let compLongViews = 0
  for (const v of competitorVideos) {
    const views = Number(v.viewCount) || 0
    if (v.videoType === 'short') { compShorts++; compShortsViews += views }
    else { compLong++; compLongViews += views }
  }
  const avgShortsViews = compShorts > 0 ? compShortsViews / compShorts : 0
  const avgLongViews = compLong > 0 ? compLongViews / compLong : 0
  const preferShorts = avgShortsViews > avgLongViews * 1.5

  pipeline.push({
    id: 'format',
    title: 'Format Preference',
    description: 'Which format gets more views per video in your niche?',
    inputCount: competitorVideos.length,
    inputLabel: 'competitor videos',
    outputCount: 1,
    outputLabel: preferShorts ? 'Shorts' : 'Long-form',
    selected: [preferShorts ? 'shorts' : 'long'],
    details: {
      shortsCount: compShorts, longCount: compLong,
      avgShortsViews: Math.round(avgShortsViews), avgLongViews: Math.round(avgLongViews),
    },
    active: competitorVideos.length > 0,
  })

  // ── 4. Your Execution: gap wins tell us what YOU do well ──
  const ourViewCounts = ourVideos.map(v => Number(v.viewCount) || 0)
  const medianOurViews = median(ourViewCounts) || 1
  const ourWinTopics = ourVideos
    .filter(v => (Number(v.viewCount) || 0) >= medianOurViews)
    .sort((a, b) => (Number(b.viewCount) || 0) - (Number(a.viewCount) || 0))
    .slice(0, 3)
    .map(v => v.analysisResult?.partA?.topic || '')
    .filter(Boolean)

  pipeline.push({
    id: 'execution',
    title: 'Your Strengths',
    description: 'Topics from your own best-performing videos — what you execute well.',
    inputCount: ourVideos.length,
    inputLabel: 'your videos',
    outputCount: ourWinTopics.length,
    outputLabel: 'strengths found',
    selected: ourWinTopics,
    details: ourVideos
      .sort((a, b) => (Number(b.viewCount) || 0) - (Number(a.viewCount) || 0))
      .slice(0, 5)
      .map(v => ({
        title: v.titleAr || v.titleEn || '—',
        topic: v.analysisResult?.partA?.topic || '',
        views: Number(v.viewCount) || 0,
      })),
    active: ourWinTopics.length > 0,
  })

  // ── 5. Topic Memory tiers ──
  const tier1Topics = topicMemories
    .filter(m =>
      (m.effectiveWeight || m.weight || 0) > 0.5 ||
      ((m.effectiveWeight || m.weight || 0) > 0.3 && (m.velocityScore || 0) > 0)
    )
    .slice(0, 5)
    .map(m => m.topicLabel || m.topicKey)

  const tier2Topics = topicMemories
    .filter(m => (m.demandScore || 0) > 0.6 && (m.effectiveWeight || m.weight || 0) < 0.3)
    .slice(0, 3)
    .map(m => m.topicLabel || m.topicKey)

  const avoidTopics = topicMemories
    .filter(m => (m.weight || 0) < 0.05 && (m.winsCount || 0) > 0)
    .slice(0, 5)
    .map(m => m.topicLabel || m.topicKey)

  pipeline.push({
    id: 'memory',
    title: 'Topic Memory',
    description: 'Topics classified into tiers based on performance weight, velocity, and demand score.',
    inputCount: topicMemories.length,
    inputLabel: 'topics tracked',
    outputCount: tier1Topics.length + tier2Topics.length + avoidTopics.length,
    outputLabel: 'topics classified',
    selected: tier1Topics,
    details: { proven: tier1Topics, demand: tier2Topics, avoid: avoidTopics },
    active: topicMemories.length > 0,
  })

  // ── 6. Build query from all signals ──
  const base = buildDynamicBase(topTags, preferShorts)

  const patternSection = topCompTopics.length
    ? `القصص الأكثر مشاهدة عند المنافسين كانت من هذا النوع — ابحث عن ما يشبهها:\n${topCompTopics.join('\n')}\n\n`
    : ''

  const strengthSection = ourWinTopics.length
    ? `قصصنا الأنجح كانت من هذا النوع — ابحث عن ما يشبهها:\n${ourWinTopics.join('\n')}\n\n`
    : ''

  const memorySection = tier1Topics.length
    ? `موضوعات أثبتت نجاحها — ابحث عن تطورات جديدة فيها:\n${tier1Topics.join('، ')}\n\n`
    : ''

  const demandSection = tier2Topics.length
    ? `فرص لم نغطها والمنافسون حققوا فيها ملايين المشاهدات:\n${tier2Topics.join('، ')}\n\n`
    : ''

  const openSection = openTitles.length
    ? `أولوية — قضايا لم يغطِّها أحد بعد:\n${openTitles.join('\n')}\n\n`
    : ''

  const gapSection = gapWinTitles.length
    ? `ابحث عن قصص مشابهة في النوع والشعور لـ:\n${gapWinTitles.join('\n')}\n(كنا أول من غطاها وحققت أعلى مشاهدات).\n\n`
    : ''

  const passedList = passedHeadlines || []
  const avoidParts = [
    ...(takenTitles.length
      ? [`تجنب تماماً ما يشبه: ${takenTitles.join('، ')} — هذه تم تصويرها.`]
      : []),
    ...(avoidTopics.length
      ? [`تجنب أيضاً: ${avoidTopics.join('، ')} — لم تنجح مع جمهورنا.`]
      : []),
    ...(passedList.length
      ? [`لا نريد قصصاً مثل: ${passedList.join('، ')} — موضوعات لا تناسب القناة.`]
      : []),
  ]
  const avoidSection = avoidParts.length
    ? avoidParts.join('\n') + '\n\n'
    : ''

  const competitorSection = competitorHandles
    ? `لكل قصة: العنوان، ملخص جملتين، رابط المصدر، وهل غطاها أحد من منافسينا (${competitorHandles})؟`
    : `لكل قصة: العنوان، ملخص جملتين، رابط المصدر.`

  const querySections = [
    { id: 'base', label: 'Base + Demand Tags', text: base, color: 'blue', active: true },
    { id: 'pattern', label: 'Competitor Patterns', text: patternSection, color: 'purple', active: !!patternSection },
    { id: 'strength', label: 'Your Strengths', text: strengthSection, color: 'emerald', active: !!strengthSection },
    { id: 'proven', label: 'Proven Topics', text: memorySection, color: 'green', active: !!memorySection },
    { id: 'demand', label: 'Demand Gaps', text: demandSection, color: 'orange', active: !!demandSection },
    { id: 'open', label: 'Open Windows', text: openSection, color: 'cyan', active: !!openSection },
    { id: 'gapwin', label: 'Gap Win Boost', text: gapSection, color: 'green', active: !!gapSection },
    { id: 'avoid', label: 'Avoid Filter', text: avoidSection, color: 'red', active: !!avoidSection },
    { id: 'output', label: 'Output Format', text: competitorSection, color: 'slate', active: true },
  ]

  pipeline.push({
    id: 'assembly',
    title: 'Query Assembly',
    description: 'All signals combined into the final Firecrawl + Claude prompt.',
    inputCount: querySections.filter(s => s.active).length,
    inputLabel: 'active sections',
    outputCount: 1,
    outputLabel: 'final query',
    selected: querySections.filter(s => s.active).map(s => s.label),
    details: querySections,
    active: true,
  })

  const query =
    base + patternSection + strengthSection + memorySection +
    demandSection + openSection + gapSection + avoidSection + competitorSection

  return {
    query,
    meta: {
      version:        'v2-competitor-driven',
      learnedTags:    topTags,
      learnedFormat:  preferShorts ? 'shorts' : 'long',
      tier1Count:     tier1Topics.length,
      tier2Count:     tier2Topics.length,
      avoidCount:     avoidTopics.length,
      patternCount:   topCompTopics.length,
      tier1Topics,
      tier2Topics,
      topCompTopics,
      generatedAt:    new Date().toISOString(),
    },
    pipeline,
    querySections,
  }
}

/**
 * Compute full Brain v2 payload (for GET /api/brain-v2 and for Stories Fetch).
 * @param {string} projectId
 * @returns {Promise<object>} payload with autoSearchQuery, competitorStories, etc.
 */
async function getBrainV2Data(projectId) {
  const requestTime = new Date()
  let debugStage = 'init'

  try {

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
      },
      select: {
        id: true, titleAr: true, titleEn: true, publishedAt: true, viewCount: true, likeCount: true,
        commentCount: true, videoType: true, analysisResult: true,
        channel: { select: { id: true, nameAr: true, nameEn: true, avatarUrl: true } },
      },
      orderBy: { publishedAt: 'desc' },
    })

    debugStage = 'count-video-breakdown'
    const videoCounts = {
      totalInDb: await db.video.count({ where: { channel: { projectId } } }),
      oursTotal: await db.video.count({ where: { channel: { projectId, type: 'ours' } } }),
      oursAnalyzed: ourVideos.length,
      competitorTotal: await db.video.count({ where: { channel: { projectId, type: 'competitor' } } }),
      competitorAnalyzed: competitorVideos.length,
    }

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
        totalViewsRaw: Number(totalViews),
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
      select: { id: true, nameAr: true, nameEn: true, handle: true, avatarUrl: true, nationality: true },
      orderBy: { subscribers: 'desc' },
    })

    const regionHints = [...new Set(
      competitorChannelsRaw.map(ch => ch.nationality).filter(Boolean)
    )].slice(0, 3)
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

    const gapWins = publishedVideos.filter((v) => v.result === 'gap_win').length
    const lateCount = publishedVideos.filter((v) => v.result === 'late').length
    const winRate = publishedVideos.length ? Math.round((gapWins / publishedVideos.length) * 100) : 0

    debugStage = 'learn-from-feedback'
    const feedbackStories = await db.story.findMany({
      where: { projectId, stage: { in: ['omit', 'passed'] } },
      select: { headline: true, sourceUrl: true, stage: true },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    })

    const passedHeadlines = feedbackStories
      .filter(s => s.stage === 'passed')
      .slice(0, 8)
      .map(s => `"${(s.headline || '').slice(0, 50)}"`)
      .filter(h => h.length > 3)

    const omitDomains = [...new Set(
      feedbackStories
        .filter(s => s.stage === 'omit')
        .map(s => {
          try { return new URL(s.sourceUrl).hostname.replace(/^www\./, '') } catch { return null }
        })
        .filter(Boolean)
    )]

    debugStage = 'load-topic-memory'
    const topicMemories = await db.topicMemory.findMany({
      where: { projectId },
      orderBy: { weight: 'desc' },
      take: 50,
    })

    const DECAY_HALF_LIFE = 30
    const nowMs = Date.now()
    const augmentedMemories = topicMemories.map(m => {
      const lastSeen = m.lastSeenAt ? new Date(m.lastSeenAt).getTime() : nowMs
      const daysSince = (nowMs - lastSeen) / 86400000
      const decayFactor = Math.exp(-daysSince / DECAY_HALF_LIFE * Math.LN2)
      return { ...m, effectiveWeight: (m.weight || 0) * decayFactor }
    })
    const memoryByKey = new Map(augmentedMemories.map((m) => [m.topicKey, m]))

    const thirtyDaysAgo = new Date(nowMs - 30 * 86400000)
    const recentEvents = await db.topicMemoryEvent.findMany({
      where: { projectId, occurredAt: { gte: thirtyDaysAgo } },
      select: { topicKey: true, occurredAt: true },
    })
    const sevenDaysAgoMs = nowMs - 7 * 86400000
    const velocityByKey = new Map()
    for (const e of recentEvents) {
      if (!velocityByKey.has(e.topicKey)) velocityByKey.set(e.topicKey, { recent: 0, older: 0 })
      const bucket = velocityByKey.get(e.topicKey)
      const ts = new Date(e.occurredAt).getTime()
      if (ts >= sevenDaysAgoMs) bucket.recent++
      else bucket.older++
    }
    for (const m of augmentedMemories) {
      const vel = velocityByKey.get(m.topicKey)
      m.velocityScore = vel ? vel.recent / (vel.older + 1) : 0
    }

    const { query: autoSearchQuery, meta: dynamicQueryMeta, pipeline: queryPipeline, querySections } = buildDynamicQuery({
      competitorVideos, ourVideos, topicMemories: augmentedMemories, gapWinTitles, openTitles, takenTitles, competitorHandles, passedHeadlines,
    })

    debugStage = 'score-and-rank'
    const maxStoryViews = Math.max(1, ...untouchedStories.map(s => s.totalViewsRaw || 0))
    const scored = untouchedStories.map((s) => {
      const mem = memoryByKey.get(s.id)
      const effectiveWeight = mem ? mem.effectiveWeight : 0
      const normalizedWeight = Math.min(1, effectiveWeight / 2)
      const viewPotential = Math.min(1, (s.totalViewsRaw || 0) / maxStoryViews)
      const freshness = Math.exp(-(s.daysSince || 0) / 7 * Math.LN2)
      const saturationPenalty = Math.log2(1 + (s.competitors?.length || 0)) * 0.10
      const score = Math.round((
        normalizedWeight * 0.25 +
        viewPotential * 0.20 +
        freshness * 0.35 -
        saturationPenalty
      ) * 100) / 100
      const reasons = []
      if (effectiveWeight > 0) reasons.push('winner-like')
      if (freshness > 0.7) reasons.push('fresh')
      if ((s.daysSince || 0) >= 7) reasons.push('closing-fast')
      if (viewPotential > 0.5) reasons.push('high-demand')
      const riskFlags = (s.daysSince || 0) >= 10 ? ['urgent'] : []
      const scoreBreakdown = {
        weight: Math.round(normalizedWeight * 0.25 * 100) / 100,
        viewPotential: Math.round(viewPotential * 0.20 * 100) / 100,
        freshness: Math.round(freshness * 0.35 * 100) / 100,
        saturation: -Math.round(saturationPenalty * 100) / 100,
      }
      return { ...s, score, reasons, riskFlags, scoreBreakdown }
    })
    scored.sort((a, b) => b.score - a.score)
    const rankedOpportunities = scored.slice(0, 5)

  const queryMeta = {
    ...dynamicQueryMeta,
    regionHints,
    omitDomains,
    passedCount: passedHeadlines.length,
    omitCount: omitDomains.length,
    schemaVersion: 2,
    provider: 'internal',
    fallbackReason: null,
  }

  return {
    competitorStories: takenStories,
    untouchedStories,
    publishedVideos,
    competitorChannels,
    competitorActivity,
    autoSearchQuery,
    competitorVideoCount: competitorVideos.length,
    stats: { gapWins, lateCount, winRate, totalCompetitorStories: takenStories.length, untouchedCount: untouchedStories.length },
    rankedOpportunities,
    modelSignals: {
      topicMemoryCount: topicMemories.length,
      learnedTags: dynamicQueryMeta.learnedTags || [],
      learnedFormat: dynamicQueryMeta.learnedFormat || 'long',
      tier1Count: dynamicQueryMeta.tier1Count || 0,
      tier2Count: dynamicQueryMeta.tier2Count || 0,
      avoidCount: dynamicQueryMeta.avoidCount || 0,
      decayHalfLife: DECAY_HALF_LIFE,
    },
    queryMeta,
    queryPipeline,
    querySections,
    videoCounts,
  }

  } catch (err) {
    err._brainStage = debugStage
    throw err
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

function safeBigInt(_key, value) {
  return typeof value === 'bigint' ? Number(value) : value
}

router.get('/', async (req, res) => {
  try {
    const { projectId } = req.query
    if (!projectId) return res.status(400).json({ error: 'projectId required' })
    const data = await getBrainV2Data(projectId)
    await syncUntouchedToStories(projectId, data.untouchedStories)
    const json = JSON.stringify(data, safeBigInt)
    res.setHeader('Content-Type', 'application/json')
    return res.send(json)
  } catch (err) {
    const stage = err._brainStage || 'unknown'
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[brainV2] error at stage=${stage}`, err)
    res.status(500).json({ error: msg, stage, detail: err.stack?.split('\n').slice(0, 3).join(' | ') })
  }
})

router.post('/backfill', async (req, res) => {
  try {
    const { projectId } = req.query
    if (!projectId) return res.status(400).json({ error: 'projectId required' })

    const videos = await db.video.findMany({
      where: {
        channel: { projectId, type: 'ours' },
        analysisResult: { not: null },
        pipelineItem: { is: { stage: 'done', status: 'done' } },
      },
      select: { id: true, titleAr: true, titleEn: true },
      orderBy: { publishedAt: 'asc' },
    })

    if (!videos.length) {
      return res.json({ backfilled: 0, message: 'No analyzed videos found to backfill.' })
    }

    let success = 0
    let failed = 0
    for (const v of videos) {
      try {
        await updateTopicMemoryFromVideo(v.id, projectId)
        success++
      } catch (e) {
        console.warn('[brainV2] backfill failed for', v.id, e.message)
        failed++
      }
    }

    const memoryCount = await db.topicMemory.count({ where: { projectId } })
    res.json({
      backfilled: success,
      failed,
      total: videos.length,
      topicMemoryCount: memoryCount,
      message: `Backfilled ${success}/${videos.length} videos. ${memoryCount} topics now in memory.`,
    })
  } catch (err) {
    console.error('[brainV2] backfill error', err)
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
  }
})

module.exports = router
module.exports.getBrainV2Data = getBrainV2Data
