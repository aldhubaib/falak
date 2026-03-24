/**
 * AI Generation Logger — wraps callAnthropic to persist every AI call
 * (system prompt, user prompt, full response, tokens, duration) to AiGenerationLog.
 */
const db = require('../lib/db')
const { callAnthropic } = require('./pipelineProcessor')

/**
 * Drop-in replacement for callAnthropic that also logs the call to AiGenerationLog.
 * Accepts the same arguments + an optional `storyId` in the opts.
 */
async function callAnthropicLogged(apiKey, model, messages, opts = {}) {
  const { system, maxTokens, channelId, action, storyId } = opts
  const userPrompt = messages.map(m => m.content).join('\n\n---\n\n')
  const start = Date.now()
  let response = null
  let status = 'ok'
  let error = null

  try {
    response = await callAnthropic(apiKey, model, messages, { system, maxTokens, channelId, action })
    return response
  } catch (e) {
    status = 'fail'
    error = e.message || String(e)
    throw e
  } finally {
    const durationMs = Date.now() - start
    const usage = callAnthropic._lastUsage || {}
    if (channelId) {
      db.aiGenerationLog.create({
        data: {
          channelId,
          storyId: storyId || null,
          action: action || 'unknown',
          model: model || 'unknown',
          systemPrompt: (system || '').slice(0, 50000) || null,
          userPrompt: (userPrompt || '').slice(0, 50000) || null,
          response: response ? String(response).slice(0, 50000) : null,
          inputTokens: usage.inputTokens || null,
          outputTokens: usage.outputTokens || null,
          durationMs,
          status,
          error: error ? String(error).slice(0, 2000) : null,
        },
      }).catch(e => console.error('[aiLogger] log failed:', e.message))
    }
  }
}

module.exports = { callAnthropicLogged }
