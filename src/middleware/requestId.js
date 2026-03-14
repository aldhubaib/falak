/**
 * Attach a unique request id to each request (X-Request-Id or generate).
 * Use in logging and error responses.
 */
const crypto = require('crypto')

const HEADER = 'x-request-id'

function requestIdMiddleware(req, res, next) {
  const id = req.get(HEADER) || crypto.randomUUID()
  req.id = id
  res.setHeader(HEADER, id)
  next()
}

module.exports = { requestIdMiddleware, HEADER }
