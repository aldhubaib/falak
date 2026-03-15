const express = require('express')
const db = require('../lib/db')
const { requireAuth, requireRole } = require('../middleware/auth')
const { decrypt } = require('../services/crypto')
const { fetchStoriesViaFirecrawl } = require('../services/firecrawlStories')
const { trackUsage } = require('../services/usageTracker')
const { fetchArticleText } = require('../services/articleFetcher')
const { scrapeUrl, preClean } = require('../services/firecrawl')
const { callAnthropic, callAnthropicStream } = require('../services/pipelineProcessor')
const brainV2 = require('./brainV2')

const router = express.Router()
router.use(requireAuth)

// ── POST /api/stories/fetch — Firecrawl search (learnedTags) + Claude structure (autoSearchQuery), create suggestion stories
router.post('/fetch', requireRole('owner', 'admin', 'editor'), async (req, res) => {
  let projectId = req.body?.projectId
  try {
    if (!projectId) return res.status(400).json({ error: 'projectId required' })

    const project = await db.project.findUnique({
      where: { id: projectId },
      select: { id: true, firecrawlApiKeyEncrypted: true, anthropicApiKeyEncrypted: true },
    })
    if (!project) return res.status(404).json({ error: 'Project not found' })
    if (!project.firecrawlApiKeyEncrypted) {
      return res.status(400).json({ error: 'Firecrawl API key not set. Add it in Settings → API Keys.' })
    }
    if (!project.anthropicApiKeyEncrypted) {
      return res.status(400).json({ error: 'Anthropic API key not set. Add it in Settings → API Keys.' })
    }

    let firecrawlKey
    let anthropicKey
    try {
      firecrawlKey = decrypt(project.firecrawlApiKeyEncrypted)
      anthropicKey = decrypt(project.anthropicApiKeyEncrypted)
    } catch (decErr) {
      console.error('[stories/fetch] decrypt failed', decErr)
      return res.status(400).json({ error: 'API key could not be read. Re-save it in Settings → API Keys.' })
    }
    if (!firecrawlKey || !firecrawlKey.trim()) {
      return res.status(400).json({ error: 'Firecrawl API key is empty. Add it in Settings → API Keys.' })
    }
    if (!anthropicKey || !anthropicKey.trim()) {
      return res.status(400).json({ error: 'Anthropic API key is empty. Add it in Settings → API Keys.' })
    }

    const brainData = await brainV2.getBrainV2Data(projectId)
    const autoSearchQuery = brainData?.autoSearchQuery
    if (!autoSearchQuery || !autoSearchQuery.trim()) {
      return res.status(400).json({
        error: 'No search query yet. Add competitor and your channels, run the pipeline to completion, then open Brain v2 once. After that, Fetch will work.',
      })
    }

    const storiesToCreate = await fetchStoriesViaFirecrawl({
      autoSearchQuery: brainData.autoSearchQuery,
      learnedTags: brainData.queryMeta?.learnedTags || [],
      regionHints: brainData.queryMeta?.regionHints || [],
      projectId,
      queryVersion: brainData.queryMeta?.version || 'v2-dynamic',
      firecrawlApiKey: firecrawlKey,
      anthropicApiKey: anthropicKey,
    })

    const created = []
    for (const storyData of storiesToCreate) {
      const exists = await db.story.findFirst({
        where: {
          projectId,
          OR: [
            { headline: storyData.headline },
            { sourceUrl: storyData.sourceUrl },
          ],
        },
      })
      if (exists) continue
      const story = await db.story.create({ data: storyData })
      created.push(story)
    }

    // Load TopicMemory to score new stories
    const topicMemories = await db.topicMemory.findMany({
      where: { projectId },
      select: { topicKey: true, topicLabel: true, weight: true, demandScore: true },
    })

    for (const story of created) {
      try {
        const headlineLower = (story.headline || '').toLowerCase()

        // Signal 1: relevanceScore
        // How well does the headline match our proven winning topics?
        // Source: TopicMemory.weight — built from gap wins, story likes,
        // video engagement. Empty on day 1, grows with every action.
        let relevanceScore = 0
        let demandScore = 30  // neutral default when no memory data yet
        for (const m of topicMemories) {
          const key = (m.topicKey || '').toLowerCase()
          if (key.length < 2) continue
          if (headlineLower.includes(key)) {
            const w = (m.weight || 0) * 100
            if (w > relevanceScore) relevanceScore = w
            const d = (m.demandScore || 0) * 100
            if (d > demandScore) demandScore = d
          }
        }
        relevanceScore = Math.min(100, Math.round(relevanceScore))
        demandScore = Math.min(100, Math.round(demandScore))

        // Signal 2: viralScore (repurposed = audience demand)
        // Already set above as demandScore

        // Signal 3: firstMoverScore
        // Are we first to this story and how fresh is it?
        // Source: story.brief.coverageStatus and story.brief.daysSince
        // These come from brainV2 untouchedStories analysis
        const coverageStatus = story.brief?.coverageStatus || null
        const daysSince = story.brief?.daysSince ?? null
        let firstMoverScore = 50  // neutral default
        if (coverageStatus === 'first' || coverageStatus === 'open') {
          firstMoverScore = daysSince !== null
            ? Math.max(0, 100 - Math.round(daysSince * 7))
            : 80
        } else if (coverageStatus === 'taken') {
          firstMoverScore = 0
        }
        firstMoverScore = Math.min(100, Math.max(0, firstMoverScore))

        // Final score: weighted combination → scaled to X/10
        // Weights: 40% relevance (our track record) +
        //          35% demand (audience proof) +
        //          25% first mover (timing advantage)
        const raw = (
          relevanceScore * 0.40 +
          demandScore * 0.35 +
          firstMoverScore * 0.25
        )
        // Scale 0–100 to 0.0–10.0, round to 1 decimal
        const compositeScore = Math.round(raw / 10 * 10) / 10

        await db.story.update({
          where: { id: story.id },
          data: {
            relevanceScore,
            viralScore: demandScore,
            firstMoverScore,
            compositeScore,
          },
        })
      } catch (err) {
        console.error('[stories/fetch] score story', story.id, err?.message)
      }
    }

    const tokensUsed = 2000
    trackUsage({ projectId, service: 'firecrawl', action: 'Fetch Stories', tokensUsed, status: 'ok' })

    const message =
      created.length > 0
        ? null
        : 'Firecrawl returned 0 new stories (they may have been filtered or try again).'
    res.json({ ok: true, created: created.length, stories: created, message })
  } catch (e) {
    console.error('[stories/fetch]', e)
    const message = e instanceof Error ? e.message : String(e)
    if (projectId) {
      trackUsage({ projectId, service: 'firecrawl', action: 'Fetch Stories', status: 'fail', error: message })
    }
    res.status(500).json({ error: message })
  }
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
    const stages = ['suggestion', 'liked', 'approved', 'produced', 'publish', 'done', 'passed', 'omit']
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

// Parse structured script output into brief fields. Sections: ## TITLE, ## OPENING_HOOK, ## BRANDED_HOOK_START, ## SCRIPT, ## BRANDED_HOOK_END
function parseStructuredScript(text, channelStartHook = '', channelEndHook = '') {
  const raw = (text || '').trim()
  const sections = {}
  const sectionNames = ['TITLE', 'OPENING_HOOK', 'BRANDED_HOOK_START', 'SCRIPT', 'BRANDED_HOOK_END']
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

  return {
    suggestedTitle: sections.TITLE || '',
    openingHook: sections.OPENING_HOOK || '',
    hookStart: sections.BRANDED_HOOK_START !== undefined ? sections.BRANDED_HOOK_START : channelStartHook,
    script: sections.SCRIPT || raw,
    hookEnd: sections.BRANDED_HOOK_END !== undefined ? sections.BRANDED_HOOK_END : channelEndHook,
  }
}

// ── POST /api/stories/:id/generate-script — AI: full script (title, hooks, script with timestamps). Requires channelId for branded hooks.
// Body: format ('short'|'long'), articleText, channelId (required).
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
      select: { id: true, startHook: true, endHook: true },
    })
    if (!channel) {
      return res.status(400).json({ error: 'Channel not found or does not belong to this project.' })
    }
    const format = req.body?.format === 'long' ? 'long' : 'short'
    const startHook = (channel.startHook || '').trim()
    const endHook = (channel.endHook || '').trim()

    const apiKey = decrypt(project.anthropicApiKeyEncrypted)
    const durationShort = 'The script must be up to 3 minutes of speaking time (about 400–500 words). Include timestamps every 15–30 seconds (e.g. 0:00, 0:15, 0:30, 1:00).'
    const durationLong = 'The script must be at least 3 minutes and can be as long as needed (e.g. 20–40+ minutes). Include timestamps at logical section breaks (e.g. 0:00, 1:00, 5:00, 10:00).'
    const system = `You are an expert Arabic YouTube scriptwriter. Output ONLY a structured script in Arabic, using exactly these section headers (each on its own line). No other text or explanations.

## TITLE
(one line: suggested video title in Arabic)

## OPENING_HOOK
(one short paragraph: the first 10 seconds hook in Arabic)

## BRANDED_HOOK_START
${startHook ? `Output this text exactly:\n${startHook}` : '(leave empty or a brief channel greeting)'}

## SCRIPT
(Main script body in Arabic with timestamps. ${format === 'long' ? durationLong : durationShort} Use format like 0:00 ... then 0:30 ... etc.)

## BRANDED_HOOK_END
${endHook ? `Output this text exactly:\n${endHook}` : '(leave empty or a brief call to subscribe)'}`

    const userMessage = `Article to turn into a ${format === 'long' ? 'long video' : 'Short (up to 3 min)'} script in Arabic:\n\n${articleContent.slice(0, 120000)}`

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
      scriptFormat: format,
      scriptRaw: fullScript.trim() || brief.scriptRaw, // full AI output for "single box" view
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

    const system = `You are a text editor. The user will give you a raw scraped article.
Your job:
- Extract and preserve ONLY the actual article/news content
- Remove all URLs, markdown links, image tags, navigation text, language selectors, cookie banners, and any other UI chrome
- Fix grammar and formatting
- Do NOT summarize — output the full article length
- Output plain prose only, no markdown, no bullet points`

    const trimmedInput = preClean(articleContent)
    const raw = await callAnthropic(apiKey, 'claude-sonnet-4-6', [{ role: 'user', content: trimmedInput }], {
      system,
      maxTokens: 4000,
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
    res.status(404).json({ error: 'Story not found' })
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

    const story = await db.story.update({ where: { id: req.params.id }, data })

    if (req.body.stage) {
      await addLog(story.id, req.user.id, 'stage_change', `→ ${req.body.stage}`)
    }
    res.json(story)
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
