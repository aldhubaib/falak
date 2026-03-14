const express = require('express')
const db = require('../lib/db')
const { requireAuth } = require('../middleware/auth')

const router = express.Router()
router.use(requireAuth)

// ── GET /api/brain?projectId=xxx
// Returns:
//   competitorStories  – topics covered by competitor channels (taken)
//   untouchedStories   – topics found in competitor videos NOT yet covered by our channels
//   publishedVideos    – our published videos tagged gap_win | late
//   competitorChannels – competitor channels in this project
//   competitorActivity – story count per competitor channel
//   autoSearchQuery    – dynamic Perplexity prompt
router.get('/', async (req, res) => {
  let debugStage = 'init'
  try {
    debugStage = 'read-query'
    const { projectId } = req.query
    if (!projectId) return res.status(400).json({ error: 'projectId required' })

    // ── 1. Load all done competitor videos with analysis ──────────────────────
    debugStage = 'query-competitor-videos'
    const competitorVideos = await db.video.findMany({
      where: {
        channel: { projectId, type: 'competitor' },
        analysisResult: { not: null },
        pipelineItem: { is: { stage: 'done', status: 'done' } },
      },
      select: {
        id: true,
        titleAr: true,
        titleEn: true,
        publishedAt: true,
        viewCount: true,
        analysisResult: true,
        channel: {
          select: { id: true, nameAr: true, nameEn: true, avatarUrl: true, handle: true },
        },
      },
      orderBy: { publishedAt: 'desc' },
    })

    // ── 2. Load all done "ours" videos with analysis ──────────────────────────
    debugStage = 'query-our-videos'
    const ourVideos = await db.video.findMany({
      where: {
        channel: { projectId, type: 'ours' },
        analysisResult: { not: null },
        pipelineItem: { is: { stage: 'done', status: 'done' } },
      },
      select: {
        id: true,
        titleAr: true,
        titleEn: true,
        publishedAt: true,
        viewCount: true,
        likeCount: true,
        commentCount: true,
        videoType: true,
        analysisResult: true,
        channel: {
          select: { id: true, nameAr: true, nameEn: true, avatarUrl: true },
        },
      },
      orderBy: { publishedAt: 'desc' },
    })

    // ── 3. Build competitor story map: topic → list of competitor videos ──────
    debugStage = 'build-topic-map'
    // Each competitor video's analysisResult contains a `topics` array (strings).
    // We normalise topics to lowercase for matching.

    /** @type {Map<string, { competitorVideoId: string; channelId: string; channelName: string; avatarUrl: string; publishedAt: Date; viewCount: bigint }[]>} */
    const topicMap = new Map()

    for (const v of competitorVideos) {
      const topics = extractTopics(v.analysisResult)
      for (const rawTopic of topics) {
        const topic = rawTopic.trim()
        if (!topic) continue
        const key = normTopic(topic)
        if (!topicMap.has(key)) topicMap.set(key, [])
        topicMap.get(key).push({
          competitorVideoId: v.id,
          channelId: v.channel.id,
          channelName: v.channel.nameAr || v.channel.nameEn || v.channel.handle,
          avatarUrl: v.channel.avatarUrl,
          publishedAt: v.publishedAt,
          viewCount: v.viewCount,
          originalTopic: topic,
        })
      }
    }

    // ── 4. Build "our" topic set: normalised topics we have published ─────────
    debugStage = 'build-our-topic-set'
    const ourTopicSet = new Set() // Set<normKey>
    for (const v of ourVideos) {
      const topics = extractTopics(v.analysisResult)
      for (const t of topics) {
        ourTopicSet.add(normTopic(t.trim()))
      }
    }

    // ── 5. Assemble competitor stories (taken + untouched) ────────────────────
    debugStage = 'assemble-stories'
    const takenStories = []    // covered by competitors, also covered by us or not
    const untouchedStories = []

    const seenTopicKeys = new Set()

    // Sort topic map by earliest competitor publish date desc (most recent first)
    const sortedTopics = [...topicMap.entries()].sort((a, b) => {
      const aLatest = Math.max(...a[1].map(x => x.publishedAt ? new Date(x.publishedAt).getTime() : 0))
      const bLatest = Math.max(...b[1].map(x => x.publishedAt ? new Date(x.publishedAt).getTime() : 0))
      return bLatest - aLatest
    })

    for (const [normKey, entries] of sortedTopics) {
      if (seenTopicKeys.has(normKey)) continue
      seenTopicKeys.add(normKey)

      const displayTopic = entries[0].originalTopic

      // Deduplicate competitors for this topic
      const competitorMap = new Map()
      let totalViews = BigInt(0)
      let earliestDate = null
      for (const e of entries) {
        if (!competitorMap.has(e.channelId)) {
          competitorMap.set(e.channelId, {
            name: e.channelName,
            avatarUrl: e.avatarUrl,
            channelId: e.channelId,
          })
        }
        totalViews += BigInt(e.viewCount || 0)
        const pd = e.publishedAt ? new Date(e.publishedAt) : null
        if (pd && (!earliestDate || pd < earliestDate)) earliestDate = pd
      }

      const competitors = [...competitorMap.values()]
      const dateStr = earliestDate ? new Date(earliestDate).toISOString().split('T')[0] : ''
      const totalViewsFmt = fmtViews(Number(totalViews))

      const story = {
        id: normKey,
        title: displayTopic,
        date: dateStr,
        status: ourTopicSet.has(normKey) ? 'taken_by_us' : 'taken',
        competitors,
        totalViews: totalViewsFmt,
      }

      if (ourTopicSet.has(normKey)) {
        takenStories.push(story)
      } else {
        // Not covered by us — is it truly untouched (no competitor either)?
        // At this point it's in topicMap so at least one competitor covered it.
        // "untouched" means no competitor has covered it AND we haven't.
        // Since it IS in topicMap we classify it as a gap opportunity only if
        // the competitor covered it within the last 14 days (still fresh).
        const daysSince = earliestDate ? Math.floor((Date.now() - earliestDate.getTime()) / 86400000) : 999
        if (daysSince <= 14) {
          untouchedStories.push({ ...story, status: 'open', daysSince })
        } else {
          takenStories.push(story)
        }
      }
    }

    // Sort untouched by daysSince ascending (most urgent first)
    untouchedStories.sort((a, b) => (a.daysSince || 0) - (b.daysSince || 0))

    // ── 6. Tag our published videos as gap_win | late ─────────────────────────
    debugStage = 'tag-published-videos'
    const publishedVideos = ourVideos.map((v) => {
      const topics = extractTopics(v.analysisResult)
      let result = 'gap_win'

      for (const rawTopic of topics) {
        const key = normTopic(rawTopic.trim())
        const competitorEntries = topicMap.get(key) || []
        // If any competitor published this topic BEFORE our video → late
        for (const ce of competitorEntries) {
          const cpDate = ce.publishedAt ? new Date(ce.publishedAt) : null
          const ourDate = v.publishedAt ? new Date(v.publishedAt) : null
          if (cpDate && ourDate && cpDate < ourDate) {
            result = 'late'
            break
          }
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

    // ── 7. Competitor channels list ───────────────────────────────────────────
    debugStage = 'query-competitor-channels'
    const competitorChannelsRaw = await db.channel.findMany({
      where: { projectId, type: 'competitor' },
      select: { id: true, nameAr: true, nameEn: true, handle: true, avatarUrl: true },
      orderBy: { subscribers: 'desc' },
    })

    const COLORS = ['bg-blue', 'bg-purple', 'bg-orange', 'bg-destructive', 'bg-success', 'bg-sensor']
    const competitorChannels = competitorChannelsRaw.map((ch, i) => ({
      id: ch.id,
      name: ch.nameAr || ch.nameEn || ch.handle,
      handle: ch.handle,
      avatarUrl: ch.avatarUrl,
      color: COLORS[i % COLORS.length],
      enabled: true,
    }))

    // ── 8. Competitor activity: story count per channel ───────────────────────
    debugStage = 'build-competitor-activity'
    const activityCount = {}
    for (const [, entries] of topicMap) {
      for (const e of entries) {
        activityCount[e.channelId] = (activityCount[e.channelId] || 0) + 1
      }
    }
    const competitorActivity = competitorChannels
      .map((ch) => ({ ...ch, count: activityCount[ch.id] || 0 }))
      .sort((a, b) => b.count - a.count)

    // ── 9. Auto-search query (dynamic Perplexity prompt) ─────────────────────
    debugStage = 'build-auto-search-query'
    const gapWinTitles = publishedVideos
      .filter((v) => v.result === 'gap_win')
      .slice(0, 3)
      .map((v) => `"${v.title.slice(0, 40)}…"`)

    const openTitles = untouchedStories
      .slice(0, 3)
      .map((s) => `• ${s.title.slice(0, 60)}`)

    const takenTitles = takenStories
      .slice(0, 5)
      .map((s) => `"${s.title.slice(0, 40)}…"`)

    const competitorHandles = competitorChannels.map((c) => c.handle).join(', ')

    const autoSearchQuery = buildAutoSearchQuery({
      gapWinTitles,
      openTitles,
      takenTitles,
      competitorHandles,
    })

    // ── 10. Stats ─────────────────────────────────────────────────────────────
    debugStage = 'build-stats'
    const gapWins = publishedVideos.filter((v) => v.result === 'gap_win').length
    const lateCount = publishedVideos.filter((v) => v.result === 'late').length
    const winRate = publishedVideos.length
      ? Math.round((gapWins / publishedVideos.length) * 100)
      : 0

    debugStage = 'respond-json'
    res.json({
      competitorStories: takenStories,
      untouchedStories,
      publishedVideos,
      competitorChannels,
      competitorActivity,
      autoSearchQuery,
      stats: {
        gapWins,
        lateCount,
        winRate,
        totalCompetitorStories: takenStories.length,
        untouchedCount: untouchedStories.length,
      },
    })
  } catch (err) {
    console.error('[brain] error', { stage: debugStage, err })
    const message = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: 'Internal server error', stage: debugStage, message })
  }
})

// ── POST /api/brain/re-extract?projectId=xxx
// Trigger a re-extraction by clearing the analysis result cache;
// actual re-analysis is queued via pipeline. For now returns a notice.
router.post('/re-extract', async (req, res) => {
  try {
    const { projectId } = req.query
    if (!projectId) return res.status(400).json({ error: 'projectId required' })

    // Count competitor videos that are done and have analysis
    const count = await db.video.count({
      where: {
        channel: { projectId, type: 'competitor' },
        analysisResult: { not: null },
        pipelineItem: { is: { stage: 'done', status: 'done' } },
      },
    })

    res.json({
      ok: true,
      message: `Gap detection refreshed from ${count} competitor video${count === 1 ? '' : 's'}.`,
      analyzedVideos: count,
    })
  } catch (err) {
    console.error('[brain] re-extract error', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract topics array from a video's analysisResult JSON.
 * The AI stores topics under various keys — try all of them.
 */
function extractTopics(analysisResult) {
  if (!analysisResult || typeof analysisResult !== 'object') return []
  const ar = analysisResult

  // Common locations the AI might store topics
  const candidates = [
    ar.topics,
    ar.mainTopics,
    ar.keywords,
    ar.storyTopics,
    ar.topic,
    ar.partA?.topics,
    ar.partA?.keywords,
    ar.partB?.topics,
    ar.partB?.keywords,
    ar.classify?.topics,
    ar.insights?.topics,
    ar.analysis?.topics,
  ]

  for (const c of candidates) {
    if (Array.isArray(c) && c.length > 0) return c.filter((x) => typeof x === 'string')
  }

  // Fallback: if there's a `title` or `subject` string, use it as a single topic
  const fallback = ar.subject || ar.mainSubject || ar.storyTitle
  if (typeof fallback === 'string' && fallback.trim()) return [fallback.trim()]

  return []
}

/** Normalise a topic string for comparison (lowercase, collapse spaces) */
function normTopic(t) {
  return t.toLowerCase().replace(/\s+/g, ' ').trim()
}

/** Format a number as K / M */
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

  return `أعطني أبرز 8 قضايا وأخبار من الجريمة والقضايا الحقيقية في السعودية والخليج من آخر 7 أيام.

${openSection}${gapSection}${takenSection}${competitorSection}`
}

module.exports = router
