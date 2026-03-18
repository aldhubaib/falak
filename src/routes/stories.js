const express = require('express')
const db = require('../lib/db')
const { requireAuth, requireRole } = require('../middleware/auth')
const { decrypt } = require('../services/crypto')
const { fetchArticleText } = require('../services/articleFetcher')
const { scrapeUrl, preClean } = require('../services/firecrawl')
const { callAnthropic, callAnthropicStream } = require('../services/pipelineProcessor')
const { getDialectForCountry } = require('../lib/dialects')
const { fetchTranscript } = require('../services/transcript')

// Run script generation in background (non-streaming). Can be invoked when moving to scripting.
async function generateScriptForStory(storyId) {
  const story = await db.story.findUniqueOrThrow({
    where: { id: storyId },
    include: { project: { select: { id: true, anthropicApiKeyEncrypted: true } } },
  })
  const project = story.project
  if (!project?.anthropicApiKeyEncrypted) return
  const brief = (story.brief && typeof story.brief === 'object') ? { ...story.brief } : {}
  const articleContent = typeof brief.articleContent === 'string' && brief.articleContent !== '__SCRAPE_FAILED__' && brief.articleContent !== '__YOUTUBE__' ? brief.articleContent : ''
  if (!articleContent || !articleContent.trim()) return
  const channelId = brief.channelId
  if (!channelId) return
  const channel = await db.channel.findFirst({
    where: { id: channelId, projectId: project.id },
    select: { id: true, startHook: true, endHook: true },
  })
  if (!channel) return
  const durationMinutes = Math.max(0.5, parseFloat(brief.scriptDuration) || 3)
  const isShort = durationMinutes <= 3
  const startHook = (channel.startHook || '').trim()
  const endHook = (channel.endHook || '').trim()
  const apiKey = decrypt(project.anthropicApiKeyEncrypted)
  const durationInstruction = isShort
    ? `The script must be about ${durationMinutes} minute(s) of speaking time (approximately ${Math.round(durationMinutes * 150)} words). Include timestamps every 15–30 seconds (e.g. 0:00, 0:15, 0:30, 1:00).`
    : `The script must be about ${durationMinutes} minutes of speaking time (approximately ${Math.round(durationMinutes * 150)} words). Include timestamps at logical section breaks (e.g. 0:00, 1:00, 5:00, 10:00).`
  const system = `You are an expert Arabic YouTube scriptwriter. Output ONLY a structured script in Arabic, using exactly these section headers (each on its own line). No other text or explanations.

## TITLE
(one line: suggested video title in Arabic)

## OPENING_HOOK
(one short paragraph: the first 10 seconds hook in Arabic)

## BRANDED_HOOK_START
${startHook ? `Output this text exactly:\n${startHook}` : '(leave empty or a brief channel greeting)'}

## SCRIPT
(Main script body in Arabic with timestamps. ${durationInstruction} Use format like 0:00 ... then 0:30 ... etc.)

## BRANDED_HOOK_END
${endHook ? `Output this text exactly:\n${endHook}` : '(leave empty or a brief call to subscribe)'}`

  const userMessage = `Article to turn into a ${isShort ? `short video (~${durationMinutes} min)` : `${durationMinutes}-minute video`} script in Arabic:\n\n${articleContent.slice(0, 120000)}`

  let fullScript = ''
  try {
    fullScript = await callAnthropic(apiKey, 'claude-sonnet-4-6', [{ role: 'user', content: userMessage }], {
      system,
      maxTokens: 8192,
      projectId: project.id,
      action: 'Story Generate Script',
    })
  } catch (err) {
    console.error('[stories/generateScriptForStory]', storyId, err?.message)
    return
  }
  const parsed = parseStructuredScript(fullScript, startHook, endHook)
  const newBrief = {
    ...brief,
    suggestedTitle: parsed.suggestedTitle || brief.suggestedTitle,
    openingHook: parsed.openingHook || brief.openingHook,
    hookStart: parsed.hookStart !== undefined ? parsed.hookStart : brief.hookStart,
    script: parsed.script || brief.script,
    hookEnd: parsed.hookEnd !== undefined ? parsed.hookEnd : brief.hookEnd,
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

// ── GET /api/stories?projectId=xxx&stage=xxx
router.get('/', async (req, res) => {
  try {
    const { projectId, stage } = req.query
    const where = {}
    if (projectId) where.projectId = projectId
    if (stage)     where.stage = stage

    const stories = await db.story.findMany({
      where,
      include: { log: { orderBy: { createdAt: 'desc' }, take: 20 } },
      orderBy: [
        { compositeScore: 'desc' },
        { createdAt: 'desc' }
      ]
    })
    res.json(stories)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── GET /api/stories/summary?projectId=xxx
router.get('/summary', async (req, res) => {
  try {
    const { projectId } = req.query
    const where = projectId ? { projectId } : {}

    const all = await db.story.findMany({ where, select: { stage: true, coverageStatus: true } })
    const stages = ['suggestion', 'liked', 'scripting', 'filmed', 'publish', 'done', 'passed', 'omit']
    const counts = {}
    for (const s of stages) counts[s] = all.filter(x => x.stage === s).length

    const firstMovers  = all.filter(x => x.coverageStatus === 'first').length
    const firstMoverPct = all.length ? Math.round(firstMovers / all.length * 100) : 0

    res.json({ total: all.length, ...counts, firstMovers, firstMoverPct })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── POST /api/stories/:id/fetch-article — fetch sourceUrl and store full article text in brief.articleContent
router.post('/:id/fetch-article', requireRole('owner', 'admin', 'editor'), async (req, res) => {
  try {
    const story = await db.story.findUniqueOrThrow({
      where: { id: req.params.id },
      include: { project: { select: { firecrawlApiKeyEncrypted: true } } },
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
    if (story.project?.firecrawlApiKeyEncrypted) {
      try {
        const apiKey = decrypt(story.project.firecrawlApiKeyEncrypted)
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

// Parse structured script output into brief fields. Sections: ## TITLE, ## OPENING_HOOK, ## BRANDED_HOOK_START, ## SCRIPT, ## BRANDED_HOOK_END, ## HASHTAGS
function parseStructuredScript(text, channelStartHook = '', channelEndHook = '') {
  const raw = (text || '').trim()
  const sections = {}
  const sectionNames = ['TITLE', 'OPENING_HOOK', 'BRANDED_HOOK_START', 'SCRIPT', 'BRANDED_HOOK_END', 'HASHTAGS']
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
    openingHook: sections.OPENING_HOOK || '',
    hookStart: sections.BRANDED_HOOK_START !== undefined ? sections.BRANDED_HOOK_START : channelStartHook,
    script: sections.SCRIPT || raw,
    hookEnd: sections.BRANDED_HOOK_END !== undefined ? sections.BRANDED_HOOK_END : channelEndHook,
    youtubeTags,
  }
}

// ── POST /api/stories/:id/generate-script — AI: full script (title, hooks, script with timestamps). Requires channelId for branded hooks.
// Body: durationMinutes (number), articleText, channelId (required).
router.post('/:id/generate-script', requireRole('owner', 'admin', 'editor'), async (req, res) => {
  try {
    const story = await db.story.findUniqueOrThrow({
      where: { id: req.params.id },
      include: { project: { select: { id: true, anthropicApiKeyEncrypted: true } } },
    })
    const project = story.project
    if (!project?.anthropicApiKeyEncrypted) {
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
      where: { id: channelId, projectId: project.id },
      select: { id: true, startHook: true, endHook: true, nationality: true },
    })
    if (!channel) {
      return res.status(400).json({ error: 'Channel not found or does not belong to this project.' })
    }
    const durationMinutes = Math.max(0.5, parseFloat(req.body?.durationMinutes) || 3)
    const startHook = (channel.startHook || '').trim()
    const endHook = (channel.endHook || '').trim()

    const dialect = await getDialectForCountry(channel.nationality)
    const dialectInstruction = dialect
      ? `Write the script in ${dialect.long} (${dialect.short}). Use natural spoken ${dialect.short} — not formal Modern Standard Arabic.`
      : 'Write the script in Arabic.'

    const apiKey = decrypt(project.anthropicApiKeyEncrypted)
    const isShort = durationMinutes <= 3
    const durationInstruction = isShort
      ? `The script must be about ${durationMinutes} minute(s) of speaking time (approximately ${Math.round(durationMinutes * 150)} words). Include timestamps every 15–30 seconds (e.g. 0:00, 0:15, 0:30, 1:00).`
      : `The script must be about ${durationMinutes} minutes of speaking time (approximately ${Math.round(durationMinutes * 150)} words). Include timestamps at logical section breaks (e.g. 0:00, 1:00, 5:00, 10:00).`
    const system = `You are an expert Arabic YouTube scriptwriter. ${dialectInstruction}

Output ONLY a structured script using exactly these section headers (each on its own line). No other text or explanations.

## TITLE
(one line: suggested video title)

## OPENING_HOOK
(one short paragraph: the first 10 seconds hook)

## BRANDED_HOOK_START
${startHook ? `Output this text exactly:\n${startHook}` : '(leave empty or a brief channel greeting)'}

## SCRIPT
(Main script body with timestamps. ${durationInstruction} Use format like 0:00 ... then 0:30 ... etc.)

## BRANDED_HOOK_END
${endHook ? `Output this text exactly:\n${endHook}` : '(leave empty or a brief call to subscribe)'}

## HASHTAGS
(5–15 relevant YouTube tags, comma-separated, WITHOUT the # symbol. Mix of Arabic and English tags for SEO. Example: tag1, tag2, tag3)`

    const userMessage = `Article to turn into a ${isShort ? `short video (~${durationMinutes} min)` : `${durationMinutes}-minute video`} script:\n\n${articleContent.slice(0, 120000)}`

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
        projectId: project.id,
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

    const parsed = parseStructuredScript(fullScript, startHook, endHook)
    const newBrief = {
      ...brief,
      suggestedTitle: parsed.suggestedTitle || brief.suggestedTitle,
      openingHook: parsed.openingHook || brief.openingHook,
      hookStart: parsed.hookStart !== undefined ? parsed.hookStart : brief.hookStart,
      script: parsed.script || brief.script,
      hookEnd: parsed.hookEnd !== undefined ? parsed.hookEnd : brief.hookEnd,
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
      include: { project: { select: { id: true, anthropicApiKeyEncrypted: true } } },
    })
    const project = story.project
    if (!project?.anthropicApiKeyEncrypted) {
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
    const apiKey = decrypt(project.anthropicApiKeyEncrypted)

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
      projectId: project.id,
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
      include: { project: { select: { id: true, ytTranscriptApiKeyEncrypted: true } } },
    })
    const project = story.project
    if (!project?.ytTranscriptApiKeyEncrypted) {
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

    const transcript = await fetchTranscript(videoId, project)
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
      include: { project: { select: { id: true, anthropicApiKeyEncrypted: true } } },
    })
    const project = story.project
    if (!project?.anthropicApiKeyEncrypted) {
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

    const apiKey = decrypt(project.anthropicApiKeyEncrypted)

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
      projectId: project.id,
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
      include: { project: { select: { id: true, anthropicApiKeyEncrypted: true } } },
    })
    const project = story.project
    if (!project?.anthropicApiKeyEncrypted) {
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
    const apiKey = decrypt(project.anthropicApiKeyEncrypted)
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
      projectId: project.id,
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
      include: { log: { include: { user: { select: { name: true, avatarUrl: true } } }, orderBy: { createdAt: 'desc' } } }
    })
    res.json(story)
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Story not found' })
    console.error('[stories/get]', req.params.id, e?.message || e)
    res.status(500).json({ error: 'Failed to load story' })
  }
})

// ── POST /api/stories
router.post('/', requireRole('owner', 'admin', 'editor'), async (req, res) => {
  try {
    const { projectId, headline, stage, sourceUrl, sourceName, brief } = req.body
    if (!projectId || !headline) return res.status(400).json({ error: 'projectId and headline required' })

    const story = await db.story.create({
      data: { projectId, headline, stage: stage || 'suggestion', sourceUrl, sourceName, brief }
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
    const allowed = ['headline', 'stage', 'sourceUrl', 'sourceName', 'sourceDate',
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
        const raw = r * 0.35 + v * 0.40 + f * 0.25
        data.compositeScore = Math.round(raw / 10 * 10) / 10
      }
    }

    const story = await db.story.update({ where: { id: req.params.id }, data })

    if (req.body.stage) {
      const stageLabel = req.body.stage.charAt(0).toUpperCase() + req.body.stage.slice(1)
      await addLog(story.id, req.user.id, 'stage_change', `Status changed to ${stageLabel}`)

      // Refresh article preference profile when user makes a decision
      const feedbackStages = ['liked', 'passed', 'omit', 'scripting', 'filmed', 'publish', 'done']
      if (feedbackStages.includes(req.body.stage) && story.projectId) {
        try {
          const { refreshPreferenceProfile } = require('../services/articleFeedback')
          refreshPreferenceProfile(story.projectId).catch(() => {})
        } catch (_) {}
        // Also update the self-learning score profile
        try {
          const { learnFromDecisions } = require('../services/scoreLearner')
          learnFromDecisions(story.projectId).catch(() => {})
        } catch (_) {}
      }
    }
    // Return story with log so Edit History shows who changed status
    const withLog = await db.story.findUnique({
      where: { id: story.id },
      include: { log: { include: { user: { select: { name: true, avatarUrl: true } } }, orderBy: { createdAt: 'desc' } } }
    })
    res.json(withLog || story)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── POST /api/stories/re-evaluate — full re-evaluation: refresh stats → learn → re-score
router.post('/re-evaluate', requireRole('owner', 'admin'), async (req, res) => {
  try {
    const { projectId } = req.query
    if (!projectId) return res.status(400).json({ error: 'projectId query param required' })
    const { runCycleForProject } = require('../worker-rescore')
    const result = await runCycleForProject(projectId)
    res.json(result)
  } catch (e) {
    console.error('[stories/re-evaluate]', e)
    res.status(500).json({ error: e.message })
  }
})

// ── POST /api/stories/recalculate-scores — admin-only batch recalculation
router.post('/recalculate-scores', requireRole('owner', 'admin'), async (req, res) => {
  try {
    const stories = await db.story.findMany({
      select: { id: true, relevanceScore: true, viralScore: true, firstMoverScore: true, compositeScore: true }
    })
    let fixed = 0
    for (const s of stories) {
      const r = s.relevanceScore || 0
      const v = s.viralScore || 0
      const f = s.firstMoverScore || 0
      const raw = r * 0.35 + v * 0.40 + f * 0.25
      const correct = Math.round(raw / 10 * 10) / 10
      if (Math.abs(correct - (s.compositeScore || 0)) > 0.01) {
        await db.story.update({ where: { id: s.id }, data: { compositeScore: correct } })
        fixed++
      }
    }
    res.json({ fixed, total: stories.length })
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
