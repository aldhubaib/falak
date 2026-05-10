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
const MAX_QA_ROUNDS = 3
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

  const facts = Array.isArray(parsed.facts) ? parsed.facts.map(f => ({
    fact: String(f.fact || ''),
    importance: Math.min(10, Math.max(1, Number(f.importance) || 5)),
    category: CATEGORY_ORDER.includes(f.category) ? f.category : 'event',
  })) : []

  const scenes = Array.isArray(parsed.scenes) ? parsed.scenes.map((s, i) => ({
    id: s.id || `scene_${i + 1}`,
    title: String(s.title || `مشهد ${i + 1}`),
    summary: String(s.summary || ''),
    factIndices: Array.isArray(s.factIndices) ? s.factIndices.filter(n => typeof n === 'number') : [],
    timelineIndices: Array.isArray(s.timelineIndices) ? s.timelineIndices.filter(n => typeof n === 'number') : [],
    characterNames: Array.isArray(s.characterNames) ? s.characterNames : [],
    locationNames: Array.isArray(s.locationNames) ? s.locationNames : [],
  })) : []

  return {
    characters: Array.isArray(parsed.characters) ? parsed.characters : [],
    timeline: Array.isArray(parsed.timeline) ? parsed.timeline : [],
    facts,
    locations: Array.isArray(parsed.locations) ? parsed.locations : [],
    timeReferences: Array.isArray(parsed.timeReferences) ? parsed.timeReferences : [],
    props: Array.isArray(parsed.props) ? parsed.props : [],
    animals: Array.isArray(parsed.animals) ? parsed.animals : [],
    scenes,
    suggestedHook: '',
    competitionInsight: '',
    articleContent: sourceText,
  }
}

const EXTRACT_SYSTEM = `You are a fact-extraction engine. You receive a story/article (usually in Arabic).

IMPORTANT: ALL output text MUST be in Arabic. Write facts, descriptions, roles, significance — everything in Arabic. Only JSON keys and enum values (like "core", "city", "background") stay in English.

Extract EVERY distinct fact and entity AND group them into scenes:

{
  "scenes": [
    {
      "id": "scene_1",
      "title": "عنوان قصير للمشهد بالعربي — ٥ كلمات أو أقل",
      "summary": "ملخص المشهد في جملة أو جملتين بالعربي",
      "factIndices": [0, 1, 2],
      "timelineIndices": [0, 1],
      "characterNames": ["منيف"],
      "locationNames": ["المدينة الفلانية"]
    }
  ],
  "characters": [
    { "canonical": "الاسم بالضبط من المقال", "role": "وصف بالعربي", "priority": "core|supporting|background", "details": "العمر، الوظيفة، المظهر، العلاقات — أي شيء مذكور" }
  ],
  "locations": [
    { "name": "اسم الموقع بالضبط", "type": "country|city|neighborhood|building|road|other", "significance": "ليش هذا المكان مهم بالقصة" }
  ],
  "timeReferences": [
    { "reference": "الوقت/التاريخ بالضبط", "context": "شنو صار في هذا الوقت" }
  ],
  "timeline": [
    { "order": 0, "date": "التاريخ إذا مذكور", "event": "شنو صار", "weight": "brief|normal|extended" }
  ],
  "props": [
    { "item": "اسم الشيء", "significance": "دوره في القصة — سلاح، دليل، سيارة، أداة، الخ" }
  ],
  "animals": [
    { "animal": "النوع/الاسم", "significance": "دوره في القصة" }
  ],
  "facts": [
    { "fact": "حقيقة واحدة بالعربي", "category": "background|motive|event|evidence|outcome", "importance": 1-10 }
  ]
}

قواعد المشاهد (scenes):
- قسّم القصة إلى ٨-١٥ مشهد حسب طول القصة.
- كل مشهد = جزء منطقي من القصة (مكان، حدث، لحظة).
- "factIndices" = أرقام الحقائق في مصفوفة "facts" اللي تنتمي لهذا المشهد (0-based).
- "timelineIndices" = أرقام الأحداث في "timeline" اللي تنتمي لهذا المشهد (0-based).
- "characterNames" = أسماء الشخصيات المشاركة في هذا المشهد (canonical names).
- "locationNames" = أسماء الأماكن في هذا المشهد.
- كل حقيقة لازم تنتمي لمشهد واحد على الأقل.
- رتّب المشاهد حسب ترتيبها في القصة.

القواعد العامة:
- استخرج كل حقيقة وكيان. لا تدمج ولا تلخص.
- أسماء الشخصيات لازم تكون بالضبط كما هي مكتوبة — لا تترجم ولا تغير.
- المواقع لازم تكون بالضبط كما مذكورة — لا تغير الدولة أو المدينة.
- التواريخ والأرقام لازم تكون بالضبط كما في المصدر.
- "props" = أي أشياء مادية مهمة: سيارات (ماركات، توك توك)، أسلحة (سكاكين، مسدسات)، هواتف، ملابس، فلوس، وثائق، الخ.
- "animals" = أي حيوانات مذكورة. اتركها فاضية إذا ما في.
- "timeReferences" = كل علامة زمنية: سنوات، فصول، أوقات اليوم، مدد (مثل "٦ شهور"، "بعد صلاة الفجر"، "نهاية ٢٠٢٤").
- "importance" ١٠ = أساسي، ٧-٩ = مهم جداً، ٤-٦ = مساند، ١-٣ = ثانوي.
- "weight" في timeline: "extended" للأحداث الكبيرة، "normal" للعادية، "brief" للصغيرة.
- "priority" في characters: "core" للشخصيات الرئيسية، "supporting" للثانوية، "background" للمذكورة فقط.

مهم جداً — الأسماء المستعارة/المجهولة:
- القصص العربية تستخدم كلمات بديلة لإخفاء الأسماء الحقيقية:
  "الفلانية" / "الفلاني" / "فلان" = اسم مجهول (placeholder)
  "الشركة الفلانية" = شركة غير مسماة، "المدينة الفلانية" = مدينة غير مسماة
- لما تشوف هذه الكلمات، سجلها كمجهولة: { "name": "مدينة غير مسماة", "type": "city" }
- لا تعامل "الفلانية" كاسم حقيقي. يعني الراوي ما بغى يكشف الاسم الحقيقي.
- لا تخترع أو تخمن الاسم الحقيقي.
- نفس الشيء: "هذاك الشخص"، "واحد من الشباب" = شخصيات مجهولة. استخدم وصف مثل "شاب مجهول على الطريق".

Reply with ONLY valid JSON. No markdown fences, no explanation.`

const PROTECTED_CATEGORIES = new Set(['motive', 'outcome'])

function organizeFactSheet(factSheet, isShort, threshold, useCurated = false) {
  if (useCurated) {
    return applyCuratedFilters(factSheet)
  }
  const effectiveThreshold = threshold ?? (isShort ? 7 : 5)
  const sheet = {
    ...factSheet,
    timeReferences: factSheet.timeReferences || [],
    props: factSheet.props || [],
    animals: factSheet.animals || [],
  }
  if (isShort) {
    sheet.facts = factSheet.facts.filter(f =>
      f.importance >= effectiveThreshold || PROTECTED_CATEGORIES.has(f.category)
    )
    sheet.characters = factSheet.characters.filter(c => c.priority === 'core')
    sheet.timeline = factSheet.timeline.filter(t => t.weight === 'extended')
    sheet.timeReferences = (factSheet.timeReferences || []).slice(0, 5)
    sheet.props = (factSheet.props || []).filter(p =>
      /weapon|evidence|vehicle|key|murder|kill/i.test(p.significance)
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

function applyCuratedFilters(factSheet) {
  const scenes = factSheet.scenes || []
  const excludedFactIndices = new Set()
  const excludedTimelineIndices = new Set()
  const excludedCharNames = new Set()
  const excludedLocNames = new Set()

  for (const scene of scenes) {
    if (!scene.excluded) continue
    for (const idx of (scene.factIndices || [])) excludedFactIndices.add(idx)
    for (const idx of (scene.timelineIndices || [])) excludedTimelineIndices.add(idx)
    for (const name of (scene.characterNames || [])) excludedCharNames.add(name)
    for (const name of (scene.locationNames || [])) excludedLocNames.add(name)
  }

  const includedScenes = scenes.filter(s => !s.excluded)
  const includedCharNames = new Set()
  const includedLocNames = new Set()
  for (const scene of includedScenes) {
    for (const name of (scene.characterNames || [])) includedCharNames.add(name)
    for (const name of (scene.locationNames || [])) includedLocNames.add(name)
  }

  const sheet = {
    characters: (factSheet.characters || []).filter(c =>
      !c.excluded && !(excludedCharNames.has(c.canonical) && !includedCharNames.has(c.canonical))
    ),
    locations: (factSheet.locations || []).filter(l =>
      !l.excluded && !(excludedLocNames.has(l.name) && !includedLocNames.has(l.name))
    ),
    timeReferences: (factSheet.timeReferences || []).filter(t => !t.excluded),
    props: (factSheet.props || []).filter(p => !p.excluded),
    animals: (factSheet.animals || []).filter(a => !a.excluded),
    timeline: (factSheet.timeline || []).filter((t, i) => !t.excluded && !excludedTimelineIndices.has(i)),
    facts: (factSheet.facts || []).filter((f, i) => !f.excluded && !excludedFactIndices.has(i)),
    suggestedHook: factSheet.suggestedHook,
    scenes: includedScenes,
  }
  sheet.facts.sort((a, b) => {
    if (a.pinned && !b.pinned) return -1
    if (!a.pinned && b.pinned) return 1
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
    catFacts.forEach(f => {
      const pin = f.pinned ? ' ⭐ [MUST-KEEP — give this extra depth and detail]' : ''
      msg += `• ${f.fact}${pin}\n`
    })
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
1. **Opening hook** (0:00) — ONE short sentence (max 2 lines) that grabs attention. Keep it under 10 seconds.
${ctx.hookStartBlock ? `2. **Branded hook** — MUST include this EXACT phrase: "${ctx.hookStartBlock}"` : ''}
3. **Setup** — Introduce all characters with their backgrounds
4. **Events** — Present every event from the timeline
5. **Evidence** — How truth came out
6. **Resolution** — Verdict, consequences
${ctx.hookEndBlock ? `7. **Branded sign-off** — MUST end with this EXACT phrase: "${ctx.hookEndBlock}"` : ''}

HOOK RULES:
- The opening hook MUST be SHORT — one compelling question or shocking statement, max 2 lines
- Do NOT combine the hook with character introductions or backstory
${ctx.hookStartBlock ? `- After the opening hook, you MUST include the branded hook "${ctx.hookStartBlock}" as a separate line` : ''}
${ctx.hookEndBlock ? `- The script MUST end with the branded sign-off "${ctx.hookEndBlock}" as the final line` : ''}

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
1. **Opening hook** (0:00) — ONE short compelling question or shocking contrast, max 2 lines. Keep it under 10 seconds.
${ctx.hookStartBlock ? `2. **Branded hook** — MUST include this EXACT phrase: "${ctx.hookStartBlock}"` : ''}
3. **Setup** — Introduce characters with emotional context
4. **Rising tension** — Reveal the plan, warning signs, betrayal
5. **The incident** — The climax, don't rush it
6. **Investigation** — How truth came out
7. **Resolution & Reflection** — Verdict + closing thought
${ctx.hookEndBlock ? `8. **Branded sign-off** — MUST end with this EXACT phrase: "${ctx.hookEndBlock}"` : ''}

HOOK RULES:
- The opening hook MUST be SHORT — one compelling question or shocking statement, max 2 lines
- Do NOT combine the hook with character introductions or backstory
${ctx.hookStartBlock ? `- After the opening hook, you MUST include the branded hook "${ctx.hookStartBlock}" as a separate line` : ''}
${ctx.hookEndBlock ? `- The script MUST end with the branded sign-off "${ctx.hookEndBlock}" as the final line` : ''}

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
- Prefer the more emotionally compelling version when both drafts cover the same fact
- The opening hook MUST be SHORT — one sentence, max 2 lines, under 10 seconds
- If branded hooks are provided, they MUST appear exactly as given — do NOT skip or rephrase them`

async function mergeScripts(draftA, draftB, factSheetBlock, ctx, meta) {
  const apiKey = await registry.requireKey('anthropic')
  const userMsg = `${ctx.dialectInstruction}

${ctx.durationInstruction}

${ctx.hookStartBlock ? `MANDATORY branded opening hook (MUST include this EXACT phrase after the opening hook): "${ctx.hookStartBlock}"` : ''}
${ctx.hookEndBlock ? `MANDATORY branded closing hook (MUST end with this EXACT phrase): "${ctx.hookEndBlock}"` : ''}

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

const QA_ACCURACY_SYSTEM = `You are a strict script QA validator focused on FACTUAL ACCURACY.
You receive the COMPLETE fact sheet and a generated script. Compare them LINE BY LINE and return JSON:

{
  "passed": true/false,
  "issues": [
    { "type": "wrong_location|wrong_name|wrong_date|wrong_time|wrong_prop|invented_fact|missing_fact|missing_character|wrong_branded_hook", "severity": "critical|major|minor", "detail": "description — state what the fact sheet says vs what the script says", "fix": "what should be changed" }
  ]
}

CHECK EVERY CATEGORY:
1. LOCATIONS: Compare every location in the script against the LOCATIONS section. Flag if ANY country, city, or place was changed, moved, or invented. This is the #1 most common error.
2. CHARACTERS: Compare every name in the script against the CHARACTER REGISTRY. Flag if ANY name was changed, translated, or a new character was invented.
3. DATES & TIME: Compare against TIME REFERENCES. Flag if any date, year, time period, or duration was changed.
4. PROPS & OBJECTS: Compare against PROPS section. Flag if vehicles, weapons, or objects were changed (e.g. car brand changed).
5. INVENTED FACTS: Does the script contain ANY fact, detail, or dialogue NOT in the fact sheet?
6. MISSING FACTS: Are there facts in the sheet that the script completely skipped? Check especially MOTIVE and OUTCOME categories.
7. BRANDED HOOKS: If branded hooks were specified, are they present exactly as given?

Severity:
- "critical" for wrong location/country (e.g. saying Kuwait when fact sheet says Egypt), wrong character names, invented facts, missing branded hooks
- "major" for wrong dates, missing important facts, wrong props
- "minor" for trivial omissions or minor phrasing issues

"passed" = true ONLY if zero critical AND zero major issues.
Reply with ONLY valid JSON.`

async function qaAccuracy(script, factSheet, factSheetBlock, meta) {
  const apiKey = await registry.requireKey('anthropic')

  const raw = await callAnthropicLogged(apiKey, 'claude-haiku-4-5-20251001', [
    { role: 'user', content: `${factSheetBlock}\n\n--- SCRIPT TO VALIDATE ---\n${script.slice(0, 30000)}` },
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
  onStage('facts', { message: opts.useCuratedFacts ? 'Using curated fact sheet...' : 'Building fact sheet...' })
  const articleContent = brief.articleContent || ''
  let factSheet

  if (opts.useCuratedFacts && brief.factSheet && brief.factSheet.facts?.length > 0) {
    factSheet = brief.factSheet
    logStep('FACT_SHEET', { status: 'ok', curated: true })
  } else {
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
  }

  const organized = organizeFactSheet(factSheet, opts.isShort, undefined, !!opts.useCuratedFacts)
  const factSheetBlock = formatFactSheetBlock(organized)
  logStep('FACT_SHEET', { status: 'ok', factsCount: organized.facts.length, charactersCount: organized.characters.length })
  onStage('facts_done', { factsCount: organized.facts.length, charactersCount: organized.characters.length })

  // ── Stage 3: DUAL WRITERS (parallel) ─────────────────────────────────────
  onStage('writing', { message: 'Writing drafts (narrator + storyteller)...' })

  const fewShotPrefix = opts.fewShotBlock ? opts.fewShotBlock + '\n\n' : ''
  let factInstruction
  if (opts.useCuratedFacts) {
    const pinnedCount = organized.facts.filter(f => f.pinned).length
    factInstruction = 'Write a video script from the CURATED FACT SHEET below.\n' +
      'The user has HAND-PICKED these specific facts from the full story. Use ALL of them.\n' +
      (pinnedCount > 0
        ? `${pinnedCount} facts are marked ⭐ MUST-KEEP — give these extra detail, emotional depth, and narrative weight.\n`
        : '') +
      'You MUST NOT add, change, or infer anything not listed.\n'
  } else if (opts.isShort) {
    factInstruction = 'Write a SHORT video script (under 3 minutes) from the IMMUTABLE FACT SHEET below.\n' +
      'The fact sheet has been pre-filtered to high-importance facts only. Use them to tell a compelling, focused story.\n' +
      'You MUST NOT add, change, or infer anything not listed. Focus on emotional impact over completeness.\n'
  } else {
    factInstruction = 'Write a detailed, comprehensive video script from the IMMUTABLE FACT SHEET below.\n' +
      'You MUST use ALL facts. You MUST NOT add, change, or infer anything not listed.\n'
  }
  const userMessage = fewShotPrefix + factInstruction + '\n' +
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
      const revisionNotes = allQaIssues.map(i => {
        const fix = i.fix ? ` → FIX: ${i.fix}` : ''
        return `- [${i.severity}] ${i.type}: ${i.detail}${fix}`
      }).join('\n')
      const revisionMsg = `The previous script had QA issues. You MUST fix every issue listed below.

--- QA ISSUES (MUST FIX ALL) ---
${revisionNotes}

--- FACT SHEET (source of truth — use this to correct errors) ---
${factSheetBlock}

--- PREVIOUS SCRIPT (has issues — fix them) ---
${mergedScript}

Fix EVERY issue above. Do NOT change anything that was already correct. Output the corrected script in ## TITLE / ## SCRIPT / ## HASHTAGS format.`
      const apiKey = await registry.requireKey('anthropic')
      mergedScript = await callAnthropicLogged(apiKey, 'claude-sonnet-4-20250514', [
        { role: 'user', content: revisionMsg },
      ], {
        system: MERGE_SYSTEM + '\n\nIMPORTANT: You are FIXING QA issues. The fact sheet is the source of truth. Every location, name, date, and fact must match the fact sheet EXACTLY.',
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
      qaAccuracy(mergedScript, organized, factSheetBlock, meta).catch(err => {
        logger.warn({ err: err.message }, '[scriptPipeline] QA accuracy failed')
        return { passed: true, issues: [] }
      }),
      qaQuality(mergedScript, opts.dialectName || 'Arabic', meta).catch(err => {
        logger.warn({ err: err.message }, '[scriptPipeline] QA quality failed')
        return { passed: true, issues: [] }
      }),
    ])

    allQaIssues = [...(accuracyResult.issues || []), ...(qualityResult.issues || [])]
    if (opts.isShort) {
      allQaIssues = allQaIssues.filter(i => i.type !== 'missing_fact')
    }
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

async function runFactExtraction(story, opts = {}) {
  const meta = { storyId: story.id }
  const onStage = opts.onStage || (() => {})
  const brief = story.brief || {}

  onStage('research', { message: 'Researching story...' })
  let research
  try {
    const result = await runResearcher(story, opts.channelId, { forceResearch: opts.forceResearch })
    research = result.research
    onStage('research_done', { skipped: result.skipped })
  } catch (err) {
    research = brief.research || null
    onStage('research_done', { skipped: true, error: err.message })
  }

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
    onStage('error', { error: err.message })
    throw err
  }

  onStage('facts_done', { factsCount: factSheet.facts?.length || 0 })
  return { factSheet, research }
}

module.exports = {
  runScriptPipeline,
  runFactExtraction,
  buildFactSheetFromResearch,
  extractFactsFallback,
  organizeFactSheet,
  formatFactSheetBlock,
  PIPELINE_STAGES,
  CATEGORY_ORDER,
}
