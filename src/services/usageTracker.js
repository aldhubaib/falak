/**
 * Fire-and-forget usage tracking.
 * Called after every external API call (Anthropic, YouTube Data, YT Transcript).
 * Never throws — a tracking failure must never break the calling pipeline stage.
 */
const db = require('../lib/db')

/**
 * @param {object} params
 * @param {string}  params.channelId  - Channel that owns this API usage
 * @param {string}  params.service    - service name shown in the usage dashboard
 * @param {string}  [params.action]   - human-readable call label shown in Usage Dashboard
 * @param {number}  [params.tokensUsed] - total tokens (input+output) for LLM calls
 * @param {'ok'|'fail'} [params.status] - defaults to 'ok'
 * @param {string}  [params.error]    - error message on failure (truncated to 500 chars)
 */
function trackUsage({ channelId, service, action, tokensUsed, status = 'ok', error }) {
  if (!channelId) return
  db.apiUsage
    .create({
      data: {
        channelId,
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
