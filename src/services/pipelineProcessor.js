/**
 * Pipeline stage processors. Used by the worker and by POST /api/pipeline/process.
 * Each function receives { item, video, project } and either advances the item or throws.
 */
const fetch = require('node-fetch')
const db = require('../lib/db')
const { decrypt } = require('./crypto')
const { fetchVideoMetadata, fetchComments } = require('./youtube')
const { fetchTranscript } = require('./transcript')
const { trackUsage } = require('./usageTracker')
const MAX_ANTHROPIC_TOKENS = 4096
const ANTHROPIC_TIMEOUT_MS = 120_000
const ANTHROPIC_RETRY_DELAYS_MS = [10_000, 30_000, 60_000] // on 429: wait 10s, 30s, 60s
// Small gap between sequential AI calls within one video to avoid burst
const ANTHROPIC_INTER_CALL_DELAY_MS = 2_000

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

// ── Import: fetch video metadata from YouTube Data API, save to Video ──
async function doStageImport(item, video, project) {
  const meta = await fetchVideoMetadata(video.youtubeId, project.id)
  await db.video.update({
    where: { id: video.id },
    data: {
      titleAr: meta.titleAr,
      titleEn: meta.titleEn,
      description: meta.description,
      publishedAt: meta.publishedAt,
      viewCount: meta.viewCount,
      likeCount: meta.likeCount,
      commentCount: meta.commentCount,
      duration: meta.duration,
      thumbnailUrl: meta.thumbnailUrl,
    },
  })
  return { nextStage: 'transcribe' }
}

// ── Transcribe: fetch transcript segments, save to Video.transcription as JSON ──
async function doStageTranscribe(item, video, project) {
  const result = await fetchTranscript(video.youtubeId, project)
  // Store segments as JSON string so the frontend can render timestamps.
  // Fall back to storing plain text for the rare case where no segment data is available.
  let transcription = null
  if (Array.isArray(result) && result.length > 0) {
    transcription = JSON.stringify(result)
  } else if (typeof result === 'string' && result) {
    transcription = result
  }
  await db.video.update({
    where: { id: video.id },
    data: { transcription },
  })
  return { nextStage: 'comments' }
}

// Convert stored transcription (JSON segments or plain string) to plain text for AI prompts.
function segmentsToText(transcription) {
  if (!transcription) return ''
  try {
    const parsed = JSON.parse(transcription)
    if (Array.isArray(parsed)) {
      return parsed.map(s => s.text || '').join('\n').trim()
    }
  } catch (_) {}
  return String(transcription)
}

// ── Comments: fetch top 100 comments, upsert Comment records ──
async function doStageComments(item, video, project) {
  const comments = await fetchComments(video.youtubeId, 100, project.id)
  for (const c of comments) {
    await db.comment.upsert({
      where: { youtubeId: c.youtubeId },
      create: {
        videoId: video.id,
        youtubeId: c.youtubeId,
        text: c.text,
        authorName: c.authorName,
        likeCount: c.likeCount,
        publishedAt: c.publishedAt,
      },
      update: {
        text: c.text,
        authorName: c.authorName,
        likeCount: c.likeCount,
        publishedAt: c.publishedAt,
      },
    })
  }
  return { nextStage: 'analyzing' }
}

// ── Analyzing: Part A (Haiku) classify + Part B (Sonnet) insights, save to Video.analysisResult ──
// Part C (Haiku): batch sentiment classification for every comment ──────────────────────────────
async function doStageAnalyzing(item, video, project) {
  if (!project?.anthropicApiKeyEncrypted) {
    throw new Error('Anthropic API key not configured for this project. Go to Settings and add it.')
  }
  const apiKey = decrypt(project.anthropicApiKeyEncrypted)

  // segmentsToText handles both JSON-segments and legacy plain-string transcriptions.
  const transcript = segmentsToText(video.transcription).slice(0, 50000)
  // Include id so we can update comments after sentiment classification.
  const comments = await db.comment.findMany({
    where: { videoId: video.id },
    select: { id: true, text: true, likeCount: true },
    take: 100,
  })
  const commentsSample = comments.map(c => c.text).join('\n').slice(0, 8000)

  // Part A — Haiku: classify (topic, sentiment, content type, story/investigation/challenge/travel etc.)
  const partA = await callAnthropic(apiKey, 'claude-haiku-4-5-20251001', [
    {
      role: 'user',
      content: `Classify this Arabic video based on its transcript. Reply in JSON only, no markdown.
Keys:
- topic: one short sentence in Arabic only describing what this video is about
- sentiment: how the AUDIENCE is likely to react to this video — "positive" if the content drives excitement, engagement, shares, and subscriptions; "negative" if it is likely to cause complaints, dislikes, or churn; "neutral" if it is informational with no strong emotional pull. Base this on the storytelling style, the hook, the pacing, and the content type — NOT on whether the subject matter is dark or light. A true crime video with strong storytelling that drives engagement should be "positive".
- contentType: one of story|investigation|challenge|travel|vlog|tutorial|entertainment|other
- location: the country or city where the main story takes place, in Arabic. If the story spans multiple locations, pick the primary one. If no specific location, return null.
- tags: generate 4 to 8 tags in Arabic only that describe this video. Rules: Arabic only (no English), each tag is 1 to 3 words maximum, descriptive of genre/theme/subject/format, noun form (no verbs, no sentences), short and reusable. Examples: جريمة حقيقية، غموض، تحقيق، شخصية مشهورة، تاريخ، اختفاء، أدلة جنائية
Transcript:\n${transcript.slice(0, 15000)}`,
    },
  ], { projectId: project.id, action: 'analysis-classify' })

  await sleep(ANTHROPIC_INTER_CALL_DELAY_MS)

  // Part B — Sonnet: key insights, audience reaction, engagement pattern
  const partB = await callAnthropic(apiKey, 'claude-sonnet-4-6', [
    {
      role: 'user',
      content: `Based on this video transcript and a sample of comments, extract key insights. Reply in JSON only.
Keys: summary (2-3 sentences, what the video is about), audienceReaction (what commenters say/feel), engagementPattern (how viewers engage). Use Arabic or English as appropriate.
Transcript (excerpt):\n${transcript.slice(0, 20000)}
Comments (sample):\n${commentsSample}`,
    },
  ], { projectId: project.id, action: 'analysis-insights' })

  await sleep(ANTHROPIC_INTER_CALL_DELAY_MS)

  let partAJson = {}
  let partBJson = {}
  try {
    partAJson = parseJsonFromResponse(partA)
  } catch (_) {
    partAJson = { raw: partA }
  }
  try {
    partBJson = parseJsonFromResponse(partB)
  } catch (_) {
    partBJson = { raw: partB }
  }

  // Part C — Haiku: batch-classify every comment's sentiment.
  // Must run BEFORE scoring so Signal 1 can use classified sentiments.
  // Failure is non-fatal — leaves sentiments null, Signal 1 scores 0.5 (neutral).
  if (comments.length > 0) {
    try {
      await classifyCommentSentiments(apiKey, comments, project.id)
    } catch (e) {
      console.error(`[pipeline] sentiment classification failed for video ${video.id}:`, e.message)
    }
  }

  // Re-fetch comments with their now-classified sentiments for Signal 1.
  const classifiedComments = await db.comment.findMany({
    where: { videoId: video.id },
    select: { sentiment: true },
  })

  // 4-signal weighted sentiment scoring — overrides the AI's raw sentiment guess.
  partAJson.sentiment = await scoreVideoSentiment(apiKey, video, classifiedComments, partAJson.contentType, project.id)

  const analysisResult = {
    partA: partAJson,
    partB: partBJson,
    analyzedAt: new Date().toISOString(),
  }

  await db.video.update({
    where: { id: video.id },
    data: { analysisResult },
  })

  // Generate vector embedding for similarity search (non-blocking, fail-open)
  if (project.embeddingApiKeyEncrypted) {
    try {
      const { generateEmbedding, buildEmbeddingText, storeVideoEmbedding } = require('./embeddings')
      const text = buildEmbeddingText({
        topic: partAJson.topic,
        tags: partAJson.tags,
        summary: partBJson.summary,
        contentType: partAJson.contentType,
        region: partAJson.location,
      })
      if (text.length > 10) {
        const emb = await generateEmbedding(text, project)
        await storeVideoEmbedding(video.id, emb)
      }
    } catch (e) {
      console.warn('[pipeline] embedding failed (non-fatal):', e.message)
    }
  }

  return { nextStage: 'done', result: analysisResult }
}

// ── 4-signal weighted sentiment scoring ──────────────────────────────────────
// Signal 1 (0.4): comment positivity ratio
// Signal 2 (0.3): like-to-view ratio
// Signal 3 (0.2): content format engagement potential
// Signal 4 (0.1): hook strength (separate Haiku call)
async function scoreVideoSentiment(apiKey, video, classifiedComments, contentType, projectId) {
  try {
    // Signal 1 — Comments (weight 0.4)
    let s1 = 0.5   // neutral default when no comments
    if (classifiedComments.length > 0) {
      const positiveCount = classifiedComments.filter(
        c => c.sentiment === 'positive' || c.sentiment === 'question'
      ).length
      const ratio = positiveCount / classifiedComments.length
      s1 = ratio > 0.6 ? 1.0 : ratio >= 0.4 ? 0.6 : 0.2
    }

    // Signal 2 — Like ratio (weight 0.3)
    let s2 = 0.5   // neutral default when no view data
    const views = Number(video.viewCount) || 0
    const likes = Number(video.likeCount) || 0
    if (views > 0) {
      const ratio = (likes / views) * 100
      s2 = ratio > 3 ? 1.0 : ratio >= 1.5 ? 0.6 : 0.2
    }

    // Signal 3 — Content format (weight 0.2)
    const HIGH_ENGAGEMENT_FORMATS = new Set(['story', 'investigation', 'mystery', 'crime', 'history', 'thriller'])
    const s3 = HIGH_ENGAGEMENT_FORMATS.has((contentType || '').toLowerCase()) ? 0.8 : 0.5

    // Signal 4 — Hook strength (weight 0.1)
    let s4 = 0.5   // neutral default when no transcript or API error
    const transcriptText = segmentsToText(video.transcription)
    if (transcriptText) {
      try {
        await sleep(ANTHROPIC_INTER_CALL_DELAY_MS)
        const hookRaw = await callAnthropic(
          apiKey,
          'claude-haiku-4-5-20251001',
          [{
            role: 'user',
            content: `Does this video opening hook the audience with a question, mystery, shocking fact, or surprising statement that makes them want to keep watching?\nOpening: ${transcriptText.slice(0, 500)}`,
          }],
          {
            system: 'You are a content analyst. Reply with only one word: strong or weak.',
            maxTokens: 10,
            projectId,
            action: 'hook-scoring',
          }
        )
        const hookVerdict = hookRaw.toLowerCase().trim()
        s4 = hookVerdict === 'strong' ? 1.0 : hookVerdict === 'weak' ? 0.3 : 0.5
      } catch (_) {
        s4 = 0.5
      }
    }

    const final = (s1 * 0.4) + (s2 * 0.3) + (s3 * 0.2) + (s4 * 0.1)
    const verdict = final > 0.6 ? 'positive' : final >= 0.4 ? 'neutral' : 'negative'

    console.log('[sentiment]', { s1, s2, s3, s4, final: parseFloat(final.toFixed(3)), verdict })
    return verdict
  } catch (e) {
    console.error('[sentiment] scoring failed, falling back to neutral:', e.message)
    return 'neutral'
  }
}

// Send all comments in one prompt and update each record with the returned sentiment.
const VALID_SENTIMENTS = new Set(['positive', 'negative', 'question', 'neutral'])

async function classifyCommentSentiments(apiKey, comments, projectId) {
  const payload = comments.map(c => ({ id: c.id, text: (c.text || '').slice(0, 300) }))
  const raw = await callAnthropic(apiKey, 'claude-haiku-4-5-20251001', [
    {
      role: 'user',
      content: `Classify each comment as exactly one of: positive, negative, question, neutral.
Return ONLY a JSON array with no markdown, no explanation. Each element must have "id" and "sentiment".
Example: [{"id":"abc","sentiment":"positive"}]
Comments:
${JSON.stringify(payload)}`,
    },
  ], { projectId, action: 'comment-sentiment' })

  const results = parseJsonArrayFromResponse(raw)
  if (!Array.isArray(results)) throw new Error('Sentiment response was not an array')

  // Update each comment that has a valid sentiment in the response.
  await Promise.all(
    results
      .filter(r => r && r.id && VALID_SENTIMENTS.has(r.sentiment))
      .map(r => db.comment.update({ where: { id: r.id }, data: { sentiment: r.sentiment } }))
  )
}

function parseJsonFromResponse(text) {
  const trimmed = (text || '').trim()
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}') + 1
  if (start === -1 || end <= start) throw new Error('No JSON in response')
  return JSON.parse(trimmed.slice(start, end))
}

function parseJsonArrayFromResponse(text) {
  const trimmed = (text || '').trim()
  const start = trimmed.indexOf('[')
  const end = trimmed.lastIndexOf(']') + 1
  if (start === -1 || end <= start) throw new Error('No JSON array in response')
  return JSON.parse(trimmed.slice(start, end))
}

async function callAnthropic(apiKey, model, messages, { system, maxTokens, projectId, action } = {}) {
  const body = {
    model,
    max_tokens: maxTokens || MAX_ANTHROPIC_TOKENS,
    messages: messages.map(({ role, content }) => ({ role, content })),
  }
  if (system) body.system = system

  for (let attempt = 0; attempt <= ANTHROPIC_RETRY_DELAYS_MS.length; attempt++) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), ANTHROPIC_TIMEOUT_MS)
    let res
    try {
      res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
    } catch (e) {
      clearTimeout(timeout)
      if (e.name === 'AbortError') {
        trackUsage({ projectId, service: 'anthropic', action, status: 'fail', error: 'timeout' })
        throw new Error(`Anthropic API: request timed out after ${ANTHROPIC_TIMEOUT_MS / 1000}s`)
      }
      throw e
    }
    clearTimeout(timeout)

    if (res.status === 429) {
      trackUsage({ projectId, service: 'anthropic', action, status: 'fail', error: '429' })
      if (attempt < ANTHROPIC_RETRY_DELAYS_MS.length) {
        // Honour the Retry-After header if present, else use our schedule
        const retryAfter = res.headers.get('retry-after')
        const waitMs = retryAfter
          ? Math.min(parseInt(retryAfter, 10) * 1000, 120_000)
          : ANTHROPIC_RETRY_DELAYS_MS[attempt]
        console.warn(`[anthropic] 429 rate limit on "${action}" (attempt ${attempt + 1}), retrying in ${waitMs / 1000}s`)
        await sleep(waitMs)
        continue
      }
      throw new Error(`Anthropic API: 429 rate limit exceeded after ${attempt} retries`)
    }

    if (!res.ok) {
      const t = await res.text()
      trackUsage({ projectId, service: 'anthropic', action, status: 'fail', error: `${res.status}` })
      throw new Error(`Anthropic API: ${res.status} ${t}`)
    }

    const data = await res.json()
    const usage = data.usage || {}
    const tokensUsed = (usage.input_tokens || 0) + (usage.output_tokens || 0)
    trackUsage({ projectId, service: 'anthropic', action, tokensUsed, status: 'ok' })
    const block = data.content && data.content[0]
    const text = block && block.text ? block.text.trim() : ''
    // Store last usage for callers that need it
    callAnthropic._lastUsage = { inputTokens: usage.input_tokens || 0, outputTokens: usage.output_tokens || 0, totalTokens: tokensUsed }
    return text
  }
}

/**
 * Stream Anthropic Messages API; yields text chunks from content_block_delta text_delta events.
 * @param {string} apiKey
 * @param {string} model
 * @param {Array<{role: string, content: string}>} messages
 * @param {{ system?: string, maxTokens?: number, projectId?: string, action?: string }} opts
 * @yields {string} text delta
 */
async function * callAnthropicStream(apiKey, model, messages, { system, maxTokens, projectId, action } = {}) {
  const body = {
    model,
    max_tokens: maxTokens || MAX_ANTHROPIC_TOKENS,
    messages: messages.map(({ role, content }) => ({ role, content })),
    stream: true,
  }
  if (system) body.system = system

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const t = await res.text()
    trackUsage({ projectId, service: 'anthropic', action, status: 'fail', error: `${res.status}` })
    throw new Error(`Anthropic API: ${res.status} ${t}`)
  }

  // node-fetch v2 gives a Node stream (no .getReader()); use async iteration
  let buffer = ''
  for await (const chunk of res.body) {
    buffer += (chunk instanceof Buffer ? chunk.toString('utf-8') : String(chunk))
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const raw = line.slice(6).trim()
      if (!raw) continue
      try {
        const obj = JSON.parse(raw)
        if (obj.type === 'content_block_delta' && obj.delta?.type === 'text_delta' && obj.delta.text) {
          yield obj.delta.text
        }
      } catch (_) {}
    }
  }
  if (buffer.trim().startsWith('data: ')) {
    try {
      const obj = JSON.parse(buffer.slice(6).trim())
      if (obj.type === 'content_block_delta' && obj.delta?.type === 'text_delta' && obj.delta.text) {
        yield obj.delta.text
      }
    } catch (_) {}
  }
  trackUsage({ projectId, service: 'anthropic', action, tokensUsed: null, status: 'ok' })
}

module.exports = {
  doStageImport,
  doStageTranscribe,
  doStageComments,
  doStageAnalyzing,
  callAnthropic,
  callAnthropicStream,
}
