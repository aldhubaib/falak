/**
 * Typed service errors — lets the pipeline distinguish config/quota problems
 * (non-retryable) from transient failures (retryable).
 *
 * Workers inspect `err.isServiceError` + `err.retryable` to decide whether to
 * block the item (preserving retries) or re-queue it (consuming a retry).
 */

class ServiceError extends Error {
  constructor(service, message) {
    super(message)
    this.name = 'ServiceError'
    this.service = service
    this.isServiceError = true
    this.retryable = false
  }
}

class ServiceKeyMissingError extends ServiceError {
  constructor(service, displayName) {
    super(service, `${displayName || service} API key not configured. Add it in Settings → API Keys.`)
    this.name = 'ServiceKeyMissingError'
    this.code = 'KEY_MISSING'
  }
}

class ServiceKeyInvalidError extends ServiceError {
  constructor(service, detail) {
    super(service, `${service} API key is invalid or revoked: ${detail}`)
    this.name = 'ServiceKeyInvalidError'
    this.code = 'KEY_INVALID'
  }
}

class ServiceQuotaExhaustedError extends ServiceError {
  constructor(service, detail) {
    super(service, `${service} quota/balance exhausted: ${detail}`)
    this.name = 'ServiceQuotaExhaustedError'
    this.code = 'QUOTA_EXHAUSTED'
  }
}

class ServiceTransientError extends ServiceError {
  constructor(service, detail) {
    super(service, `${service} temporary failure: ${detail}`)
    this.name = 'ServiceTransientError'
    this.code = 'TRANSIENT'
    this.retryable = true
  }
}

module.exports = {
  ServiceError,
  ServiceKeyMissingError,
  ServiceKeyInvalidError,
  ServiceQuotaExhaustedError,
  ServiceTransientError,
}
