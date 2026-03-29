const express = require('express')
const db = require('../lib/db')
const { requireAuth, requireRole } = require('../middleware/auth')
const { decrypt } = require('../services/crypto')
const { fetchArticleText } = require('../services/articleFetcher')
const { scrapeUrl, preClean } = require('../services/firecrawl')
const { callAnthropic, callAnthropicStream } = require('../services/pipelineProcessor')
const { callAnthropicLogged } = require('../services/aiLogger')
const { learnFromStory } = require('../services/aiLearner')
const { getDialectForCountry } = require('../lib/dialects')
const { fetchTranscript } = require('../services/transcript')
const { transcribeFromR2 } = require('../services/whisper')
const { fetchVideoMetadata, isYouTubeShort } = require('../services/youtube')
const { computeSimpleComposite, SIMPLE_COMPOSITE, finalScoreToComposite } = require('../lib/scoringConfig')
const { getNicheEmbedding } = require('../services/embeddings')
const registry = require('../lib/serviceRegistry')

// ── Suggest best playlist for a story based on its content ─────────────────
async function suggestPlaylistForStory(storyId) {
  const story = await db.story.findUniqueOrThrow({ where: { id: storyId } })
  const brief = (story.brief && typeof story.brief === 'object') ? { ...story.brief } : {}

  const playlists = await db.playlist.findMany({
    where: { channelId: story.channelId },
    orderBy: [{ sortOrder: 'asc' }],
  })
  if (playlists.length === 0) return null

  const title = brief.suggestedTitle || story.headline || ''
  const tags = Array.isArray(brief.youtubeTags) ? brief.youtubeTags : []
  const transcript = brief.transcript || brief.script || ''

  const playlistBlock = playlists.map(p =>
    `- ID: ${p.id} | Name: ${p.name} | Hashtags: #${p.hashtag1} #${p.hashtag2} #${p.hashtag3}${p.rules ? ` | Rules: ${p.rules}` : ''}`
  ).join('\n')

  const apiKey = await registry.requireKey('anthropic')
  const raw = await callAnthropic(apiKey, 'claude-haiku-4-5-20251001', [
    {
      role: 'user',
      content: `Pick the single best playlist for this video. Reply with JSON only, no markdown.
Keys: playlistId (string), confidence (0-100), reason (one sentence in Arabic)

Video:
- Title: ${title}
- Tags: ${tags.join(', ')}
- Transcript excerpt: ${transcript.slice(0, 5000)}

Available Playlists:
${playlistBlock}`,
    },
  ], { channelId: story.channelId, action: 'suggest-playlist' })

  try {
    const trimmed = (raw || '').trim()
    const start = trimmed.indexOf('{')
    const end = trimmed.lastIndexOf('}') + 1
    if (start === -1 || end <= start) return null
    const parsed = JSON.parse(trimmed.slice(start, end))
    const matched = playlists.find(p => p.id === parsed.playlistId)
    if (!matched) return null

    return {
      playlistId: matched.id,
      playlistName: matched.name,
      hashtags: [`#${matched.hashtag1}`, `#${matched.hashtag2}`, `#${matched.hashtag3}`],
      youtubePlaylistId: matched.youtubeId || null,
      confidence: Math.min(100, Math.max(0, parseInt(parsed.confidence) || 0)),
      reason: parsed.reason || null,
    }
  } catch {
    return null
  }
}

// ── Background AI processing for manual video uploads ──────────────────────
async function processStoryBackground(storyId) {
  const tag = `[stories/process:${storyId.slice(-6)}]`
  try {
    let story = await db.story.findUniqueOrThrow({ where: { id: storyId } })
    let brief = (story.brief && typeof story.brief === 'object') ? { ...story.brief } : {}

    if (!brief.videoR2Key) throw new Error('No video file to process')

    brief.processingStatus = 'processing'
    brief.processingStep = 'transcribing'
    brief.processingError = null
    await db.story.update({ where: { id: storyId }, data: { brief } })
    console.log(tag, 'started — transcribing')

    // Step 1: Transcribe via Whisper
    if (!brief.transcript) {
      const result = await transcribeFromR2(brief.videoR2Key, story.channelId)
      story = await db.story.findUniqueOrThrow({ where: { id: storyId } })
      brief = (story.brief && typeof story.brief === 'object') ? { ...story.brief } : {}
      Object.assign(brief, {
        transcript: result.text,
        transcriptSegments: result.segments,
        subtitlesSRT: result.srt,
        script: result.text,
      })
      await db.story.update({ where: { id: storyId }, data: { brief } })
      console.log(tag, 'transcription done')
    }

    // Transcription only — user triggers title/description/playlist/tags manually
    brief.processingStatus = 'done'
    brief.processingStep = 'done'
    await db.story.update({ where: { id: storyId }, data: { brief } })
    console.log(tag, 'all done')
  } catch (e) {
    console.error(`[stories/process:${storyId.slice(-6)}] error:`, e)
    try {
      const story = await db.story.findUniqueOrThrow({ where: { id: storyId } })
      const brief = (story.brief && typeof story.brief === 'object') ? { ...story.brief } : {}
      brief.processingStatus = 'error'
      brief.processingError = e.message || 'Processing failed'
      await db.story.update({ where: { id: storyId }, data: { brief } })
    } catch { /* best effort */ }
  }
}

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
    select: { id: true, startHook: true, endHook: true, nationality: true, styleGuide: true },
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

  // Build style guide injection from learned corrections
  const guide = (channel.styleGuide && typeof channel.styleGuide === 'object') ? channel.styleGuide : null
  let styleBlock = ''
  if (guide) {
    const parts = []
    if (Array.isArray(guide.corrections) && guide.corrections.length > 0) {
      const hookCorrections = guide.corrections.filter(c => c.category === 'branded_hook')
      const otherCorrections = guide.corrections.filter(c => c.category !== 'branded_hook')
      if (hookCorrections.length > 0) {
        parts.push('CRITICAL — Branded hook corrections (you got these WRONG before, use the CORRECT version):\n' +
          hookCorrections.map(c => `- WRONG: "${c.wrong}" → CORRECT: "${c.correct}"`).join('\n'))
      }
      if (otherCorrections.length > 0) {
        parts.push('Style corrections from past scripts:\n' +
          otherCorrections.slice(-10).map(c => `- Instead of "${c.wrong}", use "${c.correct}"`).join('\n'))
      }
    }
    if (guide.signatures?.startHook?.length > 0) {
      parts.push('Real opening hook examples from this channel\'s past videos:\n' +
        guide.signatures.startHook.slice(-3).map(h => `- "${h}"`).join('\n'))
    }
    if (guide.signatures?.endHook?.length > 0) {
      parts.push('Real closing hook examples from this channel\'s past videos:\n' +
        guide.signatures.endHook.slice(-3).map(h => `- "${h}"`).join('\n'))
    }
    if (Array.isArray(guide.notes) && guide.notes.length > 0) {
      parts.push('Presenter style preferences:\n' + guide.notes.slice(-5).map(n => `- ${n}`).join('\n'))
    }
    if (parts.length > 0) {
      styleBlock = '\n\n--- CHANNEL STYLE GUIDE (learned from past videos — follow these closely) ---\n' + parts.join('\n\n')
    }
  }

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
(5–15 relevant YouTube tags, comma-separated, WITHOUT the # symbol. Mix of Arabic and English tags for SEO.)${styleBlock}`

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
    fullScript = await callAnthropicLogged(apiKey, 'claude-sonnet-4-6', [{ role: 'user', content: userMessage }], {
      system,
      maxTokens: 8192,
      channelId: story.channelId,
      storyId: story.id,
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
      channelId: true, origin: true, writerId: true,
      writer: { select: { id: true, name: true, avatarUrl: true } },
    }
    if (!slim) selectFields.brief = true

    const stories = await db.story.findMany({
      where,
      select: selectFields,
      orderBy: [
        { compositeScore: 'desc' },
        { createdAt: 'desc' }
      ],
      take: 5000,
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

    const stages = ['suggestion', 'liked', 'scripting', 'filmed', 'done', 'skip', 'trash',
                     'writer_draft', 'writer_submitted', 'writer_approved', 'writer_review', 'writer_revision']
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
        AND stage IN ('suggestion','liked','scripting','filmed')
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

    // Build research text from the structured briefAr/brief object
    const researchObj = brief.research?.briefAr || brief.research?.brief
    let researchText = ''
    if (researchObj && typeof researchObj === 'object') {
      const parts = []
      if (researchObj.whatHappened) parts.push(`ما حدث:\n${researchObj.whatHappened}`)
      if (researchObj.howItHappened) parts.push(`كيف حدث:\n${researchObj.howItHappened}`)
      if (researchObj.whatWasTheResult) parts.push(`النتيجة:\n${researchObj.whatWasTheResult}`)
      if (Array.isArray(researchObj.keyFacts) && researchObj.keyFacts.length) {
        parts.push(`الحقائق الرئيسية:\n${researchObj.keyFacts.map((f, i) => `${i + 1}. ${f}`).join('\n')}`)
      }
      if (Array.isArray(researchObj.timeline) && researchObj.timeline.length) {
        parts.push(`التسلسل الزمني:\n${researchObj.timeline.map(t => `- ${t.date || ''}: ${t.event || ''}`).join('\n')}`)
      }
      if (Array.isArray(researchObj.mainCharacters) && researchObj.mainCharacters.length) {
        parts.push(`الشخصيات الرئيسية:\n${researchObj.mainCharacters.map(c => `- ${c.name || ''}: ${c.role || ''}`).join('\n')}`)
      }
      if (researchObj.suggestedHook) parts.push(`خطاف مقترح:\n${researchObj.suggestedHook}`)
      if (researchObj.competitionInsight) parts.push(`تحليل المنافسة:\n${researchObj.competitionInsight}`)
      researchText = parts.join('\n\n')
    } else if (typeof researchObj === 'string' && researchObj.trim()) {
      researchText = researchObj.trim()
    }

    const fromBody = typeof req.body?.articleText === 'string' ? req.body.articleText.trim() : ''
    const fromBrief = typeof brief.articleContent === 'string' ? brief.articleContent : ''
    const articleContent = fromBody || (fromBrief !== '__SCRAPE_FAILED__' && fromBrief !== '__YOUTUBE__' ? fromBrief : '')

    if (!researchText && !articleContent) {
      return res.status(400).json({ error: 'No research data or article content available. Run research first.' })
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

    let userMessage = `Turn this into a ${isShort ? `short video (~${durationMinutes} min)` : `${durationMinutes}-minute video`} script:\n\n`

    if (researchText) {
      userMessage += `--- RESEARCH ---\n${researchText}\n\n`
    }
    if (articleContent) {
      userMessage += `--- ARTICLE ---\n${articleContent.slice(0, 120000)}\n\n`
    }
    if (brief.summary) userMessage += `--- SUMMARY ---\n${brief.summary}\n\n`
    if (brief.uniqueAngle) userMessage += `--- UNIQUE ANGLE ---\n${brief.uniqueAngle}\n\n`

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
    const raw = await callAnthropicLogged(apiKey, 'claude-sonnet-4-6', [{ role: 'user', content: trimmedInput }], {
      system,
      maxTokens: 8000,
      channelId: story.channelId,
      storyId: story.id,
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
    let story = await db.story.findUniqueOrThrow({
      where: { id: req.params.id },
    })
    const descKeyRow = await db.apiKey.findUnique({ where: { service: 'anthropic' } })
    if (!descKeyRow?.encryptedKey) {
      return res.status(400).json({ error: 'Anthropic API key not set. Add it in Settings → API Keys.' })
    }
    let brief = (story.brief && typeof story.brief === 'object') ? { ...story.brief } : {}
    const title = brief.suggestedTitle || story.headline || ''
    const hook = brief.openingHook || ''
    const hookEnd = brief.hookEnd || ''
    const tags = Array.isArray(brief.youtubeTags) ? brief.youtubeTags : []
    const isShort = brief.videoFormat === 'short'

    // Build a timestamped transcript if segments are available, otherwise fall back to plain text
    const segments = Array.isArray(brief.transcriptSegments) ? brief.transcriptSegments : []
    let script = ''
    if (segments.length > 0) {
      script = segments.map(s => {
        const m = Math.floor((s.start || 0) / 60)
        const sec = Math.floor((s.start || 0) % 60)
        return `${m}:${String(sec).padStart(2, '0')} ${s.text}`
      }).join('\n')
    } else {
      script = brief.transcript || brief.script || ''
    }

    if (!script && !title) {
      return res.status(400).json({ error: 'No transcript or title available. Transcribe the video first.' })
    }

    const channel = await db.channel.findFirst({ where: { id: story.channelId }, select: { nationality: true } })
    const dialect = await getDialectForCountry(channel?.nationality)
    const langNote = dialect
      ? `Write the description in ${dialect.short} (${dialect.long}).`
      : 'Write the description in Arabic.'

    // Auto-suggest playlist first if none exists
    if (!brief.suggestedPlaylist) {
      try {
        const suggestion = await suggestPlaylistForStory(story.id)
        if (suggestion) {
          story = await db.story.findUniqueOrThrow({ where: { id: story.id } })
          brief = (story.brief && typeof story.brief === 'object') ? { ...story.brief } : {}
          brief.suggestedPlaylist = suggestion
          await db.story.update({ where: { id: story.id }, data: { brief } })
        }
      } catch (e) {
        console.log('[generate-description] playlist auto-suggest failed (non-fatal):', e.message)
      }
    }

    // Fetch playlist hashtags for the description footer
    let defaultHashtags = []
    if (brief.suggestedPlaylist?.playlistId) {
      const pl = await db.playlist.findUnique({ where: { id: brief.suggestedPlaylist.playlistId }, select: { hashtag1: true, hashtag2: true, hashtag3: true } })
      if (pl) defaultHashtags = [`#${pl.hashtag1}`, `#${pl.hashtag2}`, `#${pl.hashtag3}`]
    }
    const defaultHashtagsStr = defaultHashtags.length > 0 ? defaultHashtags.join(' ') : ''

    const apiKey = decrypt(descKeyRow.encryptedKey)

    const system = isShort
      ? `You are an expert Arabic YouTube Shorts description writer. ${langNote}

Given a video title, transcript, and tags, create a short YouTube Shorts description.

Rules:
- 2-3 lines max: emotional hook + what makes this video unique.
- End with hashtags: ${defaultHashtagsStr ? `${defaultHashtagsStr} plus 2 extra relevant hashtags` : '5 relevant hashtags from the tags provided'}.
- Output ONLY the description text. No explanations.`
      : `You are an expert Arabic YouTube description writer. ${langNote}

Given a video title, timestamped transcript, and tags, create a YouTube description following this EXACT structure. Output ONLY the description — no explanations or meta-text.

STRUCTURE (follow precisely):

SECTION 1 — Emotional hook (2-3 lines in Arabic):
Write an emotional, curiosity-driven hook with keywords. Mention what makes this case/topic unique. Use emojis sparingly. This is what appears in search results — make it compelling.

SECTION 2 — Keyword paragraph (3 lines max in Arabic):
Summarize: who is involved, what happened, where, and why it matters. Pack with searchable keywords.

Then output this EXACT separator and section:

---

📌 محتوى الفيديو:

(Generate 6-10 timestamp chapters from the transcript. Format: 0:00 Title)

---

🔔 اشترك وفعّل الجرس عشان ما تفوتك أي قضية جديدة كل يوم!

👍 اللايك والمشاركة يساعد القناة توصل لناس أكثر!

---

${defaultHashtagsStr ? `(Output these default hashtags first: ${defaultHashtagsStr}) then add exactly 2 more relevant hashtags from the video content.` : '(Output 5 relevant hashtags from the provided tags, format: #tag1 #tag2 ...)'}`

    const userMessage = `Title: ${title}
${hook ? `Opening Hook: ${hook}` : ''}
Timestamped Transcript:
${script.slice(0, 15000)}
${hookEnd ? `Outro: ${hookEnd}` : ''}
Tags: ${tags.join(', ')}`

    const raw = await callAnthropicLogged(apiKey, 'claude-sonnet-4-6', [{ role: 'user', content: userMessage }], {
      system,
      maxTokens: 2048,
      channelId: story.channelId,
      storyId: story.id,
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

// ── POST /api/stories/:id/suggest-tags — playlist hashtags (3) + AI-generated (2)
router.post('/:id/suggest-tags', requireRole('owner', 'admin', 'editor'), async (req, res) => {
  try {
    let story = await db.story.findUniqueOrThrow({
      where: { id: req.params.id },
    })
    const tagsKeyRow = await db.apiKey.findUnique({ where: { service: 'anthropic' } })
    if (!tagsKeyRow?.encryptedKey) {
      return res.status(400).json({ error: 'Anthropic API key not set. Add it in Settings → API Keys.' })
    }
    let brief = (story.brief && typeof story.brief === 'object') ? { ...story.brief } : {}
    const headline = (story.headline || '').trim()
    const script = (typeof brief.transcript === 'string' ? brief.transcript.trim() : '') || (typeof brief.script === 'string' ? brief.script.trim() : '')
    const summary = typeof brief.summary === 'string' ? brief.summary.trim() : ''
    const context = [headline, summary, script].filter(Boolean).join('\n\n')
    if (!context) {
      return res.status(400).json({ error: 'Add a headline or transcribe the video first so the AI can suggest tags.' })
    }

    // Auto-suggest playlist first if none exists
    if (!brief.suggestedPlaylist) {
      try {
        const suggestion = await suggestPlaylistForStory(story.id)
        if (suggestion) {
          story = await db.story.findUniqueOrThrow({ where: { id: story.id } })
          brief = (story.brief && typeof story.brief === 'object') ? { ...story.brief } : {}
          brief.suggestedPlaylist = suggestion
          await db.story.update({ where: { id: story.id }, data: { brief } })
        }
      } catch (e) {
        console.log('[suggest-tags] playlist auto-suggest failed (non-fatal):', e.message)
      }
    }

    // Fetch playlist's 3 default hashtags
    let playlistTags = []
    if (brief.suggestedPlaylist?.playlistId) {
      const pl = await db.playlist.findUnique({ where: { id: brief.suggestedPlaylist.playlistId }, select: { hashtag1: true, hashtag2: true, hashtag3: true } })
      if (pl) playlistTags = [pl.hashtag1, pl.hashtag2, pl.hashtag3].filter(Boolean)
    }

    const apiKey = decrypt(tagsKeyRow.encryptedKey)
    const avoidList = playlistTags.length > 0
      ? `\n- Do NOT repeat these playlist hashtags: ${playlistTags.join(', ')}`
      : ''
    const system = `You are an expert at YouTube SEO and metadata. Given a video headline and optionally a script or summary, suggest exactly 2 YouTube hashtags that complement the video content.

Rules:
- Output exactly 2 tags — no more, no less.${avoidList}
- Tags can be in Arabic, English, or mixed depending on the content and target audience.
- One tag per line. No numbers, bullets, or commas. No explanation. No # symbol.
- Keep each tag short (1–4 words). No sentences.`
    const userMessage = `Suggest 2 YouTube hashtags for this video:\n\n${context.slice(0, 15000)}`
    const raw = await callAnthropicLogged(apiKey, 'claude-sonnet-4-6', [{ role: 'user', content: userMessage }], {
      system,
      maxTokens: 200,
      channelId: story.channelId,
      storyId: story.id,
      action: 'Story Suggest Tags',
    })
    const text = (raw && typeof raw === 'string') ? raw.trim() : ''
    const aiTags = text
      .split(/\n/)
      .map((s) => s.replace(/^[\d.)\-#\s]+/, '').trim())
      .filter((s) => s.length > 0 && s.length <= 100)
      .slice(0, 2)

    const youtubeTags = [...playlistTags, ...aiTags]
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
      include: {
        log: { include: { user: { select: { name: true, avatarUrl: true } } }, orderBy: { createdAt: 'desc' }, take: 50 },
        writer: { select: { id: true, name: true, avatarUrl: true } },
      }
    })
    const linkedArticle = await db.article.findFirst({
      where: { storyId: story.id },
      select: { id: true, analysis: true },
      orderBy: { updatedAt: 'desc' },
    })

    const brief = (story.brief && typeof story.brief === 'object') ? { ...story.brief } : {}
    const articleAnalysis = linkedArticle?.analysis
    const articleResearch = articleAnalysis?.research

    if (!brief.research && articleResearch) {
      brief.research = { ...articleResearch }
    }

    if (brief.research) {
      if (articleResearch?.images && !brief.research.images) {
        brief.research = { ...brief.research, images: articleResearch.images }
      }
      if (!brief.research.images && articleAnalysis?.images) {
        brief.research = { ...brief.research, images: articleAnalysis.images }
      }
      if (articleResearch?.briefAr && !brief.research.briefAr) {
        brief.research = { ...brief.research, briefAr: articleResearch.briefAr }
      }
    }

    res.json({ ...story, brief, linkedArticleId: linkedArticle?.id ?? null })
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Story not found' })
    console.error('[stories/get]', req.params.id, e?.message || e)
    res.status(500).json({ error: 'Failed to load story' })
  }
})

// ── POST /api/stories/:id/retranslate-research — copy Arabic brief from article (AI fallback only if missing)
router.post('/:id/retranslate-research', requireRole('owner', 'admin', 'editor'), async (req, res) => {
  try {
    const { force } = req.body || {}
    const story = await db.story.findUniqueOrThrow({ where: { id: req.params.id } })
    const linkedArticle = await db.article.findFirst({
      where: { storyId: story.id },
      select: { id: true, analysis: true, channelId: true },
      orderBy: { updatedAt: 'desc' },
    })

    const storyBrief = (story.brief && typeof story.brief === 'object') ? { ...story.brief } : {}

    const existingBriefAr =
      storyBrief.research?.briefAr ||
      linkedArticle?.analysis?.research?.briefAr

    let briefAr = null
    let source = null

    if (!force && existingBriefAr && typeof existingBriefAr === 'object') {
      briefAr = existingBriefAr
      source = 'copied'
    } else {
      // Fallback: translate via AI only when no Arabic version exists anywhere
      const researchBrief = storyBrief.research?.brief || linkedArticle?.analysis?.research?.brief
      if (!researchBrief || typeof researchBrief !== 'object') {
        return res.status(400).json({ error: 'No research brief found to translate' })
      }

      const apiKey = await registry.requireKey('anthropic')
      const briefJson = JSON.stringify(researchBrief)
      const prompt = `Translate this research brief to Arabic. Keep the exact same JSON structure and keys. Translate all string values to Arabic (whatHappened, howItHappened, whatWasTheResult, keyFacts array, timeline[].event, mainCharacters[].role, competitionInsight, suggestedHook). Keep narrativeStrength as a number. Keep sources[].url unchanged; you may translate sources[].title to Arabic. Reply with ONLY valid JSON, no markdown fences, no explanation.\n\n${briefJson}`

      const rawResponse = await callAnthropic(apiKey, 'claude-haiku-4-5-20251001', [
        { role: 'user', content: prompt },
      ], { maxTokens: 8192, channelId: linkedArticle?.channelId || story.channelId, action: 'retranslate-research' })

      if (rawResponse && rawResponse.trim()) {
        const trimmed = rawResponse.trim()
        const start = trimmed.indexOf('{')
        const end = trimmed.lastIndexOf('}') + 1
        if (start !== -1 && end > start) {
          const jsonStr = trimmed.slice(start, end)
          try {
            briefAr = JSON.parse(jsonStr)
          } catch (_) {
            briefAr = repairAndParseJson(jsonStr)
          }
        }
      }
      source = 'ai'
    }

    if (!briefAr) {
      return res.status(500).json({ error: 'Failed to parse translated research brief' })
    }

    if (storyBrief.research) {
      storyBrief.research = { ...storyBrief.research, briefAr, brief: briefAr }
    } else {
      storyBrief.research = { brief: briefAr, briefAr }
    }
    await db.story.update({ where: { id: story.id }, data: { brief: storyBrief } })

    if (linkedArticle) {
      const artAnalysis = { ...(linkedArticle.analysis || {}) }
      if (artAnalysis.research) {
        artAnalysis.research = { ...artAnalysis.research, briefAr }
      }
      await db.article.update({ where: { id: linkedArticle.id }, data: { analysis: artAnalysis } })
    }

    const logNote = source === 'copied'
      ? 'Arabic brief copied from article pipeline (no AI cost)'
      : 'Research brief translated to Arabic via AI (no existing translation found)'
    await addLog(story.id, req.user.id, 'retranslate', logNote)
    res.json({ ok: true, briefAr, source })
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Story not found' })
    console.error('[stories/retranslate-research]', req.params.id, e?.message || e)
    res.status(500).json({ error: e.message || 'Failed to re-translate research' })
  }
})

function repairAndParseJson(raw) {
  let s = raw
  s = s.replace(/,\s*([}\]])/g, '$1')
  let opens = 0, closes = 0
  for (const ch of s) { if (ch === '{') opens++; if (ch === '}') closes++ }
  while (closes < opens) { s += '}'; closes++ }
  let openBr = 0, closeBr = 0
  for (const ch of s) { if (ch === '[') openBr++; if (ch === ']') closeBr++ }
  while (closeBr < openBr) { s += ']'; closeBr++ }
  try { return JSON.parse(s) } catch (_) { /* pass */ }
  const braceEnd = s.lastIndexOf('}')
  if (braceEnd > 0) {
    const truncated = s.slice(0, braceEnd + 1)
    try { return JSON.parse(truncated) } catch (_) { /* pass */ }
    const repaired = truncated.replace(/,\s*([}\]])/g, '$1')
    try { return JSON.parse(repaired) } catch (_) { /* pass */ }
  }
  return null
}

// ── POST /api/stories/batch-retranslate — re-translate all stories missing Arabic research
router.post('/batch-retranslate', requireRole('owner', 'admin'), async (req, res) => {
  try {
    const articles = await db.article.findMany({
      where: { stage: 'done', NOT: [{ storyId: null }, { analysis: { equals: null } }] },
      select: { id: true, analysis: true, channelId: true, storyId: true },
    })

    const missing = articles.filter(a => {
      const r = a.analysis?.research
      return r?.brief && typeof r.brief === 'object' && !r.briefAr
    })

    if (missing.length === 0) return res.json({ ok: true, translated: 0, message: 'All stories already have Arabic research' })

    const apiKey = await registry.requireKey('anthropic')
    let translated = 0, failed = 0

    for (const article of missing) {
      try {
        const briefJson = JSON.stringify(article.analysis.research.brief)
        const prompt = `Translate this research brief to Arabic. Keep the exact same JSON structure and keys. Translate all string values to Arabic (whatHappened, howItHappened, whatWasTheResult, keyFacts array, timeline[].event, mainCharacters[].role, competitionInsight, suggestedHook). Keep narrativeStrength as a number. Keep sources[].url unchanged; you may translate sources[].title to Arabic. Reply with ONLY valid JSON, no markdown fences, no explanation.\n\n${briefJson}`

        const rawResponse = await callAnthropic(apiKey, 'claude-haiku-4-5-20251001', [
          { role: 'user', content: prompt },
        ], { maxTokens: 8192, channelId: article.channelId, action: 'batch-retranslate-research' })

        let briefAr = null
        if (rawResponse && rawResponse.trim()) {
          const trimmed = rawResponse.trim()
          const start = trimmed.indexOf('{')
          const end = trimmed.lastIndexOf('}') + 1
          if (start !== -1 && end > start) {
            const jsonStr = trimmed.slice(start, end)
            try { briefAr = JSON.parse(jsonStr) } catch (_) { briefAr = repairAndParseJson(jsonStr) }
          }
        }

        if (!briefAr) { failed++; continue }

        const artAnalysis = { ...article.analysis, research: { ...article.analysis.research, briefAr } }
        await db.article.update({ where: { id: article.id }, data: { analysis: artAnalysis } })

        if (article.storyId) {
          const story = await db.story.findUnique({ where: { id: article.storyId }, select: { brief: true } })
          if (story) {
            const storyBrief = (story.brief && typeof story.brief === 'object') ? { ...story.brief } : {}
            if (storyBrief.research) {
              storyBrief.research = { ...storyBrief.research, briefAr, brief: briefAr }
            }
            await db.story.update({ where: { id: article.storyId }, data: { brief: storyBrief } })
          }
        }
        translated++
      } catch (e) {
        console.error('[batch-retranslate]', article.id, e?.message || e)
        failed++
      }
    }

    res.json({ ok: true, total: missing.length, translated, failed })
  } catch (e) {
    console.error('[batch-retranslate]', e?.message || e)
    res.status(500).json({ error: e.message || 'Batch retranslation failed' })
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
        stage: 'filmed',
        brief: {},
      },
    })
    await addLog(story.id, req.user.id, 'created', 'Manual video — Ready to Publish')
    res.json(story)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── POST /api/stories/:id/process — kick off background AI processing after upload
router.post('/:id/process', requireRole('owner', 'admin', 'editor'), async (req, res) => {
  try {
    const story = await db.story.findUniqueOrThrow({ where: { id: req.params.id } })
    const brief = (story.brief && typeof story.brief === 'object') ? story.brief : {}

    if (!brief.videoR2Key) {
      return res.status(400).json({ error: 'Upload a video first.' })
    }
    if (brief.processingStatus === 'processing') {
      return res.json({ status: 'already_processing' })
    }

    res.json({ status: 'processing' })

    processStoryBackground(story.id).catch(err => {
      console.error('[stories/process] unhandled:', err)
    })
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Story not found' })
    res.status(500).json({ error: e.message || 'Failed to start processing' })
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

    const title = await callAnthropicLogged(apiKey, 'claude-sonnet-4-6', [{ role: 'user', content: userMessage }], {
      system,
      maxTokens: 200,
      channelId: story.channelId,
      storyId: story.id,
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

// ── POST /api/stories/:id/suggest-playlist — AI: pick best playlist for this video
router.post('/:id/suggest-playlist', requireRole('owner', 'admin', 'editor'), async (req, res) => {
  try {
    const suggestion = await suggestPlaylistForStory(req.params.id)
    if (!suggestion) {
      return res.status(400).json({ error: 'No playlists configured for this channel, or suggestion failed.' })
    }
    const story = await db.story.findUniqueOrThrow({ where: { id: req.params.id } })
    const brief = (story.brief && typeof story.brief === 'object') ? { ...story.brief } : {}
    brief.suggestedPlaylist = suggestion
    await db.story.update({ where: { id: req.params.id }, data: { brief } })
    res.json(suggestion)
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Story not found' })
    console.error('[stories/suggest-playlist]', e)
    res.status(500).json({ error: e.message || 'Playlist suggestion failed' })
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
router.post('/', requireRole('owner', 'admin', 'editor', 'writer'), async (req, res) => {
  try {
    const { channelId, headline, stage, sourceUrl, sourceName, brief } = req.body
    if (!channelId || !headline) return res.status(400).json({ error: 'channelId and headline required' })

    const isWriter = req.user.role === 'writer'
    const storyStage = isWriter ? 'writer_draft' : (stage || 'suggestion')
    const storyOrigin = isWriter ? 'writer' : 'ai'

    const story = await db.story.create({
      data: {
        channelId, headline,
        stage: storyStage,
        origin: storyOrigin,
        sourceUrl, sourceName, brief,
        writerId: isWriter ? req.user.id : undefined,
      }
    })
    await addLog(story.id, req.user.id, 'created', `Stage: ${story.stage}`)
    res.json(story)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── PATCH /api/stories/:id
router.patch('/:id', requireRole('owner', 'admin', 'editor', 'writer'), async (req, res) => {
  try {
    const isWriter = req.user.role === 'writer'

    if (isWriter) {
      const existing = await db.story.findUnique({ where: { id: req.params.id }, select: { writerId: true, stage: true } })
      if (!existing) return res.status(404).json({ error: 'Story not found' })
      if (existing.writerId !== req.user.id) return res.status(403).json({ error: 'You can only edit your own stories' })

      const writerEditableStages = ['writer_draft', 'writer_revision']
      const writerAllowedFields = ['headline', 'scriptLong', 'scriptShort', 'brief', 'writerNotes']

      if (req.body.stage) {
        const writerTransitions = {
          writer_draft: ['writer_submitted'],
          writer_revision: ['writer_submitted'],
          writer_review: ['writer_approved', 'writer_revision'],
        }
        const allowed = writerTransitions[existing.stage]
        if (!allowed || !allowed.includes(req.body.stage)) {
          return res.status(403).json({ error: `Cannot transition from ${existing.stage} to ${req.body.stage}` })
        }
      } else if (!writerEditableStages.includes(existing.stage)) {
        return res.status(403).json({ error: 'Story is not in an editable state' })
      }

      const data = {}
      for (const k of writerAllowedFields) if (req.body[k] !== undefined) data[k] = req.body[k]
      if (req.body.stage) data.stage = req.body.stage

      const story = await db.story.update({ where: { id: req.params.id }, data })
      if (req.body.stage) {
        const stageLabel = req.body.stage.replace('writer_', '').charAt(0).toUpperCase() + req.body.stage.replace('writer_', '').slice(1)
        await addLog(story.id, req.user.id, 'stage_change', `Writer: status changed to ${stageLabel}`)
      }
      const withLog = await db.story.findUnique({
        where: { id: story.id },
        include: { log: { include: { user: { select: { name: true, avatarUrl: true } } }, orderBy: { createdAt: 'desc' }, take: 50 } }
      })
      return res.json(withLog || story)
    }

    const allowed = ['headline', 'stage', 'origin', 'sourceUrl', 'sourceName', 'sourceDate',
                     'coverageStatus', 'scriptLong', 'scriptShort', 'brief', 'writerNotes',
                     'relevanceScore', 'viralScore', 'firstMoverScore', 'compositeScore', 'writerId']
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

      const feedbackStages = ['liked', 'skip', 'trash', 'scripting', 'filmed', 'done']
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

      if (req.body.stage === 'done' && story.channelId) {
        learnFromStory(story.id).catch(e => console.error('[stories/patch] AI learning failed:', e.message))
      }
    }
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
