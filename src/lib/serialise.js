/**
 * Serialise objects for JSON response: BigInt → string so JSON.stringify never throws.
 * Used by Prisma middleware (db.js) and can be used by routes for ad-hoc objects.
 */
function serialise(obj) {
  if (obj === undefined || obj === null) return obj
  return JSON.parse(
    JSON.stringify(obj, (_, v) => (typeof v === 'bigint' ? v.toString() : v))
  )
}

module.exports = { serialise }
