/**
 * Central error handling: map error types to status codes and stable JSON shape.
 * Routes throw NotFound, ValidationError, etc.; this middleware catches and responds.
 */

function NotFound(message = 'Not found') {
  const err = new Error(message)
  err.name = 'NotFound'
  err.statusCode = 404
  err.code = 'NOT_FOUND'
  return err
}

function ValidationError(message = 'Validation failed', details = null) {
  const err = new Error(message)
  err.name = 'ValidationError'
  err.statusCode = 400
  err.code = 'VALIDATION_ERROR'
  err.details = details
  return err
}

function Unauthorized(message = 'Not authenticated') {
  const err = new Error(message)
  err.name = 'Unauthorized'
  err.statusCode = 401
  err.code = 'UNAUTHORIZED'
  return err
}

function Forbidden(message = 'Insufficient permissions') {
  const err = new Error(message)
  err.name = 'Forbidden'
  err.statusCode = 403
  err.code = 'FORBIDDEN'
  return err
}

NotFound.prototype = Object.create(Error.prototype)
ValidationError.prototype = Object.create(Error.prototype)
Unauthorized.prototype = Object.create(Error.prototype)
Forbidden.prototype = Object.create(Error.prototype)

function getStatusCode(err) {
  if (err.statusCode && err.statusCode >= 400 && err.statusCode < 600) return err.statusCode
  if (err.name === 'NotFound') return 404
  if (err.name === 'ValidationError') return 400
  if (err.name === 'Unauthorized') return 401
  if (err.name === 'Forbidden') return 403
  if (err.code === 'P2025') return 404 // Prisma "Record not found"
  return 500
}

function getErrorCode(err) {
  if (err.code === 'P2025') return 'NOT_FOUND'
  return err.code || (err.statusCode === 404 ? 'NOT_FOUND' : err.statusCode === 400 ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR')
}

function errorHandler(err, req, res, next) {
  if (!err) return next()
  const statusCode = getStatusCode(err)
  const code = getErrorCode(err)
  const message = err.code === 'P2025' ? 'Record not found' : (err.message || 'An error occurred')
  const payload = { error: { code, message } }
  if (err.details && statusCode === 400) payload.error.details = err.details

  const config = require('../config')
  const logger = require('../lib/logger')
  if (config.NODE_ENV !== 'production' && statusCode >= 500) {
    logger.error({ err, requestId: req.id, method: req.method, path: req.path, statusCode }, message)
  }

  res.status(statusCode).json(payload)
}

/** Wraps async Express route handlers so errors are forwarded to the error middleware (Express 4). */
function asyncWrap(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)
}

module.exports = {
  NotFound,
  ValidationError,
  Unauthorized,
  Forbidden,
  errorHandler,
  asyncWrap,
}
