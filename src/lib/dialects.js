const db = require('./db')

const DEFAULT_ENGINE = 'claude'

/**
 * Rich dialect-specific writing instructions.
 * Keyed by country code (ISO 3166-1 alpha-2).
 * Each entry provides specific vocabulary, grammar, and forbidden patterns
 * to ensure the AI writes in the correct dialect instead of defaulting to Egyptian.
 */
const DIALECT_GUIDES = {
  KW: {
    name: 'Kuwaiti Arabic',
    instruction: `DIALECT: Kuwaiti Arabic (كويتي / خليجي)

VOCABULARY — use these naturally:
- "شلون" not "إزاي" (how)
- "وين" not "فين" (where)
- "ليش" not "ليه" (why)
- "هالشي" / "هالسالفة" not "الحاجة دي" (this thing)
- "وايد" not "كتير" or "أوي" (a lot / very)
- "يالله" / "خلنا" not "يلا" (let's go)
- "چي" / "جي" not "كده" (like this)
- "اشوي" not "شوية" (a little)
- "عيل" not "يعني" (so / then)
- "حيل" not "جداً" (very)
- "ادري" / "يدري" not "اعرف" (I know)
- "صج" not "بجد" (really / truly)
- "قاعد" not "بـ" for present continuous
- "الحين" not "دلوقتي" (now)
- "بعدين" (then/later)

GRAMMAR PATTERNS:
- Future tense: "بـ" prefix → "بروح" (I'll go), NOT "هروح"
- Negation: "ما" before verb → "ما يدري" NOT "مش عارف" or "مايعرفش"
- Questions: "شلون" / "ليش" / "وين" / "متى"
- Demonstratives: "هذا" / "هذي" / "هالـ" (this), NOT "ده" / "دي"
- Possessives: "-ه" / "-ها" / "-هم" (standard), NOT Egyptian "-و"

FORBIDDEN — never use these Egyptian/Levantine forms:
- "إزاي" → use "شلون"
- "كده" → use "جي" / "چذي"
- "دلوقتي" → use "الحين"
- "ليه" → use "ليش"
- "فين" → use "وين"
- "أوي" / "كتير" → use "وايد" / "حيل"
- "مش" → use "مو" / "ما"
- "هـ" future prefix → use "بـ" or "راح"
- "بتاع" / "بتاعت" → use "حق" / "مال"
- "حاجة" → use "شي"`,
  },

  SA: {
    name: 'Saudi Arabic',
    instruction: `DIALECT: Saudi Arabic (سعودي / خليجي)

VOCABULARY — use these naturally:
- "وش" / "ايش" not "إزاي" (what/how)
- "وين" not "فين" (where)
- "ليش" / "ليه" (why)
- "كذا" not "كده" (like this)
- "وايد" / "مرة" / "حيل" not "أوي" (very)
- "ذحين" / "الحين" not "دلوقتي" (now)
- "يالله" / "خلنا" (let's)
- "أبد" (never/at all)
- "ادري" / "يدري" (I know)
- "صح" (right/correct)
- "طيب" (ok/fine)

GRAMMAR PATTERNS:
- Future: "بـ" or "راح" → "بروح" / "راح اروح"
- Negation: "ما" → "ما يدري"
- Questions: "وش" / "ايش" / "وين" / "ليش"
- Demonstratives: "هذا" / "هذي" / "ذا"

FORBIDDEN — never use:
- "إزاي" → use "وش" / "كيف"
- "كده" → use "كذا"
- "دلوقتي" → use "الحين"
- "أوي" / "كتير" → use "مرة" / "وايد"
- "مش" → use "مو" / "ما"
- "حاجة" → use "شي"
- "بتاع" → use "حق" / "مال"`,
  },

  EG: {
    name: 'Egyptian Arabic',
    instruction: `DIALECT: Egyptian Arabic (مصري)

VOCABULARY — use these naturally:
- "إزاي" (how)
- "فين" (where)
- "ليه" (why)
- "كده" (like this)
- "أوي" / "جداً" (very)
- "دلوقتي" (now)
- "يلا" (let's)
- "حاجة" (thing)
- "بتاع" / "بتاعت" (belonging to)
- "عشان" (because/for)

GRAMMAR PATTERNS:
- Present continuous: "بـ" prefix → "بيعمل"
- Future: "هـ" prefix → "هيروح"
- Negation: "مش" or "ما...ش" → "مش عارف" / "ماعرفش"
- Questions: "إيه" / "إزاي" / "فين" / "ليه"`,
  },

  AE: {
    name: 'Emirati Arabic',
    instruction: `DIALECT: Emirati Arabic (إماراتي / خليجي)

VOCABULARY — use these naturally:
- "شو" not "إزاي" (what)
- "وين" not "فين" (where)
- "ليش" (why)
- "هيك" / "جي" not "كده" (like this)
- "وايد" not "أوي" (very)
- "الحين" not "دلوقتي" (now)
- "يالله" (let's)
- "ادري" (I know)
- "صج" (really)

GRAMMAR PATTERNS:
- Future: "بـ" or "راح"
- Negation: "ما" → "ما يدري"
- Demonstratives: "هذا" / "هاي"

FORBIDDEN — same as Kuwaiti: no Egyptian forms.`,
  },

  BH: {
    name: 'Bahraini Arabic',
    instruction: `DIALECT: Bahraini Arabic (بحريني / خليجي)
Use the same Khaleeji vocabulary as Kuwaiti: "شلون", "وين", "ليش", "وايد", "الحين", "ادري", "صج", "هالشي".
Negation: "ما". Future: "بـ" or "راح". Never use Egyptian forms.`,
  },

  QA: {
    name: 'Qatari Arabic',
    instruction: `DIALECT: Qatari Arabic (قطري / خليجي)
Use the same Khaleeji vocabulary as Kuwaiti: "شلون", "وين", "ليش", "وايد", "الحين", "ادري", "صج".
Negation: "ما". Future: "بـ" or "راح". Never use Egyptian forms.`,
  },

  OM: {
    name: 'Omani Arabic',
    instruction: `DIALECT: Omani Arabic (عماني / خليجي)
Use Khaleeji vocabulary: "شلون", "وين", "ليش", "وايد", "الحين".
Negation: "ما". Future: "بـ" or "راح". Never use Egyptian forms.`,
  },
}

/**
 * Get dialect for a country code (and optional engine).
 * @param {string} countryCode
 * @param {string} [engine='claude']
 * @returns {Promise<{ name: string, short: string, long: string } | null>}
 */
async function getDialectForCountry(countryCode, engine = DEFAULT_ENGINE) {
  if (!countryCode || typeof countryCode !== 'string') return null
  const code = countryCode.trim().toUpperCase()
  const row = await db.dialect.findUnique({
    where: { countryCode_engine: { countryCode: code, engine } },
    select: { name: true, short: true, long: true },
  })
  return row
}

/**
 * Get the rich dialect guide for a country code.
 * Returns the full vocabulary/grammar/forbidden patterns block.
 * @param {string} countryCode
 * @returns {string} dialect instruction block (empty string if unknown)
 */
function getDialectGuide(countryCode) {
  if (!countryCode || typeof countryCode !== 'string') return ''
  const code = countryCode.trim().toUpperCase()
  const guide = DIALECT_GUIDES[code]
  return guide ? guide.instruction : ''
}

module.exports = { getDialectForCountry, getDialectGuide, DEFAULT_ENGINE }
