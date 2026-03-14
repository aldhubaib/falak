/**
 * Perplexity Sonar API for story discovery.
 * Uses POST https://api.perplexity.ai/chat/completions (OpenAI-compatible).
 */
const fetch = require('node-fetch')

const PERPLEXITY_URL = 'https://api.perplexity.ai/chat/completions'
const MODEL = 'sonar'

/**
 * Call Perplexity with the given prompt. Returns raw response text.
 * @param {string} apiKey - Perplexity API key
 * @param {string} userPrompt - The search/prompt (e.g. auto-search query from Brain)
 * @param {{ maxTokens?: number }} [opts]
 * @returns {{ text: string, usage?: { total_tokens: number } }}
 */
async function queryPerplexity(apiKey, userPrompt, opts = {}) {
  const maxTokens = opts.maxTokens ?? 4096
  const res = await fetch(PERPLEXITY_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        {
          role: 'user',
          content: userPrompt,
        },
      ],
      max_tokens: maxTokens,
      temperature: 0.2,
    }),
  })

  if (!res.ok) {
    const errBody = await res.text()
    throw new Error(`Perplexity API error ${res.status}: ${errBody.slice(0, 300)}`)
  }

  const data = await res.json()
  const choice = data.choices?.[0]
  const text = choice?.message?.content?.trim() ?? ''
  const usage = data.usage

  return { text, usage }
}

/**
 * Prompt suffix so the model returns a JSON array we can parse.
 */
const JSON_INSTRUCTION = `

Respond with a JSON array of story objects. Each object must have:
- "headline" (string): title of the story
- "summary" (string): 1-2 sentence summary
- "sourceUrl" (string, optional): link to source

Output only the JSON array, no other text. Example:
[{"headline":"...","summary":"...","sourceUrl":"..."}]`

/**
 * Fetch story suggestions from Perplexity and return parsed array.
 * @param {string} apiKey
 * @param {string} autoSearchQuery - Full prompt from Brain v2 (Arabic + instructions)
 * @returns {Promise<Array<{ headline: string, summary?: string, sourceUrl?: string }>>}
 */
async function fetchStorySuggestions(apiKey, autoSearchQuery) {
  const prompt = autoSearchQuery + JSON_INSTRUCTION
  const { text } = await queryPerplexity(apiKey, prompt, { maxTokens: 4096 })

  const parsed = parseStoriesFromResponse(text)
  return parsed
}

/**
 * Extract JSON array of stories from response. Tolerates markdown or extra text.
 */
function parseStoriesFromResponse(text) {
  if (!text || typeof text !== 'string') return []

  // Try to find a JSON array in the response (last [ ... ] often)
  const arrayMatch = text.match(/\[[\s\S]*\]/)
  if (!arrayMatch) return []

  try {
    const arr = JSON.parse(arrayMatch[0])
    if (!Array.isArray(arr)) return []
    return arr
      .filter((item) => item && typeof item.headline === 'string' && item.headline.trim())
      .map((item) => ({
        headline: String(item.headline).trim(),
        summary: item.summary != null ? String(item.summary).trim() : null,
        sourceUrl: item.sourceUrl != null ? String(item.sourceUrl).trim() || null : null,
      }))
  } catch {
    return []
  }
}

module.exports = { queryPerplexity, fetchStorySuggestions, parseStoriesFromResponse }
