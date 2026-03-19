/**
 * Serialise objects for JSON response: BigInt → string so JSON.stringify never throws.
 * Call explicitly in routes that return BigInt fields (Channel, Video, ChannelSnapshot,
 * GalleryMedia, ScoreProfile). NOT applied globally via Prisma middleware — that was
 * too expensive (deep-clone on every query).
 */
function serialise(obj) {
  if (obj === undefined || obj === null) return obj
  return JSON.parse(
    JSON.stringify(obj, (_, v) => (typeof v === 'bigint' ? v.toString() : v))
  )
}

/**
 * Express middleware: patches res.json to auto-serialise BigInts.
 * Mount on routers that return BigInt fields to avoid manual serialise() calls.
 */
function bigintJson(req, res, next) {
  const origJson = res.json.bind(res)
  res.json = (body) => origJson(serialise(body))
  next()
}

module.exports = { serialise, bigintJson }
