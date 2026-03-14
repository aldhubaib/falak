/**
 * Fire-and-forget usage tracking.
 * Called after every external API call (Anthropic, YouTube Data, YT Transcript).
 * Never throws — a tracking failure must never break the calling pipeline stage.
 */
const db = require('../lib/db')

/**
 * @param {object} params
 * @param {string}  params.projectId  - Project that owns this API key
 * @param {string}  params.service    - 'anthropic' | 'youtube-data' | 'yttranscript' | 'perplexity'
 * @param {string}  [params.action]   - human-readable call label shown in Usage Dashboard
 * @param {number}  [params.tokensUsed] - total tokens (input+output) for LLM calls
 * @param {'ok'|'fail'} [params.status] - defaults to 'ok'
 * @param {string}  [params.error]    - error message on failure (truncated to 500 chars)
 */
function trackUsage({ projectId, service, action, tokensUsed, status = 'ok', error }) {
  if (!projectId) return
  db.apiUsage
    .create({
      data: {
        projectId,
        service,
        action: action || null,
        tokensUsed: tokensUsed != null ? Math.round(tokensUsed) : null,
        status,
        error: error ? String(error).slice(0, 500) : null,
      },
    })
    .catch((e) => console.error('[usage] track failed:', e.message))
}

module.exports = { trackUsage }
