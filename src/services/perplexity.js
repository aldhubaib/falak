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
  const citations = Array.isArray(data.citations) ? data.citations : []

  return { text, usage, citations }
}

/**
 * Prompt suffix so the model returns a JSON array we can parse.
 */
const JSON_INSTRUCTION = `

Reply with a valid JSON array only. No other text.
Each item must follow this exact shape:
{"headline":"...","summary":"...","sourceUrl":"..."}

Rules:
- "headline": the story title in Arabic
- "summary": 2-3 sentences explaining what happened
- "sourceUrl": the FULL URL of the original article or source
  (must start with https://, must be a real link, NOT null)
- If you cannot find a real source URL for a story, skip that story entirely
- Only include stories where you have a verified source link
`

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
  if (parsed.length === 0 && text) {
    console.warn('[perplexity] No suggestions parsed. Length:', text.length, 'Snippet:', text.slice(0, 400).replace(/\n/g, ' '))
  }
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
 * Fallback: extract lines that look like headlines (numbered, bullet, or any substantial line).
 */
function fallbackParseHeadlines(text) {
  const lines = text.split(/\n/).map((s) => s.trim()).filter(Boolean)
  const out = []
  for (const line of lines) {
    // Numbered: "1. Headline" or "1) Headline" or "١. Headline" (Arabic numerals)
    const numbered = line.match(/^[\d\u0660-\u0669]+[.)]\s*(.+)$/)
    // Bullet: "• Headline" or "- Headline" or "* Headline" or "–" or "—"
    const bullet = line.match(/^[•\-*–—]\s*(.+)$/)
    // "1- Headline" or "أ- Headline" (letter/number dash)
    const dash = line.match(/^[\w\u0600-\u06FF]+\s*[-–—]\s*(.+)$/)
    const raw = (numbered?.[1] ?? bullet?.[1] ?? dash?.[1] ?? line).trim()
    // Skip JSON, URLs, code, too short, or pure punctuation
    if (raw.length < 8) continue
    if (raw.startsWith('{') || raw.startsWith('[') || raw.startsWith('`')) continue
    if (/^https?:\/\//i.test(raw)) continue
    if (/^[\s\-\*\.\d\u0660-\u0669]+$/.test(raw)) continue
    out.push({ headline: raw.slice(0, 300), summary: null, sourceUrl: null })
  }
  // If we got nothing from list patterns, use any non-tiny line as a headline (prose response)
  if (out.length === 0) {
    for (const line of lines) {
      const t = line.trim()
      if (t.length >= 15 && t.length <= 400 && !t.startsWith('{') && !t.startsWith('[') && !/^https?:\/\//i.test(t)) {
        out.push({ headline: t.slice(0, 300), summary: null, sourceUrl: null })
      }
    }
  }
  return out.slice(0, 15)
}

module.exports = { queryPerplexity, fetchStorySuggestions, parseStoriesFromResponse }
