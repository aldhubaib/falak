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

const ENGINE = 'claude'

async function main() {
  for (const [countryCode, row] of Object.entries(DIALECTS_CLAUDE)) {
    await prisma.dialect.upsert({
      where: {
        countryCode_engine: { countryCode, engine: ENGINE }
      },
      create: {
        countryCode,
        engine: ENGINE,
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
  }
  console.log(`Seeded ${Object.keys(DIALECTS_CLAUDE).length} dialects for engine "${ENGINE}".`)
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e)
    prisma.$disconnect()
    process.exit(1)
  })
