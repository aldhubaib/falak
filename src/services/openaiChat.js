/**
 * OpenAI Chat Completions — wraps GPT-4o calls with AiGenerationLog audit trail.
 * Mirrors callAnthropicLogged pattern for consistency.
 */
const fetch = require('node-fetch')
const db = require('../lib/db')
const { decrypt } = require('./crypto')
const { trackUsage } = require('./usageTracker')
const registry = require('../lib/serviceRegistry')

const OPENAI_CHAT_URL = 'https://api.openai.com/v1/chat/completions'
const DEFAULT_MODEL = 'gpt-4o'
const FETCH_TIMEOUT_MS = 120_000

/**
 * Call OpenAI Chat Completions and log to AiGenerationLog.
 * @param {string} model - e.g. 'gpt-4o', 'gpt-4o-mini'
 * @param {{ role: string, content: string }[]} messages
 * @param {object} opts
 * @param {string} [opts.system] - system prompt (prepended as system message)
 * @param {number} [opts.maxTokens=4096]
 * @param {number} [opts.temperature=0.7]
 * @param {string} opts.channelId
 * @param {string} [opts.storyId]
 * @param {string} opts.action - audit label
 * @returns {Promise<string>} assistant response text
 */
async function callOpenAILogged(model, messages, opts = {}) {
  const {
    system,
    maxTokens = 4096,
    temperature = 0.7,
    channelId,
    storyId,
    action,
  } = opts

  const apiKey = await registry.requireKey('openai')

  const fullMessages = []
  if (system) fullMessages.push({ role: 'system', content: system })
  fullMessages.push(...messages)

  const body = {
    model: model || DEFAULT_MODEL,
    messages: fullMessages,
    max_tokens: maxTokens,
    temperature,
  }

  const userPrompt = messages.map(m => m.content).join('\n\n---\n\n')
  const start = Date.now()
  let response = null
  let status = 'ok'
  let error = null
  let usage = {}

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    let res
    try {
      res = await fetch(OPENAI_CHAT_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timer)
    }

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}))
      const msg = errBody?.error?.message || `OpenAI ${res.status}`
      trackUsage({ channelId, service: 'openai-chat', action, status: 'fail', error: msg })
      const typed = registry.classifyHttpError('openai', res.status, msg, res.headers)
      if (!typed.retryable) registry.markDown('openai', typed.code, typed.message)
      throw typed
    }

    const data = await res.json()
    usage = data.usage || {}
    const choice = data.choices?.[0]
    response = choice?.message?.content?.trim() || ''
    trackUsage({
      channelId,
      service: 'openai-chat',
      action,
      tokensUsed: (usage.prompt_tokens || 0) + (usage.completion_tokens || 0),
      status: 'ok',
    })
    registry.markUp('openai')
    return response
  } catch (e) {
    status = 'fail'
    error = e.message || String(e)
    throw e
  } finally {
    const durationMs = Date.now() - start
    if (channelId) {
      db.aiGenerationLog.create({
        data: {
          channelId,
          storyId: storyId || null,
          action: action || 'unknown',
          model: model || DEFAULT_MODEL,
          systemPrompt: (system || '').slice(0, 50000) || null,
          userPrompt: (userPrompt || '').slice(0, 50000) || null,
          response: response ? String(response).slice(0, 50000) : null,
          inputTokens: usage.prompt_tokens || null,
          outputTokens: usage.completion_tokens || null,
          durationMs,
          status,
          error: error ? String(error).slice(0, 2000) : null,
        },
      }).catch(e => console.error('[openaiChat] log failed:', e.message))
    }
  }
}

/**
 * Streaming variant of callOpenAILogged — yields text deltas as they arrive.
 * Same signature but returns an async generator instead of a string.
 */
async function * callOpenAIStream(model, messages, opts = {}) {
  const {
    system,
    maxTokens = 4096,
    temperature = 0.7,
    channelId,
    action,
  } = opts

  const apiKey = await registry.requireKey('openai')

  const fullMessages = []
  if (system) fullMessages.push({ role: 'system', content: system })
  fullMessages.push(...messages)

  const body = {
    model: model || DEFAULT_MODEL,
    messages: fullMessages,
    max_tokens: maxTokens,
    temperature,
    stream: true,
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 300_000)

  let res
  try {
    res = await fetch(OPENAI_CHAT_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
  } catch (err) {
    clearTimeout(timer)
    trackUsage({ channelId, service: 'openai-chat', action, status: 'fail', error: err.message })
    throw err
  }

  if (!res.ok) {
    clearTimeout(timer)
    const errBody = await res.json().catch(() => ({}))
    const msg = errBody?.error?.message || `OpenAI ${res.status}`
    trackUsage({ channelId, service: 'openai-chat', action, status: 'fail', error: msg })
    throw new Error(msg)
  }

  try {
    let buffer = ''
    for await (const chunk of res.body) {
      buffer += (chunk instanceof Buffer ? chunk.toString('utf-8') : String(chunk))
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const raw = line.slice(6).trim()
        if (raw === '[DONE]') return
        if (!raw) continue
        try {
          const obj = JSON.parse(raw)
          const delta = obj.choices?.[0]?.delta?.content
          if (delta) yield delta
        } catch (_) {}
      }
    }
  } finally {
    clearTimeout(timer)
    registry.markUp('openai')
  }
}

const SERVICE_DESCRIPTOR = {
  name: 'openai',
  displayName: 'OpenAI Chat (GPT-4o)',
  keySource: 'apiKey',
}

module.exports = { callOpenAILogged, callOpenAIStream, DEFAULT_MODEL, SERVICE_DESCRIPTOR }
