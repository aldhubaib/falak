const express = require('express')
const db = require('../lib/db')
const { requireAuth, requireRole } = require('../middleware/auth')
const { decrypt } = require('../services/crypto')
const { fetchArticleText } = require('../services/articleFetcher')
const { scrapeUrl, preClean } = require('../services/firecrawl')
const { callAnthropic, callAnthropicStream } = require('../services/pipelineProcessor')
const { getDialectForCountry } = require('../lib/dialects')
const { fetchTranscript } = require('../services/transcript')
const { transcribeFromR2 } = require('../services/whisper')
const { fetchVideoMetadata, isYouTubeShort } = require('../services/youtube')
const { computeSimpleComposite, SIMPLE_COMPOSITE, finalScoreToComposite } = require('../lib/scoringConfig')
const { getNicheEmbedding } = require('../services/embeddings')

// Run script generation in background (non-streaming). Can be invoked when moving to scripting.
async function generateScriptForStory(storyId) {
  const story = await db.story.findUniqueOrThrow({
    where: { id: storyId },
  })
  const apiKeyRow = await db.apiKey.findUnique({ where: { service: 'anthropic' } })
  if (!apiKeyRow?.encryptedKey) return
  const brief = (story.brief && typeof story.brief === 'object') ? { ...story.brief } : {}
  const articleContent = typeof brief.articleContent === 'string' && brief.articleContent !== '__SCRAPE_FAILED__' && brief.articleContent !== '__YOUTUBE__' ? brief.articleContent : ''
  if (!articleContent || !articleContent.trim()) return
  const channelId = brief.channelId
  if (!channelId) return
  const channel = await db.channel.findFirst({
    where: { id: channelId },
    select: { id: true, startHook: true, endHook: true, nationality: true },
  })
  if (!channel) return
  const durationMinutes = Math.max(0.5, parseFloat(brief.scriptDuration) || 3)
  const isShort = durationMinutes <= 3
  const startHook = (channel.startHook || '').trim()
  const endHook = (channel.endHook || '').trim()
  const dialect = await getDialectForCountry(channel.nationality)
  const dialectInstruction = dialect
    ? `Write the script in ${dialect.long} (${dialect.short}). Use natural spoken ${dialect.short} — not formal Modern Standard Arabic.`
    : 'Write the script in Arabic.'
  const apiKey = decrypt(apiKeyRow.encryptedKey)
  const durationInstruction = isShort
    ? `The script must be about ${durationMinutes} minute(s) of speaking time (approximately ${Math.round(durationMinutes * 150)} words). Include timestamps every 15–30 seconds (e.g. 0:00, 0:15, 0:30, 1:00).`
    : `The script must be about ${durationMinutes} minutes of speaking time (approximately ${Math.round(durationMinutes * 150)} words). Include timestamps at logical section breaks (e.g. 0:00, 1:00, 5:00, 10:00).`
  const hookStartBlock = startHook
    ? `Then the branded channel hook (output this line exactly as-is):\n${startHook}`
    : ''
  const hookEndBlock = endHook
    ? `End the script with the branded channel sign-off (output this line exactly as-is):\n${endHook}`
    : ''
  const system = `You are an expert Arabic YouTube scriptwriter. ${dialectInstruction}

Output ONLY a structured script using exactly these section headers (each on its own line). No other text or explanations.

## TITLE
(one line: suggested video title)

## SCRIPT
Write the full script as one continuous flow with timestamps. The structure MUST be:

1. **Opening hook** (0:00) — a compelling 10-second hook that grabs attention immediately.
${hookStartBlock ? `2. **Branded hook** — ${hookStartBlock}` : ''}
3. **Main body** — the core content with timestamps every 15–30 seconds.
${hookEndBlock ? `4. **Branded sign-off** — ${hookEndBlock}` : ''}

${durationInstruction}
Use timestamp format like 0:00 ... then 0:15 ... then 0:30 ... etc.

## HASHTAGS
(5–15 relevant YouTube tags, comma-separated, WITHOUT the # symbol. Mix of Arabic and English tags for SEO.)`

  let userMessage = `Article to turn into a ${isShort ? `short video (~${durationMinutes} min)` : `${durationMinutes}-minute video`} script:\n\n${articleContent.slice(0, 120000)}`

  if (brief.research) {
    const researchParts = []
    if (brief.research.briefAr || brief.research.brief) researchParts.push(brief.research.briefAr || brief.research.brief)
    if (brief.research.competitionInsight) researchParts.push(`Competition Insight: ${brief.research.competitionInsight}`)
    if (brief.research.keyFacts && Array.isArray(brief.research.keyFacts)) {
      researchParts.push(`Key Facts:\n${brief.research.keyFacts.map(f => `- ${f}`).join('\n')}`)
    }
    if (researchParts.length) userMessage += `\n\n--- RESEARCH BRIEF ---\n${researchParts.join('\n\n')}`
  }
  if (brief.summary) userMessage += `\n\n--- SUMMARY ---\n${brief.summary}`
  if (brief.uniqueAngle) userMessage += `\n\n--- UNIQUE ANGLE ---\n${brief.uniqueAngle}`

  let fullScript = ''
  try {
    fullScript = await callAnthropic(apiKey, 'claude-sonnet-4-6', [{ role: 'user', content: userMessage }], {
      system,
      maxTokens: 8192,
      channelId: story.channelId,
      action: 'Story Generate Script',
    })
  } catch (err) {
    console.error('[stories/generateScriptForStory]', storyId, err?.message)
    return
  }
  const parsed = parseStructuredScript(fullScript)
  const newBrief = {
    ...brief,
    suggestedTitle: parsed.suggestedTitle || brief.suggestedTitle,
    script: parsed.script || brief.script,
    youtubeTags: parsed.youtubeTags.length > 0 ? parsed.youtubeTags : brief.youtubeTags,
    scriptDuration: durationMinutes,
    scriptRaw: (fullScript || '').trim() || brief.scriptRaw,
  }
  await db.story.update({
    where: { id: storyId },
    data: { brief: newBrief, stage: 'scripting' },
  })
}
const router = express.Router()
router.use(requireAuth)

// ── POST /api/stories/fetch — legacy fetch removed
router.post('/fetch', requireRole('owner', 'admin', 'editor'), async (req, res) => {
  res.status(410).json({
    error: 'Legacy story fetch has been removed. Use Source or Article Pipeline to ingest articles instead.',
  })
})

// ── GET /api/stories?channelId=xxx&stage=xxx
router.get('/', async (req, res) => {
  try {
    const { channelId, stage, origin } = req.query
    const where = {}
    if (channelId) where.channelId = channelId
    if (stage)     where.stage = stage
    if (origin)    where.origin = origin

    const slim = req.query.slim === 'true'
    const selectFields = {
      id: true, headline: true, stage: true, compositeScore: true,
      relevanceScore: true, viralScore: true, firstMoverScore: true,
      coverageStatus: true, sourceName: true, sourceDate: true,
      sourceUrl: true, createdAt: true, updatedAt: true,
      channelId: true, origin: true,
    }
    if (!slim) selectFields.brief = true

    const stories = await db.story.findMany({
      where,
      select: selectFields,
      orderBy: [
        { compositeScore: 'desc' },
        { createdAt: 'desc' }
      ],
      take: 500,
    })
    res.json(stories)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── GET /api/stories/summary?channelId=xxx
router.get('/summary', async (req, res) => {
  try {
    const { channelId } = req.query
    const where = channelId ? { channelId } : {}

    const [stageCounts, coverageCounts, totalCount] = await Promise.all([
      db.story.groupBy({ by: ['stage'], where, _count: true }),
      db.story.groupBy({ by: ['coverageStatus'], where, _count: true }),
      db.story.count({ where }),
    ])

    const stages = ['suggestion', 'liked', 'scripting', 'filmed', 'publish', 'done', 'skip', 'trash']
    const counts = {}
    for (const s of stages) counts[s] = 0
    for (const row of stageCounts) counts[row.stage] = row._count

    const firstMovers = coverageCounts.find(r => r.coverageStatus === 'first')?._count || 0
    const firstMoverPct = totalCount ? Math.round(firstMovers / totalCount * 100) : 0

    res.json({ total: totalCount, ...counts, firstMovers, firstMoverPct })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── POST /api/stories/rescore-all — re-score all active stories using niche embedding
router.post('/rescore-all', requireRole('owner', 'admin', 'editor'), async (req, res) => {
  try {
    const { channelId } = req.body
    if (!channelId) return res.status(400).json({ error: 'channelId is required' })

    const nicheVec = await getNicheEmbedding(channelId)
    if (!nicheVec) return res.status(400).json({ error: 'No niche embedding — generate it first in Channel settings' })

    const rows = await db.$queryRaw`
      SELECT id, embedding::text as embedding
      FROM "Story"
      WHERE "channelId" = ${channelId}
        AND stage IN ('suggestion','liked','scripting','filmed','publish')
        AND embedding IS NOT NULL
    `

    const updates = []
    for (const row of rows) {
      const storyEmbedding = JSON.parse(row.embedding)
      let nicheScore = 0
      for (let i = 0; i < storyEmbedding.length; i++) {
        nicheScore += storyEmbedding[i] * nicheVec[i]
      }
      nicheScore = Math.max(0, Math.min(1, nicheScore))
      const finalScore = Math.round(nicheScore * 100) / 100
      const compositeScore = finalScoreToComposite(nicheScore)
      updates.push(db.story.update({
        where: { id: row.id },
        data: { compositeScore, finalScore, lastRescoredAt: new Date() },
      }))
    }

    if (updates.length > 0) await db.$transaction(updates)
    res.json({ ok: true, updated: updates.length })
  } catch (e) {
    console.error('[stories/rescore-all]', e?.message || e)
    res.status(500).json({ error: e.message || 'Rescore failed' })
  }
})

// ── POST /api/stories/:id/rescore — re-score a single story using niche embedding
router.post('/:id/rescore', requireRole('owner', 'admin', 'editor'), async (req, res) => {
  try {
    const rows = await db.$queryRaw`
      SELECT id, "channelId", "compositeScore", "finalScore", embedding::text as embedding
      FROM "Story" WHERE id = ${req.params.id}
    `
    const story = rows?.[0]
    if (!story) return res.status(404).json({ error: 'Story not found' })

    const nicheVec = await getNicheEmbedding(story.channelId)
    if (!nicheVec) return res.status(400).json({ error: 'No niche embedding — generate it first in Channel settings' })

    if (!story.embedding) return res.status(400).json({ error: 'Story has no embedding yet' })
    const storyEmbedding = JSON.parse(story.embedding)

    let nicheScore = 0
    for (let i = 0; i < storyEmbedding.length; i++) {
      nicheScore += storyEmbedding[i] * nicheVec[i]
    }
    nicheScore = Math.max(0, Math.min(1, nicheScore))

    const finalScore = Math.round(nicheScore * 100) / 100
    const compositeScore = finalScoreToComposite(nicheScore)

    await db.story.update({
      where: { id: story.id },
      data: { compositeScore, finalScore, lastRescoredAt: new Date() },
    })

    res.json({ ok: true, compositeScore, finalScore, nicheScore })
  } catch (e) {
    console.error('[stories/rescore]', req.params.id, e?.message || e)
    res.status(500).json({ error: e.message || 'Rescore failed' })
  }
})

// ── POST /api/stories/:id/fetch-article — fetch sourceUrl and store full article text in brief.articleContent
router.post('/:id/fetch-article', requireRole('owner', 'admin', 'editor'), async (req, res) => {
  try {
    const story = await db.story.findUniqueOrThrow({
      where: { id: req.params.id },
    })
    const brief = (story.brief && typeof story.brief === 'object') ? { ...story.brief } : {}

    const isYouTube = story.sourceUrl &&
      (story.sourceUrl.includes('youtube.com') || story.sourceUrl.includes('youtu.be'))
    if (isYouTube) {
      await db.story.update({
        where: { id: story.id },
        data: { brief: { ...brief, articleContent: '__YOUTUBE__' } },
      })
      return res.json({ articleContent: '__YOUTUBE__' })
    }

    const forceRefetch = req.body?.force === true
    if (!forceRefetch && brief.articleContent && brief.articleContent !== '__SCRAPE_FAILED__') {
      return res.json({ articleContent: brief.articleContent })
    }
    const url = story.sourceUrl || brief.sourceUrl
    if (!url) {
      await db.story.update({
        where: { id: story.id },
        data: { brief: { ...brief, articleContent: '__SCRAPE_FAILED__' } },
      })
      return res.json({ articleContent: '__SCRAPE_FAILED__' })
    }

    let result = null
    const firecrawlKeyRow = await db.apiKey.findUnique({ where: { service: 'firecrawl' } })
    if (firecrawlKeyRow?.encryptedKey) {
      try {
        const apiKey = decrypt(firecrawlKeyRow.encryptedKey)
        result = await scrapeUrl(apiKey, url)
      } catch (_) {
        result = { error: 'Firecrawl key invalid' }
      }
    }
    if (!result || result.error) {
      try {
        result = await fetchArticleText(url)
      } catch (err) {
        result = { error: err.message || 'Fetch failed' }
      }
    }
    if (result.error || !result.text || result.text.trim().length < 100) {
      brief.articleContent = '__SCRAPE_FAILED__'
    } else {
      brief.articleContent = preClean(result.text)
    }

    await db.story.update({
      where: { id: story.id },
      data: { brief },
    })
    res.json({ articleContent: brief.articleContent })
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Story not found' })
    res.status(500).json({ error: e.message })
  }
})

// Parse structured script output into brief fields. Sections: ## TITLE, ## SCRIPT, ## HASHTAGS
function parseStructuredScript(text) {
  const raw = (text || '').trim()
  const sections = {}
  const sectionNames = ['TITLE', 'SCRIPT', 'HASHTAGS']
  let currentKey = null
  let currentLines = []
  for (const line of raw.split('\n')) {
    const match = line.match(/^##\s*(.+?)\s*$/i)
    if (match) {
      const key = match[1].toUpperCase().replace(/[\s-]+/g, '_').replace(/_+/g, '_')
      if (sectionNames.includes(key)) {
        if (currentKey) sections[currentKey] = currentLines.join('\n').trim()
        currentKey = key
        currentLines = []
        continue
      }
    }
    if (currentKey) currentLines.push(line)
  }
  if (currentKey) sections[currentKey] = currentLines.join('\n').trim()

  const hashtagRaw = sections.HASHTAGS || ''
  const youtubeTags = hashtagRaw
    .split(/[\s,،\n]+/)
    .map(t => t.replace(/^#/, '').trim())
    .filter(t => t.length > 0 && t.length <= 100)
    .slice(0, 15)

  return {
    suggestedTitle: sections.TITLE || '',
    script: sections.SCRIPT || raw,
    youtubeTags,
  }
}

// ── POST /api/stories/:id/generate-script — AI: full script (title, hooks, script with timestamps). Requires channelId for branded hooks.
// Body: durationMinutes (number), articleText, channelId (required).
router.post('/:id/generate-script', requireRole('owner', 'admin', 'editor'), async (req, res) => {
  try {
    const story = await db.story.findUniqueOrThrow({
      where: { id: req.params.id },
    })
    const anthropicKeyRow = await db.apiKey.findUnique({ where: { service: 'anthropic' } })
    if (!anthropicKeyRow?.encryptedKey) {
      return res.status(400).json({ error: 'Anthropic API key not set. Add it in Settings → API Keys.' })
    }
    const brief = (story.brief && typeof story.brief === 'object') ? { ...story.brief } : {}
    const fromBody = typeof req.body?.articleText === 'string' ? req.body.articleText.trim() : ''
    const fromBrief = typeof brief.articleContent === 'string' ? brief.articleContent : ''
    const articleContent = fromBody || (fromBrief !== '__SCRAPE_FAILED__' && fromBrief !== '__YOUTUBE__' ? fromBrief : '')
    if (!articleContent || articleContent === '__SCRAPE_FAILED__' || articleContent === '__YOUTUBE__') {
      return res.status(400).json({ error: 'No article content. Fetch and optionally clean the article first.' })
    }
    const channelId = req.body?.channelId || brief.channelId
    if (!channelId) {
      return res.status(400).json({ error: 'Select a channel in Assign to Channel to generate a script with branded hooks.' })
    }
    const channel = await db.channel.findFirst({
      where: { id: channelId },
      select: { id: true, startHook: true, endHook: true, nationality: true },
    })
    if (!channel) {
      return res.status(400).json({ error: 'Channel not found.' })
    }
    const durationMinutes = Math.max(0.5, parseFloat(req.body?.durationMinutes) || 3)
    const startHook = (channel.startHook || '').trim()
    const endHook = (channel.endHook || '').trim()

    const dialect = await getDialectForCountry(channel.nationality)
    const dialectInstruction = dialect
      ? `Write the script in ${dialect.long} (${dialect.short}). Use natural spoken ${dialect.short} — not formal Modern Standard Arabic.`
      : 'Write the script in Arabic.'

    const apiKey = decrypt(anthropicKeyRow.encryptedKey)
    const isShort = durationMinutes <= 3
    const durationInstruction = isShort
      ? `The script must be about ${durationMinutes} minute(s) of speaking time (approximately ${Math.round(durationMinutes * 150)} words). Include timestamps every 15–30 seconds (e.g. 0:00, 0:15, 0:30, 1:00).`
      : `The script must be about ${durationMinutes} minutes of speaking time (approximately ${Math.round(durationMinutes * 150)} words). Include timestamps at logical section breaks (e.g. 0:00, 1:00, 5:00, 10:00).`
    const hookStartBlock = startHook
      ? `Then the branded channel hook (output this line exactly as-is):\n${startHook}`
      : ''
    const hookEndBlock = endHook
      ? `End the script with the branded channel sign-off (output this line exactly as-is):\n${endHook}`
      : ''
    const system = `You are an expert Arabic YouTube scriptwriter. ${dialectInstruction}

Output ONLY a structured script using exactly these section headers (each on its own line). No other text or explanations.

## TITLE
(one line: suggested video title)

## SCRIPT
Write the full script as one continuous flow with timestamps. The structure MUST be:

1. **Opening hook** (0:00) — a compelling 10-second hook that grabs attention immediately.
${hookStartBlock ? `2. **Branded hook** — ${hookStartBlock}` : ''}
3. **Main body** — the core content with timestamps every 15–30 seconds.
${hookEndBlock ? `4. **Branded sign-off** — ${hookEndBlock}` : ''}

${durationInstruction}
Use timestamp format like 0:00 ... then 0:15 ... then 0:30 ... etc.

## HASHTAGS
(5–15 relevant YouTube tags, comma-separated, WITHOUT the # symbol. Mix of Arabic and English tags for SEO.)`

    let userMessage = `Article to turn into a ${isShort ? `short video (~${durationMinutes} min)` : `${durationMinutes}-minute video`} script:\n\n${articleContent.slice(0, 120000)}`

    if (brief.research) {
      const researchParts = []
      if (brief.research.briefAr || brief.research.brief) researchParts.push(brief.research.briefAr || brief.research.brief)
      if (brief.research.competitionInsight) researchParts.push(`Competition Insight: ${brief.research.competitionInsight}`)
      if (brief.research.keyFacts && Array.isArray(brief.research.keyFacts)) {
        researchParts.push(`Key Facts:\n${brief.research.keyFacts.map(f => `- ${f}`).join('\n')}`)
      }
      if (researchParts.length) userMessage += `\n\n--- RESEARCH BRIEF ---\n${researchParts.join('\n\n')}`
    }
    if (brief.summary) userMessage += `\n\n--- SUMMARY ---\n${brief.summary}`
    if (brief.uniqueAngle) userMessage += `\n\n--- UNIQUE ANGLE ---\n${brief.uniqueAngle}`

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('X-Accel-Buffering', 'no')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders?.()

    let fullScript = ''
    try {
      for await (const chunk of callAnthropicStream(apiKey, 'claude-sonnet-4-6', [{ role: 'user', content: userMessage }], {
        system,
        maxTokens: 8192,
        channelId: story.channelId,
        action: 'Story Generate Script',
      })) {
        fullScript += chunk
        res.write(`data: ${JSON.stringify({ delta: { text: chunk } })}\n\n`)
        if (typeof res.flush === 'function') res.flush()
      }
    } catch (streamErr) {
      console.error('[stories/generate-script]', streamErr)
      res.write(`data: ${JSON.stringify({ error: streamErr.message || 'Stream failed' })}\n\n`)
      res.end()
      return
    }

    const parsed = parseStructuredScript(fullScript)
    const newBrief = {
      ...brief,
      suggestedTitle: parsed.suggestedTitle || brief.suggestedTitle,
      script: parsed.script || brief.script,
      youtubeTags: parsed.youtubeTags.length > 0 ? parsed.youtubeTags : brief.youtubeTags,
      scriptDuration: durationMinutes,
      scriptRaw: fullScript.trim() || brief.scriptRaw,
    }
    await db.story.update({
      where: { id: story.id },
      data: { brief: newBrief },
    })
    res.write('data: [DONE]\n\n')
    res.end()
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Story not found' })
    console.error('[stories/generate-script]', e)
    res.status(500).json({ error: e.message || 'Generate script failed' })
  }
})

// ── POST /api/stories/:id/cleanup — AI clean scraped articleContent (remove nav, junk, format as markdown)
router.post('/:id/cleanup', requireRole('owner', 'admin', 'editor'), async (req, res) => {
  try {
    const story = await db.story.findUniqueOrThrow({
      where: { id: req.params.id },
    })
    const cleanupKeyRow = await db.apiKey.findUnique({ where: { service: 'anthropic' } })
    if (!cleanupKeyRow?.encryptedKey) {
      return res.status(400).json({ error: 'Anthropic API key not set. Add it in Settings → API Keys to use Clean up.' })
    }
    const brief = (story.brief && typeof story.brief === 'object') ? story.brief : {}
    if (brief.articleContent === '__YOUTUBE__') {
      return res.json(story)
    }
    if (!brief.articleContent || brief.articleContent === '__SCRAPE_FAILED__') {
      return res.json(story)
    }
    const articleContent = typeof brief.articleContent === 'string' ? brief.articleContent : ''
    if (!articleContent.trim()) {
      return res.status(400).json({ error: 'No article content to clean. Fetch the article first (e.g. from source URL).' })
    }
    const apiKey = decrypt(cleanupKeyRow.encryptedKey)

    const system = `You are a text editor and translator. The user will give you a raw scraped article.
Your job:
- Extract and preserve ONLY the actual article/news content
- Remove all URLs, markdown links, image tags, navigation text, language selectors, cookie banners, and any other UI chrome
- Fix grammar and formatting
- Translate the ENTIRE article into Arabic (if it is already in Arabic, just clean it up)
- Do NOT summarize — output the full article length
- Output plain prose only, no markdown, no bullet points
- Keep proper nouns, names, places, and technical terms transliterated naturally into Arabic`

    const trimmedInput = preClean(articleContent)
    const raw = await callAnthropic(apiKey, 'claude-sonnet-4-6', [{ role: 'user', content: trimmedInput }], {
      system,
      maxTokens: 8000,
      channelId: story.channelId,
      action: 'Story Cleanup',
    })
    const cleanedArticle = (raw && typeof raw === 'string') ? raw.trim() : articleContent
    const newBrief = { ...brief, articleContent: cleanedArticle }

    const updated = await db.story.update({
      where: { id: story.id },
      data: { brief: newBrief },
    })
    await addLog(story.id, req.user.id, 'note', 'AI cleanup applied')
    res.json(updated)
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Story not found' })
    console.error('[stories/cleanup]', e)
    res.status(500).json({ error: e.message || 'Cleanup failed' })
  }
})

// ── POST /api/stories/:id/fetch-subtitles — fetch YouTube transcript and convert to SRT
router.post('/:id/fetch-subtitles', requireRole('owner', 'admin', 'editor'), async (req, res) => {
  try {
    const story = await db.story.findUniqueOrThrow({
      where: { id: req.params.id },
    })
    const ytTranscriptKeyRow = await db.apiKey.findUnique({ where: { service: 'yt_transcript' } })
    if (!ytTranscriptKeyRow?.encryptedKey) {
      return res.status(400).json({ error: 'YouTube Transcript API key not configured. Add it in Settings → API Keys.' })
    }
    const brief = (story.brief && typeof story.brief === 'object') ? story.brief : {}
    const youtubeUrl = brief.youtubeUrl || story.sourceUrl || ''
    if (!youtubeUrl) {
      return res.status(400).json({ error: 'No YouTube URL found. Add a YouTube URL first.' })
    }

    let videoId = null
    try {
      const u = new URL(youtubeUrl)
      if (u.hostname === 'youtu.be') videoId = u.pathname.slice(1).split('/')[0]
      else if (u.pathname.startsWith('/watch')) videoId = u.searchParams.get('v')
      else if (u.pathname.startsWith('/shorts/')) videoId = u.pathname.split('/')[2]
      else if (u.pathname.startsWith('/live/')) videoId = u.pathname.split('/')[2]
    } catch (_) {}
    if (!videoId) {
      return res.status(400).json({ error: 'Could not extract a YouTube video ID from the URL.' })
    }

    const transcript = await fetchTranscript(videoId, ytTranscriptKeyRow)
    if (!transcript || (typeof transcript === 'string' && !transcript.trim())) {
      return res.status(404).json({ error: 'No transcript available for this video.' })
    }

    let srt = ''
    if (Array.isArray(transcript)) {
      const lines = []
      for (let i = 0; i < transcript.length; i++) {
        const seg = transcript[i]
        const startSec = seg.start || 0
        const endSec = (i + 1 < transcript.length) ? transcript[i + 1].start : startSec + (seg.duration || 3)
        lines.push(String(i + 1))
        lines.push(`${fmtSRT(startSec)} --> ${fmtSRT(endSec)}`)
        lines.push(seg.text)
        lines.push('')
      }
      srt = lines.join('\n')
    } else {
      srt = transcript
    }

    const newBrief = { ...brief, subtitlesSRT: srt }
    const updated = await db.story.update({
      where: { id: story.id },
      data: { brief: newBrief },
    })
    await addLog(story.id, req.user.id, 'note', 'YouTube subtitles fetched')
    res.json({ srt, story: updated })
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Story not found' })
    console.error('[stories/fetch-subtitles]', e)
    res.status(500).json({ error: e.message || 'Failed to fetch subtitles' })
  }
})

function fmtSRT(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = Math.floor(totalSeconds % 60)
  const ms = Math.round((totalSeconds % 1) * 1000)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`
}

// ── POST /api/stories/:id/generate-description — AI: compose a YouTube description from script, title, hooks, tags.
router.post('/:id/generate-description', requireRole('owner', 'admin', 'editor'), async (req, res) => {
  try {
    const story = await db.story.findUniqueOrThrow({
      where: { id: req.params.id },
    })
    const descKeyRow = await db.apiKey.findUnique({ where: { service: 'anthropic' } })
    if (!descKeyRow?.encryptedKey) {
      return res.status(400).json({ error: 'Anthropic API key not set. Add it in Settings → API Keys.' })
    }
    const brief = (story.brief && typeof story.brief === 'object') ? { ...story.brief } : {}
    const title = brief.suggestedTitle || story.headline || ''
    const script = brief.script || ''
    const hook = brief.openingHook || ''
    const hookEnd = brief.hookEnd || ''
    const tags = Array.isArray(brief.youtubeTags) ? brief.youtubeTags : []
    const sourceUrl = story.sourceUrl || ''
    const isShort = brief.videoFormat === 'short'

    if (!script && !title) {
      return res.status(400).json({ error: 'No script or title available. Generate a script first.' })
    }

    const apiKey = decrypt(descKeyRow.encryptedKey)

    const system = `You are an expert Arabic YouTube description writer for ${isShort ? 'YouTube Shorts' : 'regular YouTube videos'}.

Given a video title, script, hooks, and tags, create an optimized YouTube description in Arabic.

Rules:
- Start with 1-2 compelling sentences summarizing the video (this appears in search results)
${isShort ? '- Keep it short (3-5 lines max). Shorts descriptions should be concise.' : `- Include timestamps/chapters derived from the script timestamps (format: 0:00 Title)
- Add a "Follow us" / subscribe call-to-action section`}
- End with hashtags from the provided tags (format: #tag1 #tag2)
${sourceUrl ? '- Include the source link with a label like "المصدر:"' : ''}
- Output ONLY the description text. No explanations or meta-text.`

    const userMessage = `Title: ${title}
${hook ? `Opening Hook: ${hook}` : ''}
Script: ${script.slice(0, 15000)}
${hookEnd ? `Outro: ${hookEnd}` : ''}
Tags: ${tags.join(', ')}
${sourceUrl ? `Source URL: ${sourceUrl}` : ''}`

    const raw = await callAnthropic(apiKey, 'claude-sonnet-4-6', [{ role: 'user', content: userMessage }], {
      system,
      maxTokens: 2048,
      channelId: story.channelId,
      action: 'Story Generate Description',
    })

    const description = (raw && typeof raw === 'string') ? raw.trim() : ''
    const newBrief = { ...brief, youtubeDescription: description }
    await db.story.update({
      where: { id: story.id },
      data: { brief: newBrief },
    })
    await addLog(story.id, req.user.id, 'note', 'AI description generated')
    res.json({ description, brief: newBrief })
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Story not found' })
    console.error('[stories/generate-description]', e)
    res.status(500).json({ error: e.message || 'Generate description failed' })
  }
})

// ── POST /api/stories/:id/suggest-tags — AI suggest min 5 YouTube tags from headline + script/summary
router.post('/:id/suggest-tags', requireRole('owner', 'admin', 'editor'), async (req, res) => {
  try {
    const story = await db.story.findUniqueOrThrow({
      where: { id: req.params.id },
    })
    const tagsKeyRow = await db.apiKey.findUnique({ where: { service: 'anthropic' } })
    if (!tagsKeyRow?.encryptedKey) {
      return res.status(400).json({ error: 'Anthropic API key not set. Add it in Settings → API Keys.' })
    }
    const brief = (story.brief && typeof story.brief === 'object') ? story.brief : {}
    const headline = (story.headline || '').trim()
    const script = typeof brief.script === 'string' ? brief.script.trim() : ''
    const summary = typeof brief.summary === 'string' ? brief.summary.trim() : ''
    const context = [headline, summary, script].filter(Boolean).join('\n\n')
    if (!context) {
      return res.status(400).json({ error: 'Add a headline or generate a script first so the AI can suggest tags.' })
    }
    const apiKey = decrypt(tagsKeyRow.encryptedKey)
    const system = `You are an expert at YouTube SEO and metadata. Given a video headline and optionally a script or summary, suggest YouTube tags that would help discovery.

Rules:
- Output at least 5 tags and up to 15. Prefer 8–12.
- Tags can be in Arabic, English, or mixed depending on the content and target audience.
- One tag per line. No numbers, bullets, or commas. No explanation.
- Keep each tag short (1–4 words). No sentences.`
    const userMessage = `Suggest YouTube tags for this video:\n\n${context.slice(0, 15000)}`
    const raw = await callAnthropic(apiKey, 'claude-sonnet-4-6', [{ role: 'user', content: userMessage }], {
      system,
      maxTokens: 512,
      channelId: story.channelId,
      action: 'Story Suggest Tags',
    })
    const text = (raw && typeof raw === 'string') ? raw.trim() : ''
    const tags = text
      .split(/\n/)
      .map((s) => s.replace(/^[\d.)\-\s]+/, '').trim())
      .filter((s) => s.length > 0 && s.length <= 100)
    const youtubeTags = tags.slice(0, 15)
    const newBrief = { ...brief, youtubeTags }
    const updated = await db.story.update({
      where: { id: story.id },
      data: { brief: newBrief },
    })
    res.json({ tags: newBrief.youtubeTags, brief: updated.brief })
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Story not found' })
    console.error('[stories/suggest-tags]', e)
    res.status(500).json({ error: e.message || 'Suggest tags failed' })
  }
})

// ── GET /api/stories/:id
router.get('/:id', async (req, res) => {
  try {
    const story = await db.story.findUniqueOrThrow({
      where: { id: req.params.id },
      include: { log: { include: { user: { select: { name: true, avatarUrl: true } } }, orderBy: { createdAt: 'desc' }, take: 50 } }
    })
    const linkedArticle = await db.article.findFirst({
      where: { storyId: story.id },
      select: { id: true, analysis: true },
    })

    const brief = (story.brief && typeof story.brief === 'object') ? { ...story.brief } : {}
    if (brief.research && linkedArticle?.analysis?.images && !brief.research.images) {
      brief.research = { ...brief.research, images: linkedArticle.analysis.images }
    }

    res.json({ ...story, brief, linkedArticleId: linkedArticle?.id ?? null })
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Story not found' })
    console.error('[stories/get]', req.params.id, e?.message || e)
    res.status(500).json({ error: 'Failed to load story' })
  }
})

// ── POST /api/stories/manual — create a manual (non-AI) story for "Ready to Publish" flow
router.post('/manual', requireRole('owner', 'admin', 'editor'), async (req, res) => {
  try {
    const { channelId, headline } = req.body
    if (!channelId) return res.status(400).json({ error: 'channelId is required' })

    const story = await db.story.create({
      data: {
        channelId,
        headline: headline || 'Manual Video',
        origin: 'manual',
        stage: 'publish',
        brief: {},
      },
    })
    await addLog(story.id, req.user.id, 'created', 'Manual video — Ready to Publish')
    res.json(story)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── POST /api/stories/:id/transcribe — transcribe uploaded video via OpenAI Whisper
router.post('/:id/transcribe', requireRole('owner', 'admin', 'editor'), async (req, res) => {
  req.setTimeout(600_000) // 10 min — large videos need download + ffmpeg + Whisper
  try {
    const story = await db.story.findUniqueOrThrow({ where: { id: req.params.id } })
    const brief = (story.brief && typeof story.brief === 'object') ? { ...story.brief } : {}

    if (!brief.videoR2Key) {
      return res.status(400).json({ error: 'Upload a video first before transcribing.' })
    }

    const result = await transcribeFromR2(brief.videoR2Key, story.channelId)

    const newBrief = {
      ...brief,
      transcript: result.text,
      transcriptSegments: result.segments,
      subtitlesSRT: result.srt,
      script: result.text,
    }
    const updated = await db.story.update({
      where: { id: story.id },
      data: { brief: newBrief },
    })
    await addLog(story.id, req.user.id, 'note', 'Video transcribed via Whisper')
    res.json({ transcript: result.text, segments: result.segments, srt: result.srt, brief: updated.brief })
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Story not found' })
    console.error('[stories/transcribe]', e)
    res.status(500).json({ error: e.message || 'Transcription failed' })
  }
})

// ── POST /api/stories/:id/generate-title — AI generate YouTube title from transcript
router.post('/:id/generate-title', requireRole('owner', 'admin', 'editor'), async (req, res) => {
  try {
    const story = await db.story.findUniqueOrThrow({ where: { id: req.params.id } })
    const anthropicKeyRow = await db.apiKey.findUnique({ where: { service: 'anthropic' } })
    if (!anthropicKeyRow?.encryptedKey) {
      return res.status(400).json({ error: 'Anthropic API key not set. Add it in Settings → API Keys.' })
    }
    const brief = (story.brief && typeof story.brief === 'object') ? { ...story.brief } : {}
    const transcript = brief.transcript || brief.script || ''
    if (!transcript) {
      return res.status(400).json({ error: 'No transcript available. Transcribe the video first.' })
    }

    const channel = await db.channel.findFirst({
      where: { id: story.channelId },
      select: { nationality: true },
    })
    const dialect = await getDialectForCountry(channel?.nationality)
    const langNote = dialect
      ? `The title should be in ${dialect.short} (${dialect.long}).`
      : 'The title should be in Arabic.'

    const apiKey = decrypt(anthropicKeyRow.encryptedKey)
    const system = `You are an expert Arabic YouTube title writer. ${langNote}

Rules:
- Output ONLY the title, nothing else. No quotes, no explanation.
- Keep it under 70 characters for best YouTube SEO.
- Make it attention-grabbing and click-worthy.
- Use numbers, questions, or strong verbs when appropriate.`

    const userMessage = `Generate a compelling YouTube video title based on this transcript:\n\n${transcript.slice(0, 15000)}`

    const title = await callAnthropic(apiKey, 'claude-sonnet-4-6', [{ role: 'user', content: userMessage }], {
      system,
      maxTokens: 200,
      channelId: story.channelId,
      action: 'Story Generate Title',
    })

    const cleanTitle = (title || '').trim().replace(/^["']|["']$/g, '')
    const newBrief = { ...brief, suggestedTitle: cleanTitle }
    await db.story.update({
      where: { id: story.id },
      data: { headline: cleanTitle, brief: newBrief },
    })
    await addLog(story.id, req.user.id, 'note', 'AI title generated')
    res.json({ title: cleanTitle, brief: newBrief })
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Story not found' })
    console.error('[stories/generate-title]', e)
    res.status(500).json({ error: e.message || 'Generate title failed' })
  }
})

// ── POST /api/stories/:id/classify-video — detect Short vs Video from YouTube URL
router.post('/:id/classify-video', requireRole('owner', 'admin', 'editor'), async (req, res) => {
  try {
    const story = await db.story.findUniqueOrThrow({ where: { id: req.params.id } })
    const brief = (story.brief && typeof story.brief === 'object') ? { ...story.brief } : {}
    const youtubeUrl = brief.youtubeUrl || ''
    if (!youtubeUrl) {
      return res.status(400).json({ error: 'No YouTube URL found.' })
    }

    let videoId = null
    try {
      const u = new URL(youtubeUrl)
      if (u.hostname === 'youtu.be') videoId = u.pathname.slice(1).split('/')[0]
      else if (u.pathname.startsWith('/watch')) videoId = u.searchParams.get('v')
      else if (u.pathname.startsWith('/shorts/')) videoId = u.pathname.split('/')[2]
      else if (u.pathname.startsWith('/live/')) videoId = u.pathname.split('/')[2]
    } catch (_) {}
    if (!videoId) {
      return res.status(400).json({ error: 'Could not extract YouTube video ID from URL.' })
    }

    const isShort = await isYouTubeShort(videoId)
    const videoFormat = isShort ? 'short' : 'long'
    const newBrief = { ...brief, videoFormat }
    await db.story.update({
      where: { id: story.id },
      data: { brief: newBrief },
    })
    res.json({ videoFormat, videoId })
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Story not found' })
    console.error('[stories/classify-video]', e)
    res.status(500).json({ error: e.message || 'Classification failed' })
  }
})

// ── PATCH /api/stories/:id/link-video — link a story to its produced YouTube video
router.patch('/:id/link-video', requireRole('owner', 'admin', 'editor'), async (req, res) => {
  try {
    const { youtubeId } = req.body
    if (!youtubeId || typeof youtubeId !== 'string') {
      return res.status(400).json({ error: 'youtubeId is required' })
    }

    const video = await db.video.findUnique({ where: { youtubeId: youtubeId.trim() } })
    if (!video) {
      return res.status(400).json({ error: 'Video not found — sync your channel first' })
    }

    await db.story.update({
      where: { id: req.params.id },
      data: { producedVideoId: video.id },
    })

    res.json({ ok: true, videoId: video.id, title: video.titleAr })
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Story not found' })
    res.status(500).json({ error: e.message })
  }
})

// ── POST /api/stories
router.post('/', requireRole('owner', 'admin', 'editor'), async (req, res) => {
  try {
    const { channelId, headline, stage, sourceUrl, sourceName, brief } = req.body
    if (!channelId || !headline) return res.status(400).json({ error: 'channelId and headline required' })

    const story = await db.story.create({
      data: { channelId, headline, stage: stage || 'suggestion', sourceUrl, sourceName, brief }
    })
    await addLog(story.id, req.user.id, 'created', `Stage: ${story.stage}`)
    res.json(story)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── PATCH /api/stories/:id
router.patch('/:id', requireRole('owner', 'admin', 'editor'), async (req, res) => {
  try {
    const allowed = ['headline', 'stage', 'origin', 'sourceUrl', 'sourceName', 'sourceDate',
                     'coverageStatus', 'scriptLong', 'scriptShort', 'brief',
                     'relevanceScore', 'viralScore', 'firstMoverScore', 'compositeScore']
    const data = {}
    for (const k of allowed) if (req.body[k] !== undefined) data[k] = req.body[k]

    if (data.relevanceScore !== undefined || data.viralScore !== undefined || data.firstMoverScore !== undefined) {
      const existing = await db.story.findUnique({ where: { id: req.params.id }, select: { relevanceScore: true, viralScore: true, firstMoverScore: true } })
      if (existing) {
        const r = (data.relevanceScore ?? existing.relevanceScore) || 0
        const v = (data.viralScore ?? existing.viralScore) || 0
        const f = (data.firstMoverScore ?? existing.firstMoverScore) || 0
        data.compositeScore = computeSimpleComposite(r, v, f)
      }
    }

    const story = await db.story.update({ where: { id: req.params.id }, data })

    if (req.body.stage && typeof req.body.stage === 'string') {
      const stageLabel = req.body.stage.charAt(0).toUpperCase() + req.body.stage.slice(1)
      await addLog(story.id, req.user.id, 'stage_change', `Status changed to ${stageLabel}`)

      // Refresh article preference profile when user makes a decision
      const feedbackStages = ['liked', 'skip', 'trash', 'scripting', 'filmed', 'publish', 'done']
      if (feedbackStages.includes(req.body.stage) && story.channelId) {
        try {
          const { refreshPreferenceProfile } = require('../services/articleFeedback')
          refreshPreferenceProfile(story.channelId).catch(() => {})
        } catch (_) {}
        try {
          const { learnFromDecisions } = require('../services/scoreLearner')
          learnFromDecisions(story.channelId).catch(() => {})
        } catch (_) {}
      }
    }
    // Return story with log so Edit History shows who changed status
    const withLog = await db.story.findUnique({
      where: { id: story.id },
      include: { log: { include: { user: { select: { name: true, avatarUrl: true } } }, orderBy: { createdAt: 'desc' }, take: 50 } }
    })
    res.json(withLog || story)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── POST /api/stories/re-evaluate — full re-evaluation: refresh stats → learn → re-score
router.post('/re-evaluate', requireRole('owner', 'admin'), async (req, res) => {
  try {
    const { channelId } = req.query
    if (!channelId) return res.status(400).json({ error: 'channelId query param required' })
    const { runCycleForChannel } = require('../worker-rescore')
    const result = await runCycleForChannel(channelId)
    res.json(result)
  } catch (e) {
    console.error('[stories/re-evaluate]', e)
    res.status(500).json({ error: e.message })
  }
})

// ── POST /api/stories/recalculate-scores — admin-only batch recalculation
// SQL mirrors computeSimpleComposite() from lib/scoringConfig.js — keep weights in sync
router.post('/recalculate-scores', requireRole('owner', 'admin'), async (req, res) => {
  try {
    const wR = SIMPLE_COMPOSITE.relevance
    const wV = SIMPLE_COMPOSITE.viral
    const wF = SIMPLE_COMPOSITE.firstMover
    const result = await db.$executeRaw`
      UPDATE "Story"
      SET "compositeScore" = ROUND(
        (COALESCE("relevanceScore", 0) * ${wR} +
         COALESCE("viralScore", 0) * ${wV} +
         COALESCE("firstMoverScore", 0) * ${wF}) / 10.0 * 10, 1
      )
      WHERE ABS(
        COALESCE("compositeScore", 0) -
        ROUND((COALESCE("relevanceScore", 0) * ${wR} + COALESCE("viralScore", 0) * ${wV} + COALESCE("firstMoverScore", 0) * ${wF}) / 10.0 * 10, 1)
      ) > 0.01
    `
    const total = await db.story.count()
    res.json({ fixed: Number(result), total })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── DELETE /api/stories/:id
router.delete('/:id', requireRole('owner', 'admin'), async (req, res) => {
  try {
    await db.story.delete({ where: { id: req.params.id } })
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── POST /api/stories/:id/log
router.post('/:id/log', requireRole('owner', 'admin', 'editor'), async (req, res) => {
  try {
    const { action, note } = req.body
    const log = await addLog(req.params.id, req.user.id, action, note)
    res.json(log)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

async function addLog(storyId, userId, action, note) {
  return db.storyLog.create({ data: { storyId, userId, action, note } })
}

module.exports = router
