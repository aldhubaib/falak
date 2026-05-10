/**
 * Multi-agent script generation pipeline (Fanzy v1 pattern).
 *
 * Agents:
 *   1. RESEARCHER     — SerpAPI + Perplexity + Claude Sonnet synthesis
 *   2. FACT_SHEET     — Code (free) — build + organize immutable fact sheet
 *   3a. WRITER_NARRATOR   — GPT-4o — factual, complete draft
 *   3b. WRITER_STORYTELLER — GPT-4o — dramatic, emotional draft (parallel)
 *   4. EDITOR_MERGE   — Claude Sonnet — merge best of both drafts
 *   5a. QA_ACCURACY   — Claude Haiku — fact check (parallel)
 *   5b. QA_QUALITY    — Claude Haiku — dialect + storytelling check (parallel)
 *   6. EDITOR_FINAL   — GPT-4o — polish with QA feedback
 *
 * QA loop: if critical issues found and round < MAX_QA_ROUNDS, restart from EDITOR_MERGE.
 */
const { callAnthropicLogged } = require('./aiLogger')
const { callOpenAILogged } = require('./openaiChat')
const { researchStory, needsResearch } = require('./storyResearcher')
const registry = require('../lib/serviceRegistry')
const db = require('../lib/db')
const logger = require('../lib/logger')

const CATEGORY_ORDER = ['background', 'motive', 'event', 'evidence', 'outcome']
const MAX_QA_ROUNDS = 2
const RESEARCH_FRESHNESS_MS = 24 * 60 * 60 * 1000

const PIPELINE_STAGES = [
  'research', 'facts', 'writing', 'merging', 'qa', 'polishing', 'done',
]

// ─────────────────────────────────────────────────────────────────────────────
// AGENT 1: RESEARCHER
// ─────────────────────────────────────────────────────────────────────────────

async function runResearcher(story, channelId, opts = {}) {
  const brief = story.brief || {}

  if (!opts.forceResearch && brief.research?.researchedAt) {
    const age = Date.now() - new Date(brief.research.researchedAt).getTime()
    if (age < RESEARCH_FRESHNESS_MS) {
      return { research: brief.research, skipped: true }
    }
  }

  const article = await db.article.findFirst({
    where: { storyId: story.id },
    include: { source: true, channel: true },
  })

  if (!article) {
    return { research: brief.research || null, skipped: true, reason: 'no_article' }
  }

  const result = await researchStory(article, channelId)
  const research = result.researchData || null

  await db.story.update({
    where: { id: story.id },
    data: {
      brief: {
        ...brief,
        research,
        articleContent: brief.articleContent || article.contentClean || article.content || '',
      },
    },
  })

  return { research, skipped: false }
}

// ─────────────────────────────────────────────────────────────────────────────
// AGENT 2: FACT SHEET (code — no AI)
// ─────────────────────────────────────────────────────────────────────────────

function buildFactSheetFromResearch(research, articleContent) {
  const briefObj = research.briefAr || research.brief || {}
  const raw = typeof briefObj === 'string' ? {} : briefObj

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

  const facts = []
  if (raw.whatHappened) facts.push({ fact: raw.whatHappened, category: 'event', importance: 10 })
  if (raw.howItHappened) facts.push({ fact: raw.howItHappened, category: 'motive', importance: 9 })
  if (raw.whatWasTheResult) facts.push({ fact: raw.whatWasTheResult, category: 'outcome', importance: 10 })
  if (Array.isArray(raw.keyFacts)) {
    raw.keyFacts.forEach(f => {
      if (typeof f === 'string' && f.trim()) {
        facts.push({ fact: f.trim(), category: 'event', importance: 8 })
      }
    })
  }

  const locationSet = new Set()
  const locations = []
  if (Array.isArray(raw.timeline)) {
    raw.timeline.forEach(t => {
      const combined = `${t.date || ''} ${t.event || ''}`
      const match = combined.match(/في\s+(.+?)(?:[،,.]|$)/)
      if (match && !locationSet.has(match[1])) {
        locationSet.add(match[1])
        locations.push({ name: match[1], source: 'timeline' })
      }
    })
  }

  return {
    characters, timeline, facts, locations,
    timeReferences: [],
    props: [],
    animals: [],
    suggestedHook: raw.suggestedHook || '',
    competitionInsight: raw.competitionInsight || research.competitionInsight || '',
    articleContent: articleContent || '',
  }
}

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
    timeReferences: Array.isArray(parsed.timeReferences) ? parsed.timeReferences : [],
    props: Array.isArray(parsed.props) ? parsed.props : [],
    animals: Array.isArray(parsed.animals) ? parsed.animals : [],
    suggestedHook: '',
    competitionInsight: '',
    articleContent: sourceText,
  }
}

const EXTRACT_SYSTEM = `You are a fact-extraction engine. You receive a story/article about a real event.

Extract EVERY distinct fact and entity into a structured JSON object. Categorize them so the AI writer understands each part of the story world:

{
  "characters": [
    { "canonical": "exact name from article", "role": "description", "priority": "core|supporting|background", "details": "age, job, appearance, relationships — anything mentioned" }
  ],
  "locations": [
    { "name": "exact location name", "type": "country|city|neighborhood|building|road|other", "significance": "why this place matters to the story" }
  ],
  "timeReferences": [
    { "reference": "exact time/date/period mentioned", "context": "what happened at this time" }
  ],
  "timeline": [
    { "order": 0, "date": "date if mentioned", "event": "what happened", "weight": "brief|normal|extended" }
  ],
  "props": [
    { "item": "object name", "significance": "role in the story — weapon, evidence, vehicle, tool, etc." }
  ],
  "animals": [
    { "animal": "type/name", "significance": "role in the story" }
  ],
  "facts": [
    { "fact": "one fact per entry", "category": "background|motive|event|evidence|outcome", "importance": 1-10 }
  ]
}

Rules:
- Extract EVERY fact and entity. Do not merge or summarize.
- Character names must be EXACTLY as written — never translate, adapt, or change them.
- Locations must be EXACTLY as mentioned — never change the country or city.
- Dates and numbers must be EXACTLY as in the source.
- "props" = any physical objects important to the story: vehicles (car brands, توك توك), weapons (knives, guns), phones, clothing, money, documents, food, etc.
- "animals" = any animals mentioned (pets, livestock, wildlife). Omit if none.
- "timeReferences" = every time marker: years, seasons, times of day, durations (e.g. "6 months", "after Fajr prayer", "end of 2024").
- "importance" 10 = essential, 7-9 = very important, 4-6 = supporting, 1-3 = trivial.
- "weight" on timeline: "extended" for major events, "normal" for regular, "brief" for minor.
- "priority" on characters: "core" for main characters, "supporting" for secondary, "background" for mentioned-only.

Reply with ONLY valid JSON. No markdown fences, no explanation.`

const PROTECTED_CATEGORIES = new Set(['motive', 'outcome'])

function organizeFactSheet(factSheet, isShort, threshold = 5) {
  const sheet = {
    ...factSheet,
    timeReferences: factSheet.timeReferences || [],
    props: factSheet.props || [],
    animals: factSheet.animals || [],
  }
  if (isShort) {
    sheet.facts = factSheet.facts.filter(f =>
      f.importance >= threshold || PROTECTED_CATEGORIES.has(f.category)
    )
    sheet.characters = factSheet.characters.filter(c =>
      c.priority === 'core' || c.priority === 'supporting'
    )
    sheet.timeline = factSheet.timeline.filter(t => t.weight !== 'brief')
  }
  sheet.facts.sort((a, b) => {
    const ai = CATEGORY_ORDER.indexOf(a.category)
    const bi = CATEGORY_ORDER.indexOf(b.category)
    if (ai !== bi) return ai - bi
    return b.importance - a.importance
  })
  return sheet
}

function formatFactSheetBlock(factSheet) {
  let msg = `=== IMMUTABLE FACT SHEET (locked — do not modify any data) ===\n\n`

  if (factSheet.characters.length > 0) {
    msg += `--- CHARACTERS (use canonical names EXACTLY) ---\n`
    factSheet.characters.forEach(c => {
      const details = c.details ? ` — ${c.details}` : ''
      msg += `• ${c.canonical} [${c.priority}]: ${c.role}${details}\n`
    })
    msg += '\n'
  }
  if (factSheet.locations.length > 0) {
    msg += `--- LOCATIONS (use EXACTLY as written — do NOT change countries/cities) ---\n`
    factSheet.locations.forEach(l => {
      const type = l.type ? ` [${l.type}]` : ''
      const sig = l.significance ? ` — ${l.significance}` : ''
      msg += `• ${l.name}${type}${sig}\n`
    })
    msg += '\n'
  }
  if (factSheet.timeReferences && factSheet.timeReferences.length > 0) {
    msg += `--- TIME REFERENCES (use EXACTLY as mentioned) ---\n`
    factSheet.timeReferences.forEach(t => {
      msg += `• ${t.reference}: ${t.context}\n`
    })
    msg += '\n'
  }
  if (factSheet.props && factSheet.props.length > 0) {
    msg += `--- PROPS & OBJECTS ---\n`
    factSheet.props.forEach(p => {
      msg += `• ${p.item}: ${p.significance}\n`
    })
    msg += '\n'
  }
  if (factSheet.animals && factSheet.animals.length > 0) {
    msg += `--- ANIMALS ---\n`
    factSheet.animals.forEach(a => {
      msg += `• ${a.animal}: ${a.significance}\n`
    })
    msg += '\n'
  }
  if (factSheet.timeline.length > 0) {
    msg += `--- TIMELINE (chronological order) ---\n`
    factSheet.timeline.forEach(t => {
      const dateTag = t.date ? `[${t.date}] ` : ''
      const weightTag = t.weight && t.weight !== 'normal' ? ` (${t.weight})` : ''
      msg += `${t.order + 1}. ${dateTag}${t.event}${weightTag}\n`
    })
    msg += '\n'
  }
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
    catFacts.forEach(f => { msg += `• ${f.fact}\n` })
    msg += '\n'
  }
  msg += `=== END FACT SHEET ===\n`

  if (factSheet.suggestedHook) {
    msg += `\n--- SUGGESTED HOOK ---\n${factSheet.suggestedHook}\n`
  }
  return msg
}

// ─────────────────────────────────────────────────────────────────────────────
// AGENT 3a: WRITER — NARRATOR
// ─────────────────────────────────────────────────────────────────────────────

function buildNarratorSystem(ctx) {
  return `You are a factual Arabic YouTube scriptwriter. Your role is the NARRATOR — present every fact clearly and completely.

${ctx.dialectInstruction}

CRITICAL: The dialect is how you SPEAK, not where the story HAPPENED. Never change locations, countries, or dates to match the dialect.

## YOUR FOCUS
- Cover WHO, WHAT, WHEN, WHERE for every character and event
- Include ALL facts from the fact sheet — no omissions
- Character backgrounds (job, family, location) are essential context
- Use exact names, dates, and locations from the CHARACTER REGISTRY and FACT SHEET
- Structure the story chronologically with clear timestamps

## IMMUTABLE FACT SHEET RULES
- Canonical names: use EXACTLY as listed. Never translate, shorten, or invent nicknames.
- Locations: use EXACTLY as listed. Never change the country or city.
- Dates: use EXACTLY as listed. Never round or change them.
- You MUST use EVERY fact provided. Do NOT skip or omit any detail.

## YOU ARE FORBIDDEN FROM
- Inventing facts, quotes, dialogue, or details not in the fact sheet
- Changing any location, country, or city
- Changing any date or year
- Renaming any character
- Adding emotional editorializing beyond what the facts support

## SCRIPT STRUCTURE
1. **Opening hook** (0:00)
${ctx.hookStartBlock ? `2. **Branded hook** — ${ctx.hookStartBlock}` : ''}
3. **Setup** — Introduce all characters with their backgrounds
4. **Events** — Present every event from the timeline
5. **Evidence** — How truth came out
6. **Resolution** — Verdict, consequences
${ctx.hookEndBlock ? `7. **Branded sign-off** — ${ctx.hookEndBlock}` : ''}

${ctx.durationInstruction}
Use timestamp format like 0:00 ... then 0:15 ... then 0:30 ... etc.

## OUTPUT FORMAT
## TITLE
(Arabic title)

## SCRIPT
(timestamped script)

## HASHTAGS
(5–15 relevant YouTube tags, comma-separated, WITHOUT the # symbol)${ctx.styleBlock}${ctx.styleDnaBlock}`
}

// ─────────────────────────────────────────────────────────────────────────────
// AGENT 3b: WRITER — STORYTELLER
// ─────────────────────────────────────────────────────────────────────────────

function buildStorytellerSystem(ctx) {
  return `You are a dramatic Arabic YouTube scriptwriter. Your role is the STORYTELLER — make the audience FEEL the story.

${ctx.dialectInstruction}

CRITICAL: The dialect is how you SPEAK, not where the story HAPPENED. Never change locations, countries, or dates to match the dialect.

## YOUR FOCUS
- Build TENSION and suspense — reveal information strategically
- Explain WHY things happened — motives, emotions, betrayals
- Use compelling hooks, rhetorical questions, and dramatic pauses
- Make the audience care about the characters before the events unfold
- Create a narrative arc: setup → rising tension → climax → resolution

## STORYTELLING RULES
- Always explain the MOTIVE — why did they do it?
- Show the emotional weight: "تخيل..." (imagine...), "شلون ممكن..." (how could...)
- Use contrast: peaceful life vs. dark secret, love vs. betrayal
- Build to the climax — don't reveal the ending too early
- End with a reflection that makes the audience think

## IMMUTABLE FACT SHEET RULES
- You MUST use EVERY fact provided — storytelling adds emotion, not removal
- Canonical names: use EXACTLY as listed
- Locations: use EXACTLY as listed — never change the country or city
- Dates: use EXACTLY as listed

## YOU ARE FORBIDDEN FROM
- Inventing facts, quotes, or details not in the fact sheet
- Changing any location, country, city, date, or character name
- Skipping facts to make the story shorter

## SCRIPT STRUCTURE
1. **Opening hook** (0:00) — compelling question or shocking contrast
${ctx.hookStartBlock ? `2. **Branded hook** — ${ctx.hookStartBlock}` : ''}
3. **Setup** — Introduce characters with emotional context
4. **Rising tension** — Reveal the plan, warning signs, betrayal
5. **The incident** — The climax, don't rush it
6. **Investigation** — How truth came out
7. **Resolution & Reflection** — Verdict + closing thought
${ctx.hookEndBlock ? `8. **Branded sign-off** — ${ctx.hookEndBlock}` : ''}

${ctx.durationInstruction}
Use timestamp format like 0:00 ... then 0:15 ... then 0:30 ... etc.

## OUTPUT FORMAT
## TITLE
(Arabic title)

## SCRIPT
(timestamped script)

## HASHTAGS
(5–15 relevant YouTube tags, comma-separated, WITHOUT the # symbol)${ctx.styleBlock}${ctx.styleDnaBlock}`
}

async function writeScript(role, systemPrompt, userMessage, meta) {
  return callOpenAILogged('gpt-4.1-mini', [
    { role: 'user', content: userMessage },
  ], {
    system: systemPrompt,
    maxTokens: 8192,
    temperature: 0.6,
    channelId: meta.channelId,
    storyId: meta.storyId,
    action: `Script Pipeline — ${role}`,
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// AGENT 4: EDITOR MERGE
// ─────────────────────────────────────────────────────────────────────────────

const MERGE_SYSTEM = `You are an expert Arabic script editor. You receive TWO drafts of the same story:

- **Draft A (Narrator)**: Factually complete and well-structured, but may lack emotional depth.
- **Draft B (Storyteller)**: Emotionally engaging with good tension, but may have skipped some details.

Your job: merge them into ONE final script that has:
1. ALL facts from Draft A (every character, date, location, event — nothing skipped)
2. The storytelling quality and emotional hooks from Draft B
3. The best opening hook from either draft
4. Proper pacing and dramatic arc from Draft B
5. Every factual detail and background from Draft A

RULES:
- Do NOT invent any new facts or change any names/dates/locations
- Do NOT skip any fact that appears in either draft
- Use the same dialect as the drafts
- Keep the same timestamp format (0:00, 0:15, 0:30...)
- Output in the same ## TITLE / ## SCRIPT / ## HASHTAGS format
- Prefer the more emotionally compelling version when both drafts cover the same fact`

async function mergeScripts(draftA, draftB, factSheetBlock, ctx, meta) {
  const apiKey = await registry.requireKey('anthropic')
  const userMsg = `${ctx.dialectInstruction}

${ctx.durationInstruction}

${ctx.hookStartBlock ? `Branded opening hook: ${ctx.hookStartBlock}` : ''}
${ctx.hookEndBlock ? `Branded closing hook: ${ctx.hookEndBlock}` : ''}

--- FACT SHEET (reference for completeness check) ---
${factSheetBlock}

--- DRAFT A (Narrator — factually complete) ---
${draftA}

--- DRAFT B (Storyteller — emotionally engaging) ---
${draftB}

Merge these into ONE script. Output ## TITLE, ## SCRIPT, ## HASHTAGS.`

  return callAnthropicLogged(apiKey, 'claude-sonnet-4-20250514', [
    { role: 'user', content: userMsg },
  ], {
    system: MERGE_SYSTEM,
    maxTokens: 8192,
    channelId: meta.channelId,
    storyId: meta.storyId,
    action: 'Script Pipeline — Editor Merge',
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// AGENT 5a: QA — ACCURACY
// ─────────────────────────────────────────────────────────────────────────────

const QA_ACCURACY_SYSTEM = `You are a script QA validator focused on FACTUAL ACCURACY.
You receive a fact sheet and a generated script. Check for these issues and return JSON:

{
  "passed": true/false,
  "issues": [
    { "type": "wrong_location|wrong_name|wrong_date|invented_fact|missing_fact", "severity": "critical|major|minor", "detail": "description" }
  ]
}

Check:
1. LOCATIONS: Are all locations exactly as in the fact sheet? Flag if any country or city was changed.
2. NAMES: Are all character names exactly as in the Character Registry? Flag if changed or translated.
3. DATES: Are all dates/years exactly as in the fact sheet? Flag if changed.
4. INVENTED FACTS: Does the script contain any fact NOT in the fact sheet? Flag invented details.
5. MISSING FACTS: Are there facts in the sheet that the script completely skipped?

Severity: "critical" for wrong names/locations/dates or invented facts. "major" for missing facts. "minor" for trivial omissions.
"passed" = true only if zero critical/major issues.
Reply with ONLY valid JSON.`

async function qaAccuracy(script, factSheet, meta) {
  const apiKey = await registry.requireKey('anthropic')
  const factsBlock = []
  if (factSheet.characters?.length > 0) factsBlock.push('CHARACTERS: ' + factSheet.characters.map(c => c.canonical).join(', '))
  if (factSheet.locations?.length > 0) factsBlock.push('LOCATIONS: ' + factSheet.locations.map(l => l.name).join(', '))
  if (factSheet.facts?.length > 0) factsBlock.push('FACTS:\n' + factSheet.facts.map(f => `- ${f.fact}`).join('\n'))
  if (factSheet.timeline?.length > 0) factsBlock.push('TIMELINE:\n' + factSheet.timeline.map(t => `- ${t.date || ''} ${t.event}`).join('\n'))

  const raw = await callAnthropicLogged(apiKey, 'claude-haiku-4-5-20251001', [
    { role: 'user', content: `--- FACT SHEET ---\n${factsBlock.join('\n\n')}\n\n--- SCRIPT ---\n${script.slice(0, 30000)}` },
  ], {
    system: QA_ACCURACY_SYSTEM,
    maxTokens: 2048,
    channelId: meta.channelId,
    storyId: meta.storyId,
    action: 'Script Pipeline — QA Accuracy',
  })

  try {
    const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
    const result = JSON.parse(cleaned)
    return { passed: !!result.passed, issues: Array.isArray(result.issues) ? result.issues : [] }
  } catch {
    return { passed: true, issues: [] }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// AGENT 5b: QA — QUALITY (dialect + storytelling)
// ─────────────────────────────────────────────────────────────────────────────

const QA_QUALITY_SYSTEM = `You are a script QA validator focused on QUALITY and DIALECT.
You receive a script and the expected dialect. Check for these issues and return JSON:

{
  "passed": true/false,
  "issues": [
    { "type": "wrong_dialect|weak_storytelling|bad_pacing|weak_hook", "severity": "critical|major|minor", "detail": "description" }
  ]
}

Check:
1. DIALECT: Are there words from the WRONG dialect? Common mistakes:
   - Egyptian in Khaleeji: "إزاي" (should be "شلون"), "كده" (should be "جي"), "دلوقتي" (should be "الحين"), "ليه" (should be "ليش"), "أوي" (should be "وايد"), "مش" (should be "مو/ما"), "حاجة" (should be "شي"), "بتاع" (should be "حق/مال")
   - Khaleeji in Egyptian: "شلون" (should be "إزاي"), "وايد" (should be "أوي/كتير")
2. STORYTELLING: Does the script explain WHY things happened, not just WHAT?
3. PACING: Is the hook engaging? Does the story build tension before the climax?
4. HOOK: Does the opening grab attention in the first 10 seconds?

Severity: "critical" for wrong dialect words (3+ instances). "major" for no "why" explanations or flat storytelling. "minor" for pacing issues.
"passed" = true only if zero critical/major issues.
Reply with ONLY valid JSON.`

async function qaQuality(script, dialectName, meta) {
  const apiKey = await registry.requireKey('anthropic')
  const raw = await callAnthropicLogged(apiKey, 'claude-haiku-4-5-20251001', [
    { role: 'user', content: `EXPECTED DIALECT: ${dialectName || 'Arabic'}\n\n--- SCRIPT ---\n${script.slice(0, 30000)}` },
  ], {
    system: QA_QUALITY_SYSTEM,
    maxTokens: 2048,
    channelId: meta.channelId,
    storyId: meta.storyId,
    action: 'Script Pipeline — QA Quality',
  })

  try {
    const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
    const result = JSON.parse(cleaned)
    return { passed: !!result.passed, issues: Array.isArray(result.issues) ? result.issues : [] }
  } catch {
    return { passed: true, issues: [] }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// AGENT 6: EDITOR FINAL
// ─────────────────────────────────────────────────────────────────────────────

function buildFinalEditorSystem(ctx, qaIssues) {
  const issueBlock = qaIssues.length > 0
    ? '\n\n## QA ISSUES TO FIX\n' + qaIssues.map(i => `- [${i.severity}] ${i.type}: ${i.detail}`).join('\n')
    : ''

  return `You are an expert Arabic script editor doing the FINAL POLISH.

${ctx.dialectInstruction}

CRITICAL: The dialect is how you SPEAK, not where the story HAPPENED. Never change locations, countries, or dates to match the dialect.
${issueBlock}

## YOUR TASK
${qaIssues.length > 0
    ? '- Fix EVERY QA issue listed above\n- Do NOT change correct facts, names, locations, or dates\n- Maintain the dialect throughout\n- Keep the storytelling quality and pacing'
    : '- Light polish: fix any awkward phrasing, improve flow\n- Do NOT change any facts, names, locations, or dates\n- Maintain the dialect throughout'}

## SELF-VALIDATION (check BEFORE outputting)
1. Every character name matches the fact sheet — no nicknames, no translations
2. Every location is EXACTLY as in the fact sheet
3. Every date/year matches the fact sheet
4. The dialect is correct throughout — no wrong-dialect words
5. No facts were invented
6. All facts were used — none skipped

## OUTPUT FORMAT
## TITLE
(Arabic title)

## SCRIPT
(timestamped script)

## HASHTAGS
(5–15 relevant YouTube tags, comma-separated, WITHOUT the # symbol)${ctx.styleBlock}${ctx.styleDnaBlock}`
}

async function editFinal(script, ctx, qaIssues, meta) {
  const system = buildFinalEditorSystem(ctx, qaIssues)
  return callOpenAILogged('gpt-4.1-mini', [
    { role: 'user', content: `Polish this script. Keep ALL facts intact.\n\n${script}` },
  ], {
    system,
    maxTokens: 8192,
    temperature: 0.4,
    channelId: meta.channelId,
    storyId: meta.storyId,
    action: 'Script Pipeline — Editor Final',
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// ORCHESTRATOR
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run the full multi-agent script pipeline.
 *
 * @param {object} story - Prisma Story row
 * @param {object} channel - Prisma Channel row (with styleGuide, styleDna, etc.)
 * @param {object} opts
 * @param {boolean} opts.isShort
 * @param {string} opts.dialectInstruction
 * @param {string} opts.dialectName
 * @param {string} opts.durationInstruction
 * @param {string} opts.hookStartBlock
 * @param {string} opts.hookEndBlock
 * @param {string} opts.fewShotBlock
 * @param {string} opts.styleBlock
 * @param {string} opts.styleDnaBlock
 * @param {boolean} [opts.forceResearch]
 * @param {function} [opts.onStage] - callback(stageName, data) for progress updates
 * @returns {Promise<object>} pipeline result
 */
async function runScriptPipeline(story, channel, opts = {}) {
  const meta = { channelId: channel.id, storyId: story.id }
  const onStage = opts.onStage || (() => {})
  const pipelineLog = []
  const brief = story.brief || {}

  const ctx = {
    dialectInstruction: opts.dialectInstruction || '',
    durationInstruction: opts.durationInstruction || '',
    hookStartBlock: opts.hookStartBlock || '',
    hookEndBlock: opts.hookEndBlock || '',
    styleBlock: opts.styleBlock || '',
    styleDnaBlock: opts.styleDnaBlock || '',
  }

  const logStep = (agent, data) => {
    pipelineLog.push({ agent, ts: new Date().toISOString(), ...data })
  }

  // ── Stage 1: RESEARCHER ──────────────────────────────────────────────────
  onStage('research', { message: 'Researching story...' })
  let research
  try {
    const result = await runResearcher(story, channel.id, { forceResearch: opts.forceResearch })
    research = result.research
    logStep('RESEARCHER', { status: 'ok', skipped: result.skipped })
    onStage('research_done', { skipped: result.skipped })
  } catch (err) {
    logStep('RESEARCHER', { status: 'error', error: err.message })
    research = brief.research || null
    onStage('research_done', { skipped: true, error: err.message })
  }

  // ── Stage 2: FACT SHEET ──────────────────────────────────────────────────
  onStage('facts', { message: 'Building fact sheet...' })
  const articleContent = brief.articleContent || ''
  let factSheet
  try {
    if (research?.brief || research?.briefAr) {
      factSheet = buildFactSheetFromResearch(research, articleContent)
    } else if (articleContent && articleContent !== '__SCRAPE_FAILED__' && articleContent !== '__YOUTUBE__') {
      factSheet = await extractFactsFallback(articleContent.slice(0, 120000), meta)
    } else {
      throw new Error('No research data or article content available')
    }
  } catch (err) {
    logStep('FACT_SHEET', { status: 'error', error: err.message })
    throw err
  }

  const organized = organizeFactSheet(factSheet, opts.isShort)
  const factSheetBlock = formatFactSheetBlock(organized)
  logStep('FACT_SHEET', { status: 'ok', factsCount: organized.facts.length, charactersCount: organized.characters.length })
  onStage('facts_done', { factsCount: organized.facts.length, charactersCount: organized.characters.length })

  // ── Stage 3: DUAL WRITERS (parallel) ─────────────────────────────────────
  onStage('writing', { message: 'Writing drafts (narrator + storyteller)...' })

  const fewShotPrefix = opts.fewShotBlock ? opts.fewShotBlock + '\n\n' : ''
  const userMessage = fewShotPrefix +
    `Write a ${opts.isShort ? 'short, concise' : 'detailed, comprehensive'} video script from the IMMUTABLE FACT SHEET below.\n` +
    `You MUST use ALL facts. You MUST NOT add, change, or infer anything not listed.\n\n` +
    factSheetBlock +
    (brief.uniqueAngle ? `\n--- UNIQUE ANGLE ---\n${brief.uniqueAngle}\n` : '')

  const narratorSystem = buildNarratorSystem(ctx)
  const storytellerSystem = buildStorytellerSystem(ctx)

  const draftNarrator = await writeScript('Writer Narrator', narratorSystem, userMessage, meta)
  const draftStoryteller = await writeScript('Writer Storyteller', storytellerSystem, userMessage, meta)

  logStep('WRITER_NARRATOR', { status: 'ok', length: draftNarrator.length })
  logStep('WRITER_STORYTELLER', { status: 'ok', length: draftStoryteller.length })
  onStage('writing_done', { narratorLength: draftNarrator.length, storytellerLength: draftStoryteller.length })

  // ── QA Loop ──────────────────────────────────────────────────────────────
  let mergedScript = ''
  let allQaIssues = []
  let qaRound = 0
  let qaPassed = false

  for (qaRound = 0; qaRound < MAX_QA_ROUNDS; qaRound++) {
    // ── Stage 4: EDITOR MERGE ──────────────────────────────────────────────
    onStage('merging', { message: qaRound === 0 ? 'Merging drafts...' : `Re-merging (revision ${qaRound + 1})...`, round: qaRound })

    if (qaRound === 0) {
      mergedScript = await mergeScripts(draftNarrator, draftStoryteller, factSheetBlock, ctx, meta)
    } else {
      const revisionNotes = allQaIssues.map(i => `- [${i.severity}] ${i.type}: ${i.detail}`).join('\n')
      const revisionMsg = `The previous merge had QA issues. Fix them and re-merge:\n\n${revisionNotes}\n\n--- DRAFT A (Narrator) ---\n${draftNarrator}\n\n--- DRAFT B (Storyteller) ---\n${draftStoryteller}\n\n--- PREVIOUS MERGE (has issues) ---\n${mergedScript}`
      const apiKey = await registry.requireKey('anthropic')
      mergedScript = await callAnthropicLogged(apiKey, 'claude-sonnet-4-20250514', [
        { role: 'user', content: revisionMsg },
      ], {
        system: MERGE_SYSTEM + '\n\nIMPORTANT: Fix the QA issues listed above. Do NOT repeat the same mistakes.',
        maxTokens: 8192,
        channelId: meta.channelId,
        storyId: meta.storyId,
        action: `Script Pipeline — Editor Merge (revision ${qaRound + 1})`,
      })
    }

    logStep('EDITOR_MERGE', { status: 'ok', round: qaRound, length: mergedScript.length })
    onStage('merge_done', { round: qaRound })

    // ── Stage 5: DUAL QA (parallel) ────────────────────────────────────────
    onStage('qa', { message: 'Running quality checks...', round: qaRound })

    const [accuracyResult, qualityResult] = await Promise.all([
      qaAccuracy(mergedScript, organized, meta).catch(err => {
        logger.warn({ err: err.message }, '[scriptPipeline] QA accuracy failed')
        return { passed: true, issues: [] }
      }),
      qaQuality(mergedScript, opts.dialectName || 'Arabic', meta).catch(err => {
        logger.warn({ err: err.message }, '[scriptPipeline] QA quality failed')
        return { passed: true, issues: [] }
      }),
    ])

    allQaIssues = [...(accuracyResult.issues || []), ...(qualityResult.issues || [])]
    const hasCritical = allQaIssues.some(i => i.severity === 'critical')
    const hasMajor = allQaIssues.some(i => i.severity === 'major')
    qaPassed = accuracyResult.passed && qualityResult.passed

    logStep('QA_ACCURACY', { status: 'ok', passed: accuracyResult.passed, issues: accuracyResult.issues.length, round: qaRound })
    logStep('QA_QUALITY', { status: 'ok', passed: qualityResult.passed, issues: qualityResult.issues.length, round: qaRound })
    onStage('qa_done', {
      round: qaRound,
      passed: qaPassed,
      accuracyPassed: accuracyResult.passed,
      qualityPassed: qualityResult.passed,
      issues: allQaIssues,
    })

    if (qaPassed || (!hasCritical && !hasMajor)) break
    if (qaRound + 1 >= MAX_QA_ROUNDS) {
      logStep('QA_GATE', { status: 'force_proceed', round: qaRound, reason: 'Max QA rounds reached' })
      break
    }
    logStep('QA_GATE', { status: 'retry', round: qaRound, reason: `${allQaIssues.length} issues found, retrying merge` })
  }

  // ── Stage 6: EDITOR FINAL ────────────────────────────────────────────────
  onStage('polishing', { message: 'Final polish...' })
  const finalScript = await editFinal(mergedScript, ctx, allQaIssues, meta)
  logStep('EDITOR_FINAL', { status: 'ok', length: finalScript.length })
  onStage('done', { message: 'Script complete' })

  return {
    script: finalScript,
    factSheet: organized,
    research,
    qaResult: { passed: qaPassed, issues: allQaIssues, rounds: qaRound + 1 },
    pipelineLog,
    draftNarrator,
    draftStoryteller,
    mergedScript,
  }
}

module.exports = {
  runScriptPipeline,
  buildFactSheetFromResearch,
  extractFactsFallback,
  organizeFactSheet,
  formatFactSheetBlock,
  PIPELINE_STAGES,
  CATEGORY_ORDER,
}
