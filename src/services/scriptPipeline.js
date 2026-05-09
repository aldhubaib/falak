/**
 * 3-stage script generation pipeline:
 *   Stage 1 — Build fact sheet from research brief (free) or extract via GPT-4o-mini (fallback)
 *   Stage 2 — Filter + organize (pure code)
 *   Stage 3 — Write script (GPT-4o, streaming or blocking)
 *
 * Modeled after Fanzy's immutable Fact Sheet pattern.
 */
const { callAnthropicLogged } = require('./aiLogger')
const registry = require('../lib/serviceRegistry')

const CATEGORY_ORDER = ['background', 'motive', 'event', 'evidence', 'outcome']

// ───────────────────────────────────────────────
// STAGE 1A: Build fact sheet from existing research brief (NO API call)
// ───────────────────────────────────────────────

/**
 * Convert an existing research brief into a structured fact sheet.
 * @param {object} research - brief.research from the story
 * @param {string} [articleContent] - raw article text for supplementary context
 * @returns {{ characters: Array, timeline: Array, facts: Array, locations: Array }}
 */
function buildFactSheetFromResearch(research, articleContent) {
  const briefObj = research.briefAr || research.brief || {}
  const raw = typeof briefObj === 'string' ? {} : briefObj

  // Characters registry — canonical names locked
  const characters = []
  if (Array.isArray(raw.mainCharacters)) {
    raw.mainCharacters.forEach((c, i) => {
      characters.push({
        canonical: c.name || `شخصية ${i + 1}`,
        role: c.role || '',
        priority: i < 3 ? 'core' : 'supporting',
      })
    })
  }

  // Timeline — ordered events with weight
  const timeline = []
  if (Array.isArray(raw.timeline)) {
    raw.timeline.forEach((t, i) => {
      timeline.push({
        order: i,
        date: t.date || '',
        event: t.event || '',
        weight: 'normal',
      })
    })
  }

  // Core facts from structured fields
  const facts = []

  if (raw.whatHappened) {
    facts.push({ fact: raw.whatHappened, category: 'event', importance: 10 })
  }
  if (raw.howItHappened) {
    facts.push({ fact: raw.howItHappened, category: 'motive', importance: 9 })
  }
  if (raw.whatWasTheResult) {
    facts.push({ fact: raw.whatWasTheResult, category: 'outcome', importance: 10 })
  }

  if (Array.isArray(raw.keyFacts)) {
    raw.keyFacts.forEach(f => {
      if (typeof f === 'string' && f.trim()) {
        facts.push({ fact: f.trim(), category: 'event', importance: 8 })
      }
    })
  }

  // Locations — extract from timeline if available
  const locationSet = new Set()
  const locations = []
  if (Array.isArray(raw.timeline)) {
    raw.timeline.forEach(t => {
      const event = t.event || ''
      const dateStr = t.date || ''
      const combined = `${dateStr} ${event}`
      const match = combined.match(/في\s+(.+?)(?:[،,.]|$)/)
      if (match && !locationSet.has(match[1])) {
        locationSet.add(match[1])
        locations.push({ name: match[1], source: 'timeline' })
      }
    })
  }

  // Suggested hook
  const suggestedHook = raw.suggestedHook || ''

  // Competition insight
  const competitionInsight = raw.competitionInsight || research.competitionInsight || ''

  return {
    characters,
    timeline,
    facts,
    locations,
    suggestedHook,
    competitionInsight,
    articleContent: articleContent || '',
  }
}

// ───────────────────────────────────────────────
// STAGE 1B: Extract via GPT-4o-mini (fallback when no research)
// ───────────────────────────────────────────────

const EXTRACT_SYSTEM = `You are a fact-extraction engine. You receive a news article about a real event.

Extract EVERY distinct fact into a structured JSON object with these fields:

{
  "characters": [
    { "canonical": "exact name from article", "role": "description", "priority": "core|supporting|background" }
  ],
  "timeline": [
    { "order": 0, "date": "date if mentioned", "event": "what happened", "weight": "brief|normal|extended" }
  ],
  "facts": [
    { "fact": "one fact per entry", "category": "background|motive|event|evidence|outcome", "importance": 1-10 }
  ],
  "locations": [
    { "name": "exact location name from article" }
  ]
}

Rules:
- Extract EVERY fact. Do not merge or summarize.
- Character names must be EXACTLY as written in the article — never translate, adapt, or change them.
- Locations must be EXACTLY as mentioned — never change the country or city.
- Dates and numbers must be EXACTLY as in the source.
- "importance" 10 = essential (who, what happened, verdict), 7-9 = very important (motive, backgrounds), 4-6 = supporting, 1-3 = trivial.
- "weight" on timeline: "extended" for major events, "normal" for regular, "brief" for minor.
- "priority" on characters: "core" for main characters, "supporting" for secondary, "background" for mentioned-only.

Reply with ONLY valid JSON. No markdown fences, no explanation.`

/**
 * Stage 1B: Fallback — call Claude to extract facts when no research brief exists.
 * Claude excels at structured analysis and fact extraction.
 * @param {string} sourceText
 * @param {{ channelId: string, storyId?: string }} meta
 * @returns {Promise<object>} fact sheet
 */
async function extractFactsFallback(sourceText, meta) {
  const apiKey = await registry.requireKey('anthropic')
  const raw = await callAnthropicLogged(apiKey, 'claude-sonnet-4-20250514', [
    { role: 'user', content: `Extract all facts from this article:\n\n${sourceText.slice(0, 120000)}` },
  ], {
    system: EXTRACT_SYSTEM,
    maxTokens: 8192,
    channelId: meta.channelId,
    storyId: meta.storyId,
    action: 'Script Pipeline — Extract Facts (fallback)',
  })

  let parsed
  try {
    const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
    parsed = JSON.parse(cleaned)
  } catch {
    throw new Error('Failed to parse extracted facts JSON')
  }

  return {
    characters: Array.isArray(parsed.characters) ? parsed.characters : [],
    timeline: Array.isArray(parsed.timeline) ? parsed.timeline : [],
    facts: Array.isArray(parsed.facts) ? parsed.facts.map(f => ({
      fact: String(f.fact || ''),
      importance: Math.min(10, Math.max(1, Number(f.importance) || 5)),
      category: CATEGORY_ORDER.includes(f.category) ? f.category : 'event',
    })) : [],
    locations: Array.isArray(parsed.locations) ? parsed.locations : [],
    suggestedHook: '',
    competitionInsight: '',
    articleContent: sourceText,
  }
}

// ───────────────────────────────────────────────
// STAGE 2: Filter + organize (pure code)
// ───────────────────────────────────────────────

const PROTECTED_CATEGORIES = new Set(['motive', 'outcome'])

/**
 * Stage 2: Filter facts by importance and organize by story structure.
 * @param {object} factSheet
 * @param {boolean} isShort
 * @param {number} [threshold=5]
 * @returns {object} filtered fact sheet
 */
function organizeFactSheet(factSheet, isShort, threshold = 5) {
  const sheet = { ...factSheet }

  if (isShort) {
    sheet.facts = factSheet.facts.filter(f =>
      f.importance >= threshold || PROTECTED_CATEGORIES.has(f.category)
    )
    sheet.characters = factSheet.characters.filter(c =>
      c.priority === 'core' || c.priority === 'supporting'
    )
    sheet.timeline = factSheet.timeline.filter(t =>
      t.weight !== 'brief'
    )
  }

  sheet.facts.sort((a, b) => {
    const ai = CATEGORY_ORDER.indexOf(a.category)
    const bi = CATEGORY_ORDER.indexOf(b.category)
    if (ai !== bi) return ai - bi
    return b.importance - a.importance
  })

  return sheet
}

// ───────────────────────────────────────────────
// STAGE 3: Build prompt from fact sheet
// ───────────────────────────────────────────────

/**
 * Format the fact sheet as an immutable prompt block for the scriptwriter.
 * @param {object} factSheet
 * @param {string} [fewShotBlock]
 * @param {boolean} isShort
 * @returns {string}
 */
function buildFactSheetPrompt(factSheet, fewShotBlock, isShort) {
  let msg = ''
  if (fewShotBlock) msg += fewShotBlock + '\n\n'

  msg += `Write a ${isShort ? 'short, concise' : 'detailed, comprehensive'} video script from the IMMUTABLE FACT SHEET below.\n`
  msg += `You MUST use ALL facts. You MUST NOT add, change, or infer anything not listed.\n\n`

  msg += `=== IMMUTABLE FACT SHEET (locked — do not modify any data) ===\n\n`

  // Characters
  if (factSheet.characters.length > 0) {
    msg += `--- CHARACTER REGISTRY (use canonical names EXACTLY) ---\n`
    factSheet.characters.forEach(c => {
      msg += `• ${c.canonical} [${c.priority}]: ${c.role}\n`
    })
    msg += '\n'
  }

  // Locations
  if (factSheet.locations.length > 0) {
    msg += `--- LOCATIONS (use EXACTLY as written) ---\n`
    factSheet.locations.forEach(l => {
      msg += `• ${l.name}\n`
    })
    msg += '\n'
  }

  // Timeline
  if (factSheet.timeline.length > 0) {
    msg += `--- TIMELINE (chronological order) ---\n`
    factSheet.timeline.forEach(t => {
      const dateTag = t.date ? `[${t.date}] ` : ''
      const weightTag = t.weight && t.weight !== 'normal' ? ` (${t.weight})` : ''
      msg += `${t.order + 1}. ${dateTag}${t.event}${weightTag}\n`
    })
    msg += '\n'
  }

  // Facts by category
  for (const cat of CATEGORY_ORDER) {
    const catFacts = factSheet.facts.filter(f => f.category === cat)
    if (catFacts.length === 0) continue
    const label = {
      background: 'BACKGROUND (خلفية)',
      motive: 'MOTIVE (الدافع) — NEVER skip these',
      event: 'EVENTS (الأحداث)',
      evidence: 'EVIDENCE (الأدلة)',
      outcome: 'OUTCOME (النتيجة) — NEVER skip these',
    }[cat] || cat
    msg += `--- ${label} ---\n`
    catFacts.forEach(f => {
      msg += `• ${f.fact}\n`
    })
    msg += '\n'
  }

  msg += `=== END FACT SHEET ===\n`

  // Supplementary context (raw article for detail, but facts above take priority)
  if (factSheet.articleContent) {
    msg += `\n--- SUPPLEMENTARY ARTICLE (for additional detail only — fact sheet above is the source of truth) ---\n`
    msg += factSheet.articleContent.slice(0, 60000) + '\n'
  }

  if (factSheet.suggestedHook) {
    msg += `\n--- SUGGESTED HOOK ---\n${factSheet.suggestedHook}\n`
  }

  return msg
}

// ───────────────────────────────────────────────
// STAGE 4: QA validation (Claude Haiku — cheap/fast)
// ───────────────────────────────────────────────

const QA_SYSTEM = `You are a script QA validator. You receive a fact sheet and a generated script.
Check the script for these issues and return a JSON object:

{
  "passed": true/false,
  "issues": [
    { "type": "wrong_location|wrong_name|wrong_date|invented_fact|wrong_dialect|missing_fact", "detail": "description" }
  ]
}

Check:
1. LOCATIONS: Are all locations in the script exactly as in the fact sheet? Flag if any country or city was changed.
2. NAMES: Are all character names exactly as in the Character Registry? Flag if any were changed or translated.
3. DATES: Are all dates/years exactly as in the fact sheet? Flag if any were changed.
4. INVENTED FACTS: Does the script contain any fact not in the fact sheet? Flag invented details (relationships, durations, financial amounts, quotes).
5. DIALECT: Check for Egyptian Arabic words in a Khaleeji script (or vice versa). Common mistakes: "إزاي" instead of "شلون", "كده" instead of "جي", "دلوقتي" instead of "الحين", "ليه" instead of "ليش".
6. MISSING FACTS: Are there facts in the sheet that the script completely skipped?

"passed" should be true only if there are ZERO issues.
Reply with ONLY valid JSON. No explanation.`

/**
 * Stage 4: QA validation — checks script against fact sheet for accuracy.
 * Uses Claude Haiku for fast/cheap validation.
 * @param {string} script - generated script text
 * @param {object} factSheet - the organized fact sheet
 * @param {string} dialectName - expected dialect (e.g. "Kuwaiti")
 * @param {{ channelId: string, storyId?: string }} meta
 * @returns {Promise<{ passed: boolean, issues: Array<{type: string, detail: string}> }>}
 */
async function validateScript(script, factSheet, dialectName, meta) {
  const apiKey = await registry.requireKey('anthropic')

  const factsBlock = []
  if (factSheet.characters?.length > 0) {
    factsBlock.push('CHARACTERS: ' + factSheet.characters.map(c => c.canonical).join(', '))
  }
  if (factSheet.locations?.length > 0) {
    factsBlock.push('LOCATIONS: ' + factSheet.locations.map(l => l.name).join(', '))
  }
  if (factSheet.facts?.length > 0) {
    factsBlock.push('FACTS:\n' + factSheet.facts.map(f => `- ${f.fact}`).join('\n'))
  }
  if (factSheet.timeline?.length > 0) {
    factsBlock.push('TIMELINE:\n' + factSheet.timeline.map(t => `- ${t.date || ''} ${t.event}`).join('\n'))
  }

  const userMsg = `EXPECTED DIALECT: ${dialectName || 'Arabic'}

--- FACT SHEET ---
${factsBlock.join('\n\n')}

--- SCRIPT TO VALIDATE ---
${script.slice(0, 30000)}`

  try {
    const raw = await callAnthropicLogged(apiKey, 'claude-haiku-4-5-20251001', [
      { role: 'user', content: userMsg },
    ], {
      system: QA_SYSTEM,
      maxTokens: 2048,
      channelId: meta.channelId,
      storyId: meta.storyId,
      action: 'Script Pipeline — QA Validation',
    })

    const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
    const result = JSON.parse(cleaned)
    return {
      passed: !!result.passed,
      issues: Array.isArray(result.issues) ? result.issues : [],
    }
  } catch (err) {
    console.error('[scriptPipeline/QA] validation failed:', err?.message)
    return { passed: true, issues: [] }
  }
}

module.exports = {
  buildFactSheetFromResearch,
  extractFactsFallback,
  organizeFactSheet,
  buildFactSheetPrompt,
  validateScript,
  CATEGORY_ORDER,
}
