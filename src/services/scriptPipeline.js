/**
 * 3-stage script generation pipeline:
 *   Stage 1 — Extract facts + weight (GPT-4o-mini)
 *   Stage 2 — Filter + organize (pure code)
 *   Stage 3 — Write script (GPT-4o, streaming or blocking)
 */
const { callOpenAILogged } = require('./openaiChat')

const CATEGORY_ORDER = ['background', 'motive', 'event', 'evidence', 'outcome']

// ───────────────────────────────────────────────
// STAGE 1: Extract & weight facts
// ───────────────────────────────────────────────

const EXTRACT_SYSTEM = `You are a fact-extraction engine. You receive a news article or research brief about a real event.

Your job is to extract EVERY distinct fact into a structured JSON array. Do not summarize — extract each fact individually.

For each fact, provide:
- "fact": The fact itself in Arabic, stated clearly in one sentence.
- "importance": A number from 1-10.
  - 10 = absolutely essential (who died, who did it, the verdict)
  - 7-9 = very important (motive, method, key evidence, main characters' backgrounds)
  - 4-6 = supporting detail (secondary characters, minor timeline points)
  - 1-3 = trivial (minor procedural details that could be cut)
- "category": One of: "background", "motive", "event", "evidence", "outcome"
  - "background" = character introductions, jobs, locations, family, relationships, living situations
  - "motive" = why someone did something, what drove the action, the plan, the trigger
  - "event" = what physically happened (the crime, the incident, the action)
  - "evidence" = how it was discovered, investigation details, proof, confessions, surveillance
  - "outcome" = verdict, sentence, consequences, aftermath
- "characters": Array of character names mentioned in this fact.

Rules:
- Extract EVERY fact. Do not merge or summarize multiple facts into one.
- Character backgrounds (job, where they work, where they live, family) are separate facts — each one matters.
- If a fact explains WHY something happened, category MUST be "motive" and importance MUST be >= 7.
- Relationships between characters are "background" facts with importance >= 7.
- The plan/plot details are "motive" facts.
- Physical actions (killing, disposing, fleeing) are "event" facts.
- Discovery, confessions, forensic findings are "evidence" facts.

Reply with ONLY a valid JSON array. No markdown fences, no explanation.`

/**
 * Stage 1: Call GPT-4o-mini to extract structured facts from source material.
 * @param {string} sourceText - article/research content
 * @param {{ channelId: string, storyId?: string }} meta
 * @returns {Promise<Array<{ fact: string, importance: number, category: string, characters: string[] }>>}
 */
async function extractFacts(sourceText, meta) {
  const raw = await callOpenAILogged('gpt-4o-mini', [
    { role: 'user', content: `Extract all facts from this article:\n\n${sourceText.slice(0, 120000)}` },
  ], {
    system: EXTRACT_SYSTEM,
    maxTokens: 8192,
    temperature: 0.2,
    channelId: meta.channelId,
    storyId: meta.storyId,
    action: 'Script Pipeline — Extract Facts',
  })

  let facts
  try {
    const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
    facts = JSON.parse(cleaned)
  } catch {
    throw new Error('Failed to parse extracted facts JSON')
  }

  if (!Array.isArray(facts)) throw new Error('Extracted facts is not an array')
  return facts.map(f => ({
    fact: String(f.fact || ''),
    importance: Math.min(10, Math.max(1, Number(f.importance) || 5)),
    category: CATEGORY_ORDER.includes(f.category) ? f.category : 'event',
    characters: Array.isArray(f.characters) ? f.characters : [],
  }))
}

// ───────────────────────────────────────────────
// STAGE 2: Filter + organize (pure code)
// ───────────────────────────────────────────────

const PROTECTED_CATEGORIES = new Set(['motive', 'outcome'])

/**
 * Stage 2: Filter facts by importance threshold and organize by story structure.
 * @param {Array} facts - from Stage 1
 * @param {boolean} isShort
 * @param {number} [threshold=5] - minimum importance for short mode
 * @returns {{ included: Array, excluded: Array }}
 */
function organizeFacts(facts, isShort, threshold = 5) {
  let included, excluded

  if (isShort) {
    included = facts.filter(f =>
      f.importance >= threshold || PROTECTED_CATEGORIES.has(f.category)
    )
    excluded = facts.filter(f =>
      f.importance < threshold && !PROTECTED_CATEGORIES.has(f.category)
    )
  } else {
    included = [...facts]
    excluded = []
  }

  included.sort((a, b) => {
    const ai = CATEGORY_ORDER.indexOf(a.category)
    const bi = CATEGORY_ORDER.indexOf(b.category)
    if (ai !== bi) return ai - bi
    return b.importance - a.importance
  })

  return { included, excluded }
}

// ───────────────────────────────────────────────
// STAGE 3: Build the writing prompt from facts
// ───────────────────────────────────────────────

/**
 * Build the user message for Stage 3 from organized facts.
 * @param {Array} facts - organized facts from Stage 2
 * @param {string} [fewShotBlock]
 * @param {boolean} isShort
 * @returns {string}
 */
function buildFactsUserMessage(facts, fewShotBlock, isShort) {
  let msg = ''
  if (fewShotBlock) msg += fewShotBlock + '\n\n'

  msg += `Write a ${isShort ? 'short, concise video' : 'detailed, comprehensive video'} script from the following extracted facts.\n`
  msg += `You MUST use ALL the facts below — do not skip any.\n\n`

  for (const cat of CATEGORY_ORDER) {
    const catFacts = facts.filter(f => f.category === cat)
    if (catFacts.length === 0) continue
    const label = {
      background: 'خلفية الشخصيات والأحداث (Background)',
      motive: 'الدوافع والأسباب (Motive)',
      event: 'الأحداث (Events)',
      evidence: 'الأدلة والتحقيقات (Evidence)',
      outcome: 'النتيجة والحكم (Outcome)',
    }[cat] || cat
    msg += `--- ${label} ---\n`
    catFacts.forEach((f, i) => {
      msg += `${i + 1}. [importance: ${f.importance}] ${f.fact}\n`
    })
    msg += '\n'
  }

  return msg
}

module.exports = {
  extractFacts,
  organizeFacts,
  buildFactsUserMessage,
  CATEGORY_ORDER,
}
