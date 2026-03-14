const { z } = require('zod')
const { ValidationError } = require('../middleware/errors')

/**
 * Parse request body with Zod schema; throw ValidationError on failure.
 */
function parseBody(body, schema) {
  const result = schema.safeParse(body || {})
  if (!result.success) {
    const details = result.error.flatten().fieldErrors
    throw ValidationError(result.error.message, details)
  }
  return result.data
}

/**
 * Parse query with Zod schema; throw ValidationError on failure.
 */
function parseQuery(query, schema) {
  const result = schema.safeParse(query || {})
  if (!result.success) {
    const details = result.error.flatten().fieldErrors
    throw ValidationError(result.error.message, details)
  }
  return result.data
}

module.exports = { parseBody, parseQuery }
