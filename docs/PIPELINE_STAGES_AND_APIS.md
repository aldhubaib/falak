# Pipeline stages and API usage

This document describes the six pipeline stages and **which API is used at each stage**.

---

## 1. Import

- **Purpose:** Bring YouTube videos into the app and create pipeline items.
- **API used:** **YouTube Data API** (metadata).
- **What’s called:**
  - `channels` (contentDetails) → get uploads playlist ID
  - `playlistItems` → get video IDs
  - `videos` (snippet, statistics, contentDetails) → get title, description, views, likes, duration, etc.
- **In code:** Done in `src/services/youtube.js` (`fetchRecentVideos`) and triggered when:
  - Adding a channel (POST `/api/channels`) → auto-import
  - Manual “Import / Sync videos” (POST `/api/channels/:id/fetch-videos`)
- **Result:** `Video` rows and `PipelineItem` rows with `stage: 'import'` are created.

---

## 2. Transcribe

- **Purpose:** Get the full transcript (captions) for each video.
- **API / service:** **youtube-transcript.io** (or similar transcript API).
- **What’s called:** A transcript API that accepts a YouTube video ID or URL and returns timed text.
- **In code:** Not implemented in the backend. No worker currently:
  - Picks items in `transcribe` (or moves them from `import` → `transcribe`)
  - Calls a transcript API
  - Saves `Video.transcription` and advances the item to the next stage.
- **To implement:** Add a transcript client (e.g. for youtube-transcript.io or YouTube’s captions API) and a job that processes items in the transcribe stage.

---

## 3. Comments

- **Purpose:** Fetch top comments for the video (e.g. top 100 by relevance).
- **API used:** **YouTube Data API** — `commentThreads`.
- **What’s called:** `commentThreads` with `videoId`, `maxResults=100`, `order=relevance`.
- **In code:** Implemented in `src/services/youtube.js` as `fetchComments(youtubeVideoId, maxResults, projectId)`. No pipeline worker yet that:
  - Picks items in `comments` stage
  - Calls `fetchComments` for the video’s `youtubeId`
  - Saves `Comment` rows and advances the item.
- **To implement:** A job that loads items in `comments`, calls `fetchComments`, persists comments, then moves the item to the next stage.

---

## 4. AI Analysis

- **Purpose:** Run AI over transcript + comments (e.g. summarization, topics, sentiment).
- **API / service:** **Haiku · Sonnet** (Anthropic Claude models, or similar).
- **What’s called:** An AI API (e.g. Anthropic) with the video’s transcript and comments as input.
- **In code:** Not implemented. No worker that:
  - Picks items in `analyzing` stage
  - Sends transcript + comments to an AI API
  - Stores results and sets the item to `done` (or `failed`).
- **To implement:** An AI client (e.g. Anthropic) and a job that processes items in `analyzing`.

---

## 5. Done

- **Purpose:** Final state; no further processing.
- **API:** None.
- **In code:** Pipeline items with `stage: 'done'` are only read and displayed.

---

## 6. Failed

- **Purpose:** Hold items that errored in any previous stage.
- **API:** None for this stage itself. “Retry all” re-queues failed items (e.g. back to `import`) so the same APIs are called again when they are reprocessed.
- **In code:** Retry is implemented in `src/routes/pipeline.js` (POST `/api/pipeline/retry-all-failed` and POST `/api/pipeline/:id/retry`).

---

## Summary table

| Stage      | API / service              | Backend implementation |
|-----------|----------------------------|-------------------------|
| **Import**    | YouTube Data API (metadata) | ✅ `fetchRecentVideos` + channel add / fetch-videos |
| **Transcribe**| youtube-transcript.io      | ❌ Not implemented      |
| **Comments**  | YouTube Data API (commentThreads) | ✅ `fetchComments` exists; no worker |
| **AI Analysis**| Haiku · Sonnet (e.g. Anthropic) | ❌ Not implemented  |
| **Done**      | —                          | N/A                    |
| **Failed**    | — (retry reuses above APIs) | ✅ Retry endpoints      |

---

## Data model (reference)

- **PipelineItem:** `stage` ∈ `import | transcribe | comments | analyzing | done | failed`, `status`, `videoId`, `error`, etc.
- **Video:** has `transcription` (for transcript) and relation to `Comment`.
- **Comment:** stores comment text, author, etc.

To have the pipeline “run” automatically beyond Import, you need a **worker** (cron or queue) that:

1. Selects items with `stage = 'transcribe'` and `status = 'queued'`, calls the transcript API, saves `Video.transcription`, sets `stage = 'comments'`.
2. Selects items with `stage = 'comments'` and `status = 'queued'`, calls `fetchComments`, saves `Comment` rows, sets `stage = 'analyzing'`.
3. Selects items with `stage = 'analyzing'` and `status = 'queued'`, calls the AI API, saves results, sets `stage = 'done'` (or `failed` on error).
