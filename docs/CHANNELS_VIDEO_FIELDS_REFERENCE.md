# Channels, Channel Detail, and Video Detail — Fields Reference

Exact field names and what each field does for the three pages. Source: API responses and [prisma/schema.prisma](prisma/schema.prisma).

---

## 1. Channels page

**API:** `GET /api/channels?projectId=...&cursor=...`

**Response shape:** `{ channels: Channel[], nextCursor: string | null, hasMore: boolean }`

### Channel (each item in `channels`)

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Internal DB id; use for links and API calls. |
| `youtubeId` | string | YouTube channel id (e.g. UC…). |
| `handle` | string | @handle (e.g. @channelname). |
| `nameAr` | string | Channel name (Arabic). |
| `nameEn` | string \| null | Channel name (English). |
| `type` | string | `"ours"` or `"competitor"`. Ours = owned channel, goes to pipeline; competitor = monitoring/analytics only. |
| `avatarUrl` | string \| null | Channel avatar image URL. |
| `status` | string | Channel status (e.g. `"active"`). |
| `subscribers` | string (BigInt serialized) | Subscriber count; display with `Number(ch.subscribers).toLocaleString()`. |
| `totalViews` | string (BigInt serialized) | Lifetime view count. |
| `videoCount` | number | Number of videos (from YouTube / DB). |
| `uploadCadence` | number \| null | Upload frequency (e.g. videos per week); used in Monitor. |
| `lastFetchedAt` | string (ISO date) \| null | Last time channel metadata was synced from YouTube; show as “Synced …” or “Last sync”. |
| `projectId` | string | Project this channel belongs to. |
| `createdAt` | string (ISO date) | When the channel was added. |

**Pagination:** Use `nextCursor` for the next page (pass as `cursor`); when `hasMore` is false, no more pages.

---

## 2. Channel detail page

**APIs:**
- `GET /api/channels/:id` — single channel + stats + deltas
- `GET /api/channels/:id/videos?limit=...&offset=...` — videos for the channel

### Channel (GET /api/channels/:id)

All base Channel fields above, plus:

| Field | Type | Description |
|-------|------|-------------|
| `avgViews` | number | Average views per video (computed from channel’s videos). |
| `engagement` | number | Average engagement % (likes + comments) / views * 100, rounded. |
| `deltas` | object | Change vs last snapshot (from ChannelSnapshot). Used for “+X” / “-X” next to stats. |

### `deltas` (nested)

| Field | Type | Description |
|-------|------|-------------|
| `deltas.subscribers` | number \| null | Change in subscribers since last snapshot; null if no previous snapshot. |
| `deltas.totalViews` | number \| null | Change in total views. |
| `deltas.videoCount` | number \| null | Change in video count. |
| `deltas.avgViews` | number \| null | Change in avg views per video. |
| `deltas.engagement` | number \| null | Change in engagement %. |

Display: e.g. “6.6M Subscribers” and “+12.4K this week” when `deltas.subscribers` is set (green if positive, red if negative).

### Channel videos (GET /api/channels/:id/videos)

**Response:** `{ videos: Video[], total: number, hasMore: boolean }`

### Video (each item in `videos`)

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Internal video id; use for GET /api/videos/:id and pipeline retry. |
| `youtubeId` | string | YouTube video id; use for link to watch and in route `/channels/:channelId/video/:videoId`. |
| `channelId` | string | Owning channel id. |
| `titleAr` | string \| null | Title (Arabic). |
| `titleEn` | string \| null | Title (English). |
| `publishedAt` | string (ISO date) \| null | Publish date; sortable. |
| `viewCount` | string (BigInt serialized) \| null | View count; sortable. |
| `likeCount` | string (BigInt serialized) \| null | Like count; sortable. |
| `commentCount` | string (BigInt serialized) \| null | Comment count. |
| `duration` | string \| null | From YouTube API (ISO 8601, e.g. PT1M30S). Used for display; Short vs Video type should come from YouTube API when available (see note below). |
| `thumbnailUrl` | string \| null | Thumbnail image URL. |
| `pipelineItem` | object \| null | Pipeline state for this video. |

### `pipelineItem` (nested on each video)

| Field | Type | Description |
|-------|------|-------------|
| `pipelineItem.id` | string | Pipeline item id; use for POST /api/pipeline/:id/retry. |
| `pipelineItem.stage` | string | One of: `import`, `transcribe`, `comments`, `analyzing`, `done`, `failed`. Used for filter tabs and status column. |
| `pipelineItem.status` | string | e.g. `queued`, `processing`, `completed`. |
| `pipelineItem.error` | string \| null | Error message when stage failed. |

**Type (Short vs Video):** The app should show Short vs Video from the **YouTube API** when that is available. Currently the DB only stores `duration` (from YouTube `contentDetails.duration`). If the YouTube API provides an explicit type or short flag, store it (e.g. new `videoType` or `isShort` field) and use it for the Type column; otherwise fallback to duration (e.g. &lt; 60s = Short) until the API field exists.

---

## 3. Video detail page

**API:** `GET /api/videos/:id` (id = internal video id, not youtubeId)

Returns the full video plus nested `channel`, `pipelineItem`, and `comments`.

### Video (root)

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Internal video id. |
| `youtubeId` | string | YouTube video id; use for “Watch on YouTube” link: `https://youtube.com/watch?v=${youtubeId}`. |
| `channelId` | string | Channel id; use for “← Channel” link to `/channels/${channelId}`. |
| `titleAr` | string \| null | Title (Arabic). |
| `titleEn` | string \| null | Title (English). |
| `description` | string \| null | Video description. |
| `publishedAt` | string (ISO date) \| null | Publish date. |
| `viewCount` | string (BigInt) \| null | View count. |
| `likeCount` | string (BigInt) \| null | Like count. |
| `commentCount` | string (BigInt) \| null | Comment count. |
| `duration` | string \| null | YouTube duration (ISO 8601). |
| `thumbnailUrl` | string \| null | Thumbnail URL. |
| `transcription` | string \| null | Full transcript text; show in Transcript tab; use for “Copy” button. |
| `analysisResult` | object \| null | Legacy/optional analysis blob; can be shown in AI Insights. |
| `omitFromAnalytics` | boolean | When true, video is excluded from Analytics; toggle via POST omit-from-analytics. |
| `channel` | object | Nested channel (see below). |
| `pipelineItem` | object \| null | Nested pipeline item (see below). |
| `comments` | array | Nested comments (see below). |

### `channel` (nested)

| Field | Type | Description |
|-------|------|-------------|
| `channel.id` | string | For link back to channel. |
| `channel.handle` | string | @handle. |
| `channel.nameAr` | string | Channel name (Arabic). |
| `channel.nameEn` | string \| null | Channel name (English). |
| `channel.avatarUrl` | string \| null | Channel avatar. |

### `pipelineItem` (nested)

| Field | Type | Description |
|-------|------|-------------|
| `pipelineItem.id` | string | Use for “Retry Analysis”: POST /api/pipeline/:id/retry. |
| `pipelineItem.stage` | string | Current pipeline stage. |
| `pipelineItem.status` | string | queued / processing / completed etc. |
| `pipelineItem.error` | string \| null | Last error if failed. |
| `pipelineItem.retries` | number | Retry count. |
| `pipelineItem.lastStage` | string \| null | Stage to resume from on retry. |
| `pipelineItem.startedAt` | string \| null | When current stage started. |
| `pipelineItem.finishedAt` | string \| null | When current stage finished. |
| `pipelineItem.result` | object \| null | AI analysis result; show in AI Insights tab. |

### `comments` (nested array)

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Comment id. |
| `text` | string | Comment body (may contain HTML). |
| `authorName` | string \| null | Comment author display name. |
| `likeCount` | number | Comment like count. |
| `publishedAt` | string (ISO date) \| null | When comment was published. |
| `sentiment` | string \| null | Sentiment from analysis (e.g. positive, negative, question, neutral); use for Comments tab filter. |

---

## 4. Summary by page

- **Channels page:** List uses `channels[]` from GET /api/channels; each has `id`, `handle`, `nameAr`, `nameEn`, `type`, `avatarUrl`, `status`, `subscribers`, `totalViews`, `videoCount`, `lastFetchedAt`. Pagination: `nextCursor`, `hasMore`.
- **Channel detail:** Single channel from GET /api/channels/:id (includes `avgViews`, `engagement`, `deltas`). Videos from GET /api/channels/:id/videos (`videos[]` with `pipelineItem`); each video has `id`, `youtubeId`, `titleAr`/`titleEn`, `viewCount`, `likeCount`, `publishedAt`, `duration`, `thumbnailUrl`, `pipelineItem.stage`/`status`/`id`. Type (Short/Video) from YouTube API when available; currently only `duration` in DB.
- **Video detail:** Full video from GET /api/videos/:id with nested `channel`, `pipelineItem`, `comments`. Use `transcription` for Transcript tab, `comments` and `sentiment` for Comments tab, `pipelineItem.result` or `analysisResult` for AI Insights, and `pipelineItem.id` for Retry Analysis.
