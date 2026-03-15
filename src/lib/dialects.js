const db = require('./db')

const DEFAULT_ENGINE = 'claude'

/**
 * Get dialect for a country code (and optional engine).
 * Used when building AI prompts so we know which Arabic dialect to use.
 * @param {string} countryCode - ISO 3166-1 alpha-2 (e.g. SA, KW) or MSA
 * @param {string} [engine='claude'] - AI engine (e.g. claude, openai)
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

module.exports = { getDialectForCountry, DEFAULT_ENGINE }
