/**
 * AI Learning Pipeline — compares AI-generated script vs actual transcript,
 * extracts corrections (branded hooks, style patterns), and merges into
 * channel.styleGuide for future prompt injection.
 */
const db = require('../lib/db')
const { decrypt } = require('./crypto')
const { callAnthropicLogged } = require('./aiLogger')

const EMPTY_GUIDE = {
  corrections: [],
  signatures: { startHook: [], endHook: [] },
  notes: [],
  learnedAt: null,
  storyCount: 0,
}

/**
 * Trigger learning when a story moves to "done".
 * Compares brief.script (AI-generated) vs brief.transcript (actual spoken).
 */
async function learnFromStory(storyId) {
  const tag = `[aiLearner:${storyId.slice(-6)}]`
  try {
    const story = await db.story.findUnique({ where: { id: storyId } })
    if (!story || !story.channelId) return
    const brief = (story.brief && typeof story.brief === 'object') ? story.brief : {}

    const aiScript = (brief.scriptRaw || brief.script || '').trim()
    const transcript = (brief.transcript || '').trim()
    if (!aiScript || !transcript) {
      console.log(tag, 'skip — missing script or transcript')
      return
    }
    if (aiScript.length < 50 || transcript.length < 50) return

    const channel = await db.channel.findUnique({
      where: { id: story.channelId },
      select: { id: true, startHook: true, endHook: true, styleGuide: true },
    })
    if (!channel) return

    const apiKeyRow = await db.apiKey.findUnique({ where: { service: 'anthropic' } })
    if (!apiKeyRow?.encryptedKey) return
    const apiKey = decrypt(apiKeyRow.encryptedKey)

    const guide = (channel.styleGuide && typeof channel.styleGuide === 'object')
      ? { ...EMPTY_GUIDE, ...channel.styleGuide }
      : { ...EMPTY_GUIDE }

    const system = `You are an AI style analyst for a YouTube channel. You compare two versions of a video script:
1. AI-GENERATED SCRIPT — what the AI wrote
2. ACTUAL TRANSCRIPT — what the presenter actually said

Your job is to find corrections the AI should learn from. Focus on:
- **Branded hooks**: Did the AI get the opening/closing hook wrong? What did the presenter actually say?
- **Style patterns**: Tone, word choices, sentence structure preferences
- **Factual corrections**: Names, terms, phrases the AI got wrong
- **Format preferences**: How the presenter structures their content differently from the AI

Output ONLY valid JSON (no markdown fences, no explanation) with this exact structure:
{
  "corrections": [
    { "wrong": "what AI wrote", "correct": "what presenter said", "category": "branded_hook|style|factual|format" }
  ],
  "startHookExample": "the actual opening hook the presenter used (first 1-2 sentences), or null",
  "endHookExample": "the actual closing hook the presenter used (last 1-2 sentences), or null",
  "styleNotes": ["brief observation about presenter style preference"]
}

Rules:
- Only include real, meaningful corrections — not minor word-order differences
- The branded hook is the MOST important thing to learn
- If the AI script and transcript are very similar, return empty arrays
- Maximum 10 corrections per analysis
- Keep styleNotes to 3 items max`

    const userMessage = `AI-GENERATED SCRIPT:\n${aiScript.slice(0, 12000)}\n\n---\n\nACTUAL TRANSCRIPT:\n${transcript.slice(0, 12000)}`

    const raw = await callAnthropicLogged(apiKey, 'claude-sonnet-4-6', [{ role: 'user', content: userMessage }], {
      system,
      maxTokens: 2048,
      channelId: channel.id,
      storyId: story.id,
      action: 'AI Learning — Extract Corrections',
    })

    let parsed
    try {
      const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
      parsed = JSON.parse(cleaned)
    } catch {
      console.log(tag, 'failed to parse response:', raw?.slice(0, 200))
      return
    }

    if (Array.isArray(parsed.corrections)) {
      for (const c of parsed.corrections) {
        if (!c.wrong || !c.correct) continue
        const exists = guide.corrections.some(
          e => e.wrong === c.wrong && e.correct === c.correct
        )
        if (!exists) {
          guide.corrections.push({
            wrong: String(c.wrong).slice(0, 500),
            correct: String(c.correct).slice(0, 500),
            category: c.category || 'style',
            learnedFrom: story.id,
            learnedAt: new Date().toISOString(),
          })
        }
      }
      // Keep at most 50 corrections (oldest get trimmed)
      if (guide.corrections.length > 50) {
        guide.corrections = guide.corrections.slice(-50)
      }
    }

    if (parsed.startHookExample && typeof parsed.startHookExample === 'string') {
      if (!guide.signatures.startHook.includes(parsed.startHookExample)) {
        guide.signatures.startHook.push(parsed.startHookExample)
        if (guide.signatures.startHook.length > 10) {
          guide.signatures.startHook = guide.signatures.startHook.slice(-10)
        }
      }
    }
    if (parsed.endHookExample && typeof parsed.endHookExample === 'string') {
      if (!guide.signatures.endHook.includes(parsed.endHookExample)) {
        guide.signatures.endHook.push(parsed.endHookExample)
        if (guide.signatures.endHook.length > 10) {
          guide.signatures.endHook = guide.signatures.endHook.slice(-10)
        }
      }
    }

    if (Array.isArray(parsed.styleNotes)) {
      for (const note of parsed.styleNotes) {
        if (note && typeof note === 'string' && !guide.notes.includes(note)) {
          guide.notes.push(note)
        }
      }
      if (guide.notes.length > 20) {
        guide.notes = guide.notes.slice(-20)
      }
    }

    guide.learnedAt = new Date().toISOString()
    guide.storyCount = (guide.storyCount || 0) + 1

    await db.channel.update({
      where: { id: channel.id },
      data: { styleGuide: guide },
    })
    console.log(tag, `learned ${parsed.corrections?.length || 0} corrections`)
  } catch (e) {
    console.error(tag, 'error:', e.message)
  }
}

/**
 * Manually extract corrections for a specific story (for the AI Monitor diff view).
 * Returns the raw analysis without saving it.
 */
async function extractCorrectionsPreview(storyId) {
  const story = await db.story.findUnique({ where: { id: storyId } })
  if (!story) throw new Error('Story not found')
  const brief = (story.brief && typeof story.brief === 'object') ? story.brief : {}
  const aiScript = (brief.scriptRaw || brief.script || '').trim()
  const transcript = (brief.transcript || '').trim()
  if (!aiScript || !transcript) {
    return { corrections: [], startHookExample: null, endHookExample: null, styleNotes: [] }
  }

  const apiKeyRow = await db.apiKey.findUnique({ where: { service: 'anthropic' } })
  if (!apiKeyRow?.encryptedKey) throw new Error('Anthropic API key not set')
  const apiKey = decrypt(apiKeyRow.encryptedKey)

  const system = `You are an AI style analyst. Compare two versions of a script and find corrections.
Output ONLY valid JSON:
{
  "corrections": [{ "wrong": "...", "correct": "...", "category": "branded_hook|style|factual|format" }],
  "startHookExample": "opening hook or null",
  "endHookExample": "closing hook or null",
  "styleNotes": ["observations"]
}
No markdown fences. Max 10 corrections, 3 notes.`

  const raw = await callAnthropicLogged(apiKey, 'claude-sonnet-4-6', [
    { role: 'user', content: `AI SCRIPT:\n${aiScript.slice(0, 12000)}\n\n---\n\nACTUAL TRANSCRIPT:\n${transcript.slice(0, 12000)}` },
  ], {
    system,
    maxTokens: 2048,
    channelId: story.channelId,
    storyId: story.id,
    action: 'AI Learning — Preview Corrections',
  })

  try {
    const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
    return JSON.parse(cleaned)
  } catch {
    return { corrections: [], error: 'Failed to parse AI response' }
  }
}

module.exports = { learnFromStory, extractCorrectionsPreview, EMPTY_GUIDE }
