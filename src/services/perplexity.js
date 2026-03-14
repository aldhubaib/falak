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

Reply with a valid JSON array only. Each item: {"headline":"...", "summary":"...", "sourceUrl":"..."}.
Use "headline" for the story title, "summary" for 1-2 sentences, "sourceUrl" for link (or null).
No other text—just the JSON array.`

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
 * Extract JSON array of stories from response. Tolerates markdown code blocks and extra text.
 */
function parseStoriesFromResponse(text) {
  if (!text || typeof text !== 'string') return []

  let jsonStr = text
  // Unwrap markdown code block if present
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlock) jsonStr = codeBlock[1].trim()
  // Find first/largest JSON array
  const arrayMatch = jsonStr.match(/\[[\s\S]*\]/)
  if (arrayMatch) {
    try {
      const arr = JSON.parse(arrayMatch[0])
      if (!Array.isArray(arr)) return fallbackParseHeadlines(text)
      const items = arr
        .filter((item) => item && (typeof item.headline === 'string' || typeof item.title === 'string'))
        .map((item) => {
          const headline = (item.headline ?? item.title ?? '').trim()
          if (!headline) return null
          return {
            headline,
            summary: item.summary != null ? String(item.summary).trim() : null,
            sourceUrl: item.sourceUrl != null ? String(item.sourceUrl).trim() || null : item.url ? String(item.url).trim() : null,
          }
        })
        .filter(Boolean)
      if (items.length > 0) return items
    } catch {
      // fall through to fallback
    }
  }
  return fallbackParseHeadlines(text)
}

/**
 * Fallback: extract lines that look like headlines (numbered or bullet list).
 */
function fallbackParseHeadlines(text) {
  const lines = text.split(/\n/).map((s) => s.trim()).filter(Boolean)
  const out = []
  for (const line of lines) {
    // Numbered: "1. Headline" or "1) Headline"
    const numbered = line.match(/^\d+[.)]\s*(.+)$/)
    // Bullet: "• Headline" or "- Headline" or "* Headline"
    const bullet = line.match(/^[•\-*]\s*(.+)$/)
    const raw = (numbered?.[1] ?? bullet?.[1] ?? line).trim()
    // Skip if it looks like JSON or a URL or too short
    if (raw.length < 4 || raw.startsWith('{') || raw.startsWith('[') || /^https?:\/\//i.test(raw)) continue
    out.push({ headline: raw.slice(0, 300), summary: null, sourceUrl: null })
  }
  return out.slice(0, 12)
}

module.exports = { queryPerplexity, fetchStorySuggestions, parseStoriesFromResponse }
