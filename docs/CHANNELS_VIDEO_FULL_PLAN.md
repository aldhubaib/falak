# Channels, Channel Detail, and Video Detail — Full Plan

One consolidated plan for **Channels page**, **Channel detail page**, and **Video detail page**: legacy parity, all field definitions, implementation steps, and design. Legacy behavior reference: [FALAK_LEGACY_APP_PLAN.md](FALAK_LEGACY_APP_PLAN.md) (sections 6, 7, 8).

---

## 1. Design (Cursor-style UI)

Apply consistently across all three pages.

**Goal:** Clean, minimal, dark, dense, professional — no decorative elements.

**Colors (CSS variables in `:root` only):**
- Background: `#0f0f0f` (deepest bg)
- Surface: `#161616` (cards, panels)
- Elevated: `#1c1c1c` (inputs, hover)
- Border: `#2a2a2a` (dividers)
- Text primary: `#e8e8e8`; secondary: `#888`; muted: `#484848`
- Accent: `#5b8af0`; Danger: `#eb5757`; Success: `#4dab9a`

**Typography:** Inter only; base 13px; labels/meta 11px; mono IBM Plex Mono; weights 400, 500, 600 only. Uppercase only for section dividers, letter-spacing 0.06em.

**Spacing:** Base 4px; padding 8–40; gap 4–20; no odd values (7, 9, 14, 18).

**Components:** Buttons 28px height, 0 12px padding, 4px radius, 12px font. Inputs 28px height, 4px radius, `var(--elevated)`. Cards 6px radius, 1px border, no shadow. Badges 3px radius, 10px mono. Sidebar 200px, item 28px. Topbar 40px. No shadows, gradients, or blur; transitions 150ms opacity/transform only.

**Layout:** Full width; sidebar visible on desktop; page padding 32px horizontal, 24px top.

---

## 2. Part 1: Channels page

**Purpose:** List channels in the active project; add channel; open channel detail; sync or delete per channel.

### API and response

- **API:** `GET /api/channels?projectId=...&cursor=...`
- **Response:** `{ channels: Channel[], nextCursor: string | null, hasMore: boolean }`
- **Pagination:** Use `nextCursor` as `cursor` for next page; when `hasMore` is false, no more pages.

### Fields (each item in `channels`)

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Internal DB id; use for links and API calls. |
| `youtubeId` | string | YouTube channel id (e.g. UC…). |
| `handle` | string | @handle (e.g. @channelname). |
| `nameAr` | string | Channel name (Arabic). |
| `nameEn` | string \| null | Channel name (English). |
| `type` | string | `"ours"` or `"competitor"`. Ours = owned, goes to pipeline; competitor = monitoring only. |
| `avatarUrl` | string \| null | Channel avatar image URL. |
| `status` | string | Channel status (e.g. `"active"`). |
| `subscribers` | string (BigInt serialized) | Subscriber count; display with `Number(ch.subscribers).toLocaleString()`. |
| `totalViews` | string (BigInt serialized) | Lifetime view count. |
| `videoCount` | number | Number of videos. |
| `uploadCadence` | number \| null | Upload frequency; used in Monitor. |
| `lastFetchedAt` | string (ISO date) \| null | Last sync from YouTube; show as "Synced …" or "Last sync". |
| `projectId` | string | Project this channel belongs to. |
| `createdAt` | string (ISO date) | When the channel was added. |

### UI and actions

- **Header:** Title + channel count badge (e.g. `{channels.length} channels`).
- **Add box:** Form; hint below: "Examples: youtube.com/@channelname, @handle, or UCxxx...". Optional Competitor/Ours toggle for new channel.
- **List:** **Cards** — avatar, name (RTL), handle, status, lastFetchedAt, star if ours, stats (Subs, Views, Videos), View Details link, **Sync** button, **Delete** button.
- **Delete modal:** Channel name, "Are you sure…?", Cancel | Remove channel. Confirm → `DELETE /api/channels/:id`, invalidate, close.
- **Sync:** Per-card → `POST /api/channels/:id/refresh`, invalidate `['channels']` and `['channel', id]`.
- **Optional:** Toggle Ours/Competitor on card via `PATCH /api/channels/:id` with `{ type }`.

**File:** [frontend/src/pages/ChannelsPage.jsx](frontend/src/pages/ChannelsPage.jsx).

---

## 3. Part 2: Channel detail page

**Purpose:** Single channel view: hero, stats with deltas, video table with filters and pagination, right panel (properties and actions).

### APIs and responses

- **Channel:** `GET /api/channels/:id` — single channel + stats + deltas.
- **Videos:** `GET /api/channels/:id/videos?limit=...&offset=...` — `{ videos: Video[], total: number, hasMore: boolean }`.

### Fields — Channel (GET /api/channels/:id)

All base Channel fields from Part 1, plus:

| Field | Type | Description |
|-------|------|-------------|
| `avgViews` | number | Average views per video (computed). |
| `engagement` | number | Average engagement % (likes + comments) / views * 100, rounded. |
| `deltas` | object | Change vs last snapshot; used for "+X" / "-X" next to stats. |

### Fields — deltas (nested)

| Field | Type | Description |
|-------|------|-------------|
| `deltas.subscribers` | number \| null | Change in subscribers since last snapshot. |
| `deltas.totalViews` | number \| null | Change in total views. |
| `deltas.videoCount` | number \| null | Change in video count. |
| `deltas.avgViews` | number \| null | Change in avg views per video. |
| `deltas.engagement` | number \| null | Change in engagement %. |

Display e.g. "6.6M Subscribers" and "+12.4K this week" when `deltas.subscribers` is set (green if positive, red if negative).

### Fields — Video (each item in `videos` from GET /api/channels/:id/videos)

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Internal video id; use for GET /api/videos/:id and pipeline retry. |
| `youtubeId` | string | YouTube video id; link to watch and route `/channels/:channelId/video/:videoId`. |
| `channelId` | string | Owning channel id. |
| `titleAr` | string \| null | Title (Arabic). |
| `titleEn` | string \| null | Title (English). |
| `publishedAt` | string (ISO date) \| null | Publish date; sortable. |
| `viewCount` | string (BigInt serialized) \| null | View count; sortable. |
| `likeCount` | string (BigInt serialized) \| null | Like count; sortable. |
| `commentCount` | string (BigInt serialized) \| null | Comment count. |
| `duration` | string \| null | YouTube (ISO 8601). Type Short/Video from YouTube API when available. |
| `thumbnailUrl` | string \| null | Thumbnail URL. |
| `pipelineItem` | object \| null | Pipeline state for this video. |

### Fields — pipelineItem (nested on each video)

| Field | Type | Description |
|-------|------|-------------|
| `pipelineItem.id` | string | Use for POST /api/pipeline/:id/retry. |
| `pipelineItem.stage` | string | `import`, `transcribe`, `comments`, `analyzing`, `done`, `failed`. Filter tabs and status. |
| `pipelineItem.status` | string | e.g. `queued`, `processing`, `completed`. |
| `pipelineItem.error` | string \| null | Error message when stage failed. |

**Type (Short vs Video):** Show from YouTube API when available; do not derive from duration only. Optional backend: add `videoType` or `isShort` when API provides it.

### UI and actions

- **Top bar:** "← Channels" link to `/channels`.
- **Hero:** Avatar, name (RTL), handle link (YouTube), badges (status, video count, last sync).
- **Stats row:** 5–6 boxes (Subscribers, Total Views, Total Videos, Avg Views, Engagement) with value + delta from `channel.deltas`.
- **Videos:** Filter tabs with counts; table with **Type** column (Short/Video from API when available); sortable Views/Likes/Date; page size 10/25/50; "Showing X–Y of Z"; « ‹ › ».
- **Right panel (collapsible):** Properties (handle, createdAt, videoCount, subscribers, totalViews, engagement, status, lastFetchedAt); **Ours / Competitor** (PATCH type); **Sync now** (Refresh); **Analyze all pending** (placeholder or new endpoint); **Remove channel** (modal + DELETE); **⊟ Properties** toggle.

**File:** [frontend/src/pages/ChannelDetailPage.jsx](frontend/src/pages/ChannelDetailPage.jsx).

---

## 4. Part 3: Video detail page

**Purpose:** Single video view: thumbnail, tabs (Transcript, Comments, AI Insights, Logs), right panel with properties and actions.

### API and response

- **API:** `GET /api/videos/:id` (id = internal video id).
- **Returns:** Full video plus nested `channel`, `pipelineItem`, and `comments`.

### Fields — Video (root)

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Internal video id. |
| `youtubeId` | string | Use for "Watch on YouTube": `https://youtube.com/watch?v=${youtubeId}`. |
| `channelId` | string | Use for "← Channel" link to `/channels/${channelId}`. |
| `titleAr` | string \| null | Title (Arabic). |
| `titleEn` | string \| null | Title (English). |
| `description` | string \| null | Video description. |
| `publishedAt` | string (ISO date) \| null | Publish date. |
| `viewCount` | string (BigInt) \| null | View count. |
| `likeCount` | string (BigInt) \| null | Like count. |
| `commentCount` | string (BigInt) \| null | Comment count. |
| `duration` | string \| null | YouTube duration (ISO 8601). |
| `thumbnailUrl` | string \| null | Thumbnail URL. |
| `transcription` | string \| null | Full transcript; Transcript tab and Copy button. |
| `analysisResult` | object \| null | Optional analysis; show in AI Insights. |
| `omitFromAnalytics` | boolean | Excluded from Analytics; toggle via POST omit-from-analytics. |
| `channel` | object | Nested channel (below). |
| `pipelineItem` | object \| null | Nested pipeline item (below). |
| `comments` | array | Nested comments (below). |

### Fields — channel (nested)

| Field | Type | Description |
|-------|------|-------------|
| `channel.id` | string | For link back to channel. |
| `channel.handle` | string | @handle. |
| `channel.nameAr` | string | Channel name (Arabic). |
| `channel.nameEn` | string \| null | Channel name (English). |
| `channel.avatarUrl` | string \| null | Channel avatar. |

### Fields — pipelineItem (nested)

| Field | Type | Description |
|-------|------|-------------|
| `pipelineItem.id` | string | Use for "Retry Analysis": POST /api/pipeline/:id/retry. |
| `pipelineItem.stage` | string | Current pipeline stage. |
| `pipelineItem.status` | string | queued / processing / completed etc. |
| `pipelineItem.error` | string \| null | Last error if failed. |
| `pipelineItem.retries` | number | Retry count. |
| `pipelineItem.lastStage` | string \| null | Stage to resume from on retry. |
| `pipelineItem.startedAt` | string \| null | When current stage started. |
| `pipelineItem.finishedAt` | string \| null | When current stage finished. |
| `pipelineItem.result` | object \| null | AI analysis result; show in AI Insights tab. |

### Fields — comments (nested array)

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Comment id. |
| `text` | string | Comment body (may contain HTML). |
| `authorName` | string \| null | Author display name. |
| `likeCount` | number | Comment like count. |
| `publishedAt` | string (ISO date) \| null | When published. |
| `sentiment` | string \| null | positive, negative, question, neutral; use for Comments tab filter. |

### Other endpoints (Video detail)

- **GET /api/videos/:id/logs** — pipeline stage logs (fetch when Logs tab is active).
- **POST /api/videos/:id/refetch-comments** — re-fetch comments (strict rate limit).
- **POST /api/videos/:id/refetch-transcript** — re-fetch transcript (strict rate limit).
- **POST /api/videos/:id/omit-from-analytics** — body `{ omit: true|false }`.
- **POST /api/pipeline/:id/retry** — retry pipeline item (use `video.pipelineItem.id` for "Retry Analysis").

### UI and actions

| Element | Implementation |
|--------|----------------|
| Top bar | "← Channel" link to `/channels/${channelId}`; "⊟ Properties" panel toggle. |
| Thumbnail + link | Thumbnail image; link to `https://youtube.com/watch?v=${video.youtubeId}`. |
| Tabs | Transcript \| Comments \| AI Insights \| Logs; state `activeTab`; one panel per tab. |
| Transcript tab | Render `video.transcription` (timestamped or raw); **⎘ Copy** → clipboard; show "✓ Copied" briefly. |
| Comments tab | List `video.comments`; filter by `comment.sentiment` (all / positive / negative / question); optional Pin (★) local state. |
| AI Insights tab | Show `video.pipelineItem?.result` or `video.analysisResult`. |
| Logs tab | Fetch GET /api/videos/:id/logs when active; render stages with timestamp, status, meta. |
| Right panel | Properties (title, views, likes, comments, date, stage, status); **⚡ Retry Analysis** (POST pipeline retry), **↺ Re-fetch comments**, **⊘ Omit from Analytics**; **⊟ Properties** toggle. |

**Buttons:** ← Channel → Link; ⊟ Properties → `panelOpen` state; Copy → `navigator.clipboard.writeText(video.transcription)`; Retry Analysis → POST /api/pipeline/:id/retry with `pipelineItem.id`; Re-fetch comments → POST refetch-comments; Omit from Analytics → POST omit-from-analytics with `{ omit: !video.omitFromAnalytics }`.

**Transcript:** If stored as `[00:00] text` lines, split by newlines; Copy copies full string.

**Comments sentiment:** Filter by `comment.sentiment`; match positive, negative, question; "all" shows all.

**File:** [frontend/src/pages/VideoDetailPage.jsx](frontend/src/pages/VideoDetailPage.jsx). Optional: shared Modal and Tabs components.

---

## 5. Implementation order

1. **Channels page** — header badge, cards, Sync, Delete, delete modal, hint.
2. **Channel detail page** — back link, hero, stats row, right panel, table (Type, sort, page size, pagination), panel toggle, actions.
3. **Video detail page** — back link, thumbnail + YouTube link, tabs (Transcript with Copy, Comments with sentiment filter, AI Insights, Logs from API), right panel (properties, Retry Analysis, Re-fetch comments, Omit from Analytics), panel toggle.

---

## 6. Backend summary

- **Channels:** GET list, GET :id, GET :id/videos, POST, POST :id/refresh, POST :id/fetch-videos, PATCH :id, DELETE :id — all exist.
- **Videos:** GET :id (with channel, pipelineItem, comments, transcription), GET :id/logs, POST :id/refetch-comments, POST :id/refetch-transcript, POST :id/omit-from-analytics — all exist.
- **Pipeline:** POST :id/retry exists; use `video.pipelineItem.id` for "Retry Analysis".

**Optional:** If YouTube API provides Short/Video type (or short flag), add field to Video model (e.g. `videoType` or `isShort`), populate when fetching, return in GET channel videos and GET video detail. Until then, frontend shows "—" or duration-based fallback for Type column.
