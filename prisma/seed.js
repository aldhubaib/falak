const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

const DIALECTS_CLAUDE = {
  KW: { name: 'الكويت',     short: 'اللهجة الكويتية',      long: 'Kuwaiti dialect (اللهجة الكويتية)' },
  SA: { name: 'السعودية',   short: 'اللهجة النجدية',       long: 'Saudi Najdi dialect (اللهجة النجدية)' },
  AE: { name: 'الإمارات',   short: 'اللهجة الإماراتية',    long: 'Emirati dialect (اللهجة الإماراتية)' },
  QA: { name: 'قطر',        short: 'اللهجة القطرية',       long: 'Qatari dialect (اللهجة القطرية)' },
  BH: { name: 'البحرين',    short: 'اللهجة البحرينية',     long: 'Bahraini dialect (اللهجة البحرينية)' },
  OM: { name: 'عُمان',      short: 'اللهجة العُمانية',     long: 'Omani dialect (اللهجة العُمانية)' },
  IQ: { name: 'العراق',     short: 'اللهجة العراقية',      long: 'Iraqi dialect (اللهجة العراقية)' },
  YE: { name: 'اليمن',      short: 'اللهجة اليمنية',       long: 'Yemeni dialect (اللهجة اليمنية)' },
  EG: { name: 'مصر',        short: 'اللهجة المصرية',       long: 'Egyptian dialect (اللهجة المصرية)' },
  LB: { name: 'لبنان',      short: 'اللهجة اللبنانية',     long: 'Lebanese dialect (اللهجة اللبنانية)' },
  SY: { name: 'سوريا',      short: 'اللهجة الشامية',       long: 'Syrian Shami dialect (اللهجة الشامية)' },
  JO: { name: 'الأردن',     short: 'اللهجة الأردنية',      long: 'Jordanian dialect (اللهجة الأردنية)' },
  PS: { name: 'فلسطين',     short: 'اللهجة الفلسطينية',    long: 'Palestinian dialect (اللهجة الفلسطينية)' },
  SD: { name: 'السودان',    short: 'اللهجة السودانية',     long: 'Sudanese dialect (اللهجة السودانية)' },
  LY: { name: 'ليبيا',      short: 'اللهجة الليبية',       long: 'Libyan dialect (اللهجة الليبية)' },
  TN: { name: 'تونس',       short: 'الدارجة التونسية',     long: 'Tunisian Darija (الدارجة التونسية)' },
  DZ: { name: 'الجزائر',    short: 'الدارجة الجزائرية',    long: 'Algerian Darija (الدارجة الجزائرية)' },
  MA: { name: 'المغرب',     short: 'الدارجة المغربية',     long: 'Moroccan Darija (الدارجة المغربية)' },
  MR: { name: 'موريتانيا',  short: 'اللهجة الحسانية',      long: 'Hassaniya dialect (اللهجة الحسانية)' },
  SO: { name: 'الصومال',    short: 'اللهجة الصومالية',     long: 'Somali Arabic dialect (اللهجة الصومالية)' },
  MSA: { name: 'فصحى',      short: 'العربية الفصحى',       long: 'Modern Standard Arabic (العربية الفصحى)' },
}

const DIALECTS_OPENAI = {
  KW: { name: 'الكويت',     short: 'اللهجة الكويتية',      long: 'Write in Kuwaiti Arabic dialect (اللهجة الكويتية). Do not use MSA.' },
  SA: { name: 'السعودية',   short: 'اللهجة النجدية',       long: 'Write in Saudi Najdi Arabic dialect (اللهجة النجدية). Do not use MSA.' },
  AE: { name: 'الإمارات',   short: 'اللهجة الإماراتية',    long: 'Write in Emirati Arabic dialect (اللهجة الإماراتية). Do not use MSA.' },
  QA: { name: 'قطر',        short: 'اللهجة القطرية',       long: 'Write in Qatari Arabic dialect (اللهجة القطرية). Do not use MSA.' },
  BH: { name: 'البحرين',    short: 'اللهجة البحرينية',     long: 'Write in Bahraini Arabic dialect (اللهجة البحرينية). Do not use MSA.' },
  OM: { name: 'عُمان',      short: 'اللهجة العُمانية',     long: 'Write in Omani Arabic dialect (اللهجة العُمانية). Do not use MSA.' },
  IQ: { name: 'العراق',     short: 'اللهجة العراقية',      long: 'Write in Iraqi Arabic dialect (اللهجة العراقية). Do not use MSA.' },
  YE: { name: 'اليمن',      short: 'اللهجة اليمنية',       long: 'Write in Yemeni Arabic dialect (اللهجة اليمنية). Do not use MSA.' },
  EG: { name: 'مصر',        short: 'اللهجة المصرية',       long: 'Write in Egyptian Arabic dialect (اللهجة المصرية). Do not use MSA.' },
  LB: { name: 'لبنان',      short: 'اللهجة اللبنانية',     long: 'Write in Lebanese Arabic dialect (اللهجة اللبنانية). Do not use MSA.' },
  SY: { name: 'سوريا',      short: 'اللهجة الشامية',       long: 'Write in Syrian Shami Arabic dialect (اللهجة الشامية). Do not use MSA.' },
  JO: { name: 'الأردن',     short: 'اللهجة الأردنية',      long: 'Write in Jordanian Arabic dialect (اللهجة الأردنية). Do not use MSA.' },
  PS: { name: 'فلسطين',     short: 'اللهجة الفلسطينية',    long: 'Write in Palestinian Arabic dialect (اللهجة الفلسطينية). Do not use MSA.' },
  SD: { name: 'السودان',    short: 'اللهجة السودانية',     long: 'Write in Sudanese Arabic dialect (اللهجة السودانية). Do not use MSA.' },
  LY: { name: 'ليبيا',      short: 'اللهجة الليبية',       long: 'Write in Libyan Arabic dialect (اللهجة الليبية). Do not use MSA.' },
  TN: { name: 'تونس',       short: 'الدارجة التونسية',     long: 'Write in Tunisian Darija (الدارجة التونسية). Do not use MSA.' },
  DZ: { name: 'الجزائر',    short: 'الدارجة الجزائرية',    long: 'Write in Algerian Darija (الدارجة الجزائرية). Do not use MSA.' },
  MA: { name: 'المغرب',     short: 'الدارجة المغربية',     long: 'Write in Moroccan Darija (الدارجة المغربية). Do not use MSA.' },
  MR: { name: 'موريتانيا',  short: 'اللهجة الحسانية',      long: 'Write in Hassaniya Arabic dialect (اللهجة الحسانية). Do not use MSA.' },
  SO: { name: 'الصومال',    short: 'اللهجة الصومالية',     long: 'Write in Somali Arabic dialect (اللهجة الصومالية). Do not use MSA.' },
  MSA: { name: 'فصحى',      short: 'العربية الفصحى',       long: 'Write in Modern Standard Arabic (العربية الفصحى / فصحى).' },
}

const ENGINES = [
  { engine: 'claude',  dialects: DIALECTS_CLAUDE },
  { engine: 'openai',  dialects: DIALECTS_OPENAI },
]

const NARRATIVE_DIRECTIONS = [
  {
    slug: 'chronological',
    nameEn: 'Start to End',
    nameAr: 'البداية للنهاية',
    description: 'Hook followed by the story unfolding in chronological order from beginning to end. Events are narrated in the order they happened.',
    detectHint: 'Events are told in the order they happened. The presenter starts with a hook/teaser, then introduces the characters and setting, and walks through events sequentially until the conclusion. No flashbacks or revealing the ending first.',
    sortOrder: 1,
  },
  {
    slug: 'cold-open',
    nameEn: 'End First',
    nameAr: 'النهاية أولاً',
    description: 'Opens with the climax, outcome, or most dramatic moment, then rewinds to explain how events led to that point.',
    detectHint: 'The video opens with the ending or climax (e.g. "someone was found dead", "the company collapsed"). Then the narrator says something like "let\'s go back to the beginning" or "how did we get here?" and tells the story from the start.',
    sortOrder: 2,
  },
  {
    slug: 'mystery-reveal',
    nameEn: 'Gradual Reveal',
    nameAr: 'الكشف التدريجي',
    description: 'Key information is deliberately withheld. Clues are dropped throughout, building suspense until a final reveal at the end.',
    detectHint: 'The presenter teases key information early ("but there\'s something no one knew") and withholds the truth. The story is structured around the mystery — each section reveals a new piece until the full picture emerges at the end.',
    sortOrder: 3,
  },
  {
    slug: 'back-and-forth',
    nameEn: 'Back & Forth',
    nameAr: 'ذهاب وإياب',
    description: 'Jumps between timelines, perspectives, or present/past. The story alternates between different time periods or viewpoints.',
    detectHint: 'The narrative jumps between different time periods (e.g. "meanwhile, 10 years earlier...") or alternates between different characters\' perspectives. The timeline is non-linear with deliberate jumps.',
    sortOrder: 4,
  },
  {
    slug: 'parallel',
    nameEn: 'Parallel Stories',
    nameAr: 'قصص متوازية',
    description: 'Two or more separate storylines are told simultaneously, eventually converging at a shared point.',
    detectHint: 'The narrator introduces two or more seemingly separate storylines or characters. Each is developed independently until they intersect or connect at a key moment.',
    sortOrder: 5,
  },
  {
    slug: 'inverted-pyramid',
    nameEn: 'Key Facts First',
    nameAr: 'الأهم أولاً',
    description: 'Starts with the most important facts and conclusion, then layers in supporting details, context, and background. Journalistic style.',
    detectHint: 'The most critical information is presented upfront — what happened, who was involved, the outcome. Then the narrator adds layers of context, background, and supporting details. No suspense or withholding.',
    sortOrder: 6,
  },
]

async function main() {
  let total = 0
  for (const { engine, dialects } of ENGINES) {
    for (const [countryCode, row] of Object.entries(dialects)) {
      await prisma.dialect.upsert({
        where: {
          countryCode_engine: { countryCode, engine }
        },
        create: {
          countryCode,
          engine,
          name: row.name,
          short: row.short,
          long: row.long,
        },
        update: {
          name: row.name,
          short: row.short,
          long: row.long,
        },
      })
      total++
    }
    console.log(`Seeded ${Object.keys(dialects).length} dialects for engine "${engine}".`)
  }
  console.log(`Total: ${total} dialect entries.`)

  // Seed narrative directions
  for (const dir of NARRATIVE_DIRECTIONS) {
    await prisma.narrativeDirection.upsert({
      where: { slug: dir.slug },
      create: dir,
      update: {
        nameEn: dir.nameEn,
        nameAr: dir.nameAr,
        description: dir.description,
        detectHint: dir.detectHint,
        sortOrder: dir.sortOrder,
      },
    })
  }
  console.log(`Seeded ${NARRATIVE_DIRECTIONS.length} narrative directions.`)
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e)
    prisma.$disconnect()
    process.exit(1)
  })
