# Channels, Channel Detail, and Video Detail — Implementation Plan

Implementation plan for bringing the React **Channels**, **Channel detail**, and **Video detail** pages to parity with the legacy HTML app. The first two parts are the **Channels Page and Channel Detail Page — Legacy Parity Plan** (with fields inlined below).

**References:**
- Legacy UI and buttons: [FALAK_LEGACY_APP_PLAN.md](FALAK_LEGACY_APP_PLAN.md) (sections 6, 7, 8).
- **Field names and what each field does:** [CHANNELS_VIDEO_FIELDS_REFERENCE.md](CHANNELS_VIDEO_FIELDS_REFERENCE.md) — full reference for all three pages.

---

## Part 1: Channels page

**API:** `GET /api/channels?projectId=...&cursor=...`  
**Response shape:** `{ channels: Channel[], nextCursor: string | null, hasMore: boolean }`

### Fields (Channels page)

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
| `lastFetchedAt` | string (ISO date) \| null | Last time channel metadata was synced from YouTube; show as "Synced …" or "Last sync". |
| `projectId` | string | Project this channel belongs to. |
| `createdAt` | string (ISO date) | When the channel was added. |

**Pagination:** Use `nextCursor` for the next page (pass as `cursor`); when `hasMore` is false, no more pages.

- **Header:** Title + channel count badge (e.g. `{channels.length} channels`).
- **Add box:** Keep form; add hint text below ("Examples: youtube.com/@channelname, @handle, or UCxxx...").
- **List:** Refactor to **cards**: avatar, name (RTL), handle, status, lastFetchedAt, star if ours, stats (Subs, Views, Videos), View Details link, **Sync** button, **Delete** button.
- **Delete modal:** Channel name, "Are you sure…?", Cancel | Remove channel. Confirm → `DELETE /api/channels/:id`, invalidate, close.
- **Sync:** Per-card button → `POST /api/channels/:id/refresh`, invalidate `['channels']` and `['channel', id]`.
- **Optional:** Toggle Ours/Competitor on card via `PATCH /api/channels/:id` with `{ type }`.

**Files:** [frontend/src/pages/ChannelsPage.jsx](frontend/src/pages/ChannelsPage.jsx).

---

## Part 2: Channel detail page

**APIs:** `GET /api/channels/:id` (channel + stats + deltas); `GET /api/channels/:id/videos?limit=...&offset=...` (videos for the channel).

### Fields — Channel (GET /api/channels/:id)

All base Channel fields from Part 1, plus:

| Field | Type | Description |
|-------|------|-------------|
| `avgViews` | number | Average views per video (computed from channel's videos). |
| `engagement` | number | Average engagement % (likes + comments) / views * 100, rounded. |
| `deltas` | object | Change vs last snapshot (from ChannelSnapshot). Used for "+X" / "-X" next to stats. |

### Fields — deltas (nested)

| Field | Type | Description |
|-------|------|-------------|
| `deltas.subscribers` | number \| null | Change in subscribers since last snapshot; null if no previous snapshot. |
| `deltas.totalViews` | number \| null | Change in total views. |
| `deltas.videoCount` | number \| null | Change in video count. |
| `deltas.avgViews` | number \| null | Change in avg views per video. |
| `deltas.engagement` | number \| null | Change in engagement %. |

Display: e.g. "6.6M Subscribers" and "+12.4K this week" when `deltas.subscribers` is set (green if positive, red if negative).

### Fields — Channel videos (GET /api/channels/:id/videos)

**Response:** `{ videos: Video[], total: number, hasMore: boolean }`

**Video (each item in `videos`):**

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
| `duration` | string \| null | From YouTube API (ISO 8601, e.g. PT1M30S). Short vs Video type should come from YouTube API when available. |
| `thumbnailUrl` | string \| null | Thumbnail image URL. |
| `pipelineItem` | object \| null | Pipeline state for this video. |

**pipelineItem (nested on each video):**

| Field | Type | Description |
|-------|------|-------------|
| `pipelineItem.id` | string | Pipeline item id; use for POST /api/pipeline/:id/retry. |
| `pipelineItem.stage` | string | One of: `import`, `transcribe`, `comments`, `analyzing`, `done`, `failed`. Used for filter tabs and status column. |
| `pipelineItem.status` | string | e.g. `queued`, `processing`, `completed`. |
| `pipelineItem.error` | string \| null | Error message when stage failed. |

**Type (Short vs Video):** Show from YouTube API when available; do not derive from duration only. See optional backend change in Backend summary.

- **Top bar:** "← Channels" link to `/channels`.
- **Hero:** Avatar, name (RTL), handle link (YouTube), badges (status, video count, last sync).
- **Stats row:** 5–6 boxes (Subscribers, Total Views, Total Videos, Avg Views, Engagement) with value + delta from `channel.deltas`.
- **Videos:** Filter tabs with counts; table with **Type** column (Short vs Video must come from **YouTube API** when available — store and return from backend; see fields reference. Do not derive from duration only); sortable Views/Likes/Date; page size 10/25/50; "Showing X–Y of Z"; « ‹ › ».
- **Right panel (collapsible):** Properties (handle, createdAt, videoCount, subscribers, totalViews, engagement, status, lastFetchedAt); **Ours / Competitor** (PATCH type); **Sync now** (Refresh); **Analyze all pending** (placeholder or new endpoint); **Remove channel** (modal + DELETE); **⊟ Properties** toggle.

**Files:** [frontend/src/pages/ChannelDetailPage.jsx](frontend/src/pages/ChannelDetailPage.jsx).

---

## Part 3: Video detail page

### Legacy reference (section 8)

- **Top bar:** "← Channel" back, "⊟ Properties" panel toggle.
- **Left:** Thumbnail, "Watch on YouTube" link, **Tabs:** Transcript | Comments | AI Insights | Logs.
  - **Transcript:** Timestamped lines; "⎘ Copy" button.
  - **Comments:** List with sentiment filter (all / positive / negative / question); pin (★) on comment.
  - **AI Insights:** Analysis content.
  - **Logs:** Pipeline stage logs.
- **Right panel:** Properties and **Actions:** "⚡ Retry Analysis", "↺ Re-fetch comments", "⊘ Omit from Analytics".

**Data / fields:** See [CHANNELS_VIDEO_FIELDS_REFERENCE.md § 3. Video detail page](CHANNELS_VIDEO_FIELDS_REFERENCE.md) for `GET /api/videos/:id` (video root, channel, pipelineItem, comments) and every field name and description.

### Data (already available from API)

- **GET /api/videos/:id** returns: video (titleAr, titleEn, youtubeId, thumbnailUrl, viewCount, likeCount, commentCount, publishedAt, duration, **transcription**, omitFromAnalytics), **channel** (id, handle, nameAr, nameEn, avatarUrl), **pipelineItem** (id, stage, status, error, result, …), **comments** (id, text, authorName, likeCount, publishedAt, **sentiment**).
- **GET /api/videos/:id/logs** returns pipeline stage logs (import, transcribe, comments, analyzing, done/failed with timestamps and meta).
- **POST /api/videos/:id/refetch-comments** — re-fetch comments (strict rate limit).
- **POST /api/videos/:id/refetch-transcript** — re-fetch transcript (strict rate limit).
- **POST /api/videos/:id/omit-from-analytics** — body `{ omit: true|false }` or toggle.
- **POST /api/pipeline/:id/retry** — retry pipeline item (use `video.pipelineItem.id` for "Retry Analysis").

### Layout and elements to add

| Element | Legacy | Current | Action |
|--------|--------|---------|--------|
| Top bar | "← Channel" back, "⊟ Properties" toggle | None | Add back link to `/channels/:channelId`, panel toggle button. |
| Thumbnail + link | Video thumbnail, "Watch on YouTube" | None | Add thumbnail image and link to `https://youtube.com/watch?v=${video.youtubeId}`. |
| Tabs | Transcript \| Comments \| AI Insights \| Logs | Single card with stats + analysis pre | Add **tab strip**; one panel per tab. |
| Transcript tab | Timestamped lines; "⎘ Copy" | None | Render `video.transcription` (parse timestamps if stored as [MM:SS] or show raw); **Copy** button → copy to clipboard, show "✓ Copied" briefly. |
| Comments tab | List; sentiment filter (all / positive / negative / question); pin (★) | None | Render `video.comments`; filter by `comment.sentiment` when user selects filter; **Pin** per comment (optional: local state only unless backend supports pinned). |
| AI Insights tab | Analysis content | Shown inline as pre | Move **analysis** (e.g. `video.pipelineItem?.result` or `video.analysisResult`) into **AI Insights** tab. |
| Logs tab | Pipeline stage logs | None | Fetch **GET /api/videos/:id/logs** when Logs tab is active; render list of stages with timestamp, status, meta. |
| Right panel | Properties + Actions | None | Add **collapsible right panel**: video properties (title, views, likes, comments, date, stage, status); **⚡ Retry Analysis** (POST pipeline retry), **↺ Re-fetch comments**, **⊘ Omit from Analytics**; **⊟ Properties** toggle. |

### Buttons and actions (Video detail)

| Button | Legacy behavior | Implementation |
|--------|-----------------|----------------|
| **← Channel** | Navigate to channel detail. | `Link` to `/channels/${channelId}`. |
| **⊟ Properties** | Toggle right panel. | Local state `panelOpen`; show/hide panel; on mobile consider drawer. |
| **Transcript / Comments / Insights / Logs** | Switch active tab. | State `activeTab`; render corresponding panel. |
| **⎘ Copy** (transcript) | Copy transcript text to clipboard. | `navigator.clipboard.writeText(video.transcription)`; set button label to "✓ Copied" for 2s. |
| **Comment filter** | Filter by sentiment. | State `commentFilter` (all / positive / negative / question); filter `video.comments` by `sentiment`; highlight active filter button. |
| **Pin (★)** on comment | Toggle pinned state. | Optional: local state `pinnedCommentIds`; or add backend field later. |
| **⚡ Retry Analysis** | Retry AI analysis for this video. | If `video.pipelineItem?.id` exists, call **POST /api/pipeline/:id/retry** (pipeline item id); invalidate `['video', videoDbId]` and pipeline queries. If no pipeline item, show disabled or "Not in pipeline". |
| **↺ Re-fetch comments** | Re-fetch comments from YouTube. | **POST /api/videos/:id/refetch-comments**; invalidate `['video', videoDbId]`; show loading on button. |
| **⊘ Omit from Analytics** | Toggle omitFromAnalytics. | **POST /api/videos/:id/omit-from-analytics** with `{ omit: !video.omitFromAnalytics }`; invalidate video query; update button label (e.g. "Omit from Analytics" / "Include in Analytics"). |

### Transcript display

- Backend returns `video.transcription` as a string. Legacy shows "timestamped lines" (e.g. `[00:00] text`). If transcription is stored in that format, split by newlines and render; otherwise show as pre-wrapped block. Copy button copies the full string.

### Comments sentiment

- API returns `comment.sentiment`. Use it to filter when user selects "positive", "negative", "question"; "all" shows all. Match exact value (e.g. `positive`, `negative`, `question`) or normalize casing.

### Files to touch (Video detail)

- [frontend/src/pages/VideoDetailPage.jsx](frontend/src/pages/VideoDetailPage.jsx) — full restructure: top bar, thumbnail + YouTube link, tabs (Transcript, Comments, AI Insights, Logs), right panel with properties and three actions, panel toggle.
- Optional: shared **Modal** and **Tabs** components if not present.

---

## Implementation order (all three pages)

1. **Channels page** — header badge, cards, Sync, Delete, delete modal, hint.
2. **Channel detail page** — back link, hero, stats row, right panel, table Type/sort/page size/pagination, panel toggle, actions.
3. **Video detail page** — back link, thumbnail + YouTube link, tabbed content (Transcript with Copy, Comments with sentiment filter, AI Insights, Logs from API), right panel (properties, Retry Analysis, Re-fetch comments, Omit from Analytics), panel toggle.

---

## Backend summary

- **Channels:** GET list, GET :id, GET :id/videos, POST, POST :id/refresh, POST :id/fetch-videos, PATCH :id, DELETE :id — all exist.
- **Videos:** GET :id (with channel, pipelineItem, comments with sentiment, transcription), GET :id/logs, POST :id/refetch-comments, POST :id/refetch-transcript, POST :id/omit-from-analytics — all exist.
- **Pipeline:** POST :id/retry exists; use `video.pipelineItem.id` for "Retry Analysis".

**Optional backend change:** If the YouTube API provides an explicit Short/Video type (or short flag), add a field to the Video model (e.g. `videoType` or `isShort`), populate it when fetching from YouTube, and return it in GET channel videos and GET video detail so the Channel detail table Type column uses it. Until then, frontend can show "—" or an optional duration-based fallback; see [CHANNELS_VIDEO_FIELDS_REFERENCE.md](CHANNELS_VIDEO_FIELDS_REFERENCE.md).

## Design 
Redesign the UI to match Cursor's design language. The goal is:
clean, minimal, dark, dense, professional — no decorative elements.

Rules to follow strictly:

COLORS
- Background: #0f0f0f (deepest bg)
- Surface: #161616 (cards, panels)
- Elevated: #1c1c1c (inputs, hover states)
- Border: #2a2a2a (all dividers)
- Text primary: #e8e8e8
- Text secondary: #888
- Text muted: #484848
- Accent: #5b8af0 (blue, used sparingly)
- Danger: #eb5757
- Success: #4dab9a
- All values must go into :root as tokens — never hardcode anywhere

TYPOGRAPHY
- Font: Inter only
- Base size: 13px
- Labels/meta: 11px
- Mono values: IBM Plex Mono
- Font weights: 400 regular, 500 medium, 600 semibold only — no 700 bold anywhere
- No uppercase labels except section dividers
- Letter spacing on uppercase: 0.06em only

SPACING
- Base unit: 4px
- Padding scale: 8 12 16 20 24 32 40
- Gap scale: 4 6 8 10 12 16 20
- Never use odd numbers like 7px, 9px, 14px, 18px

COMPONENTS
- Buttons: height 28px, padding 0 12px, border-radius 4px, font-size 12px
- Inputs: height 28px, border-radius 4px, background var(--elevated)
- Cards: border-radius 6px, border 1px solid var(--border), no shadows
- Badges/pills: border-radius 3px, font-size 10px, font-family mono
- Sidebar width: 200px, item height 28px, font-size 12px
- Topbar height: 40px
- No box shadows anywhere
- No gradients anywhere
- No blur effects anywhere
- No animations except opacity and transform transitions at 150ms

LAYOUT
- Maximum content width: 100% (full width, no centered container)
- Sidebar always visible on desktop, hidden on mobile
- All padding inside pages: 32px horizontal, 24px top

---

## Design workflow in Cursor (pixel-perfect vs Lovable)

**Repo layout (use this when working in Cursor):**
- **Location:** `~/Code/FALAK REPO/` (or `~/Code/Falak/Falak Resopitory/` — ensure the agent can see both codebases).
- **Falak (implementation):** `falak-main/` — the app we are building. Frontend: `falak-main/frontend/` (React, Vite, CSS Modules).
- **Lovable reference:** `vid-wise-owl-55f3df98-main/` (or `vid-wise-owl-main/` if re-downloaded) — the design source of truth. Tailwind + shadcn-style components in `src/components/` (e.g. `AppSidebar.tsx`, `AppLayout.tsx`).

**Rules for design in Cursor:**
1. **Reference first.** For any UI (sidebar, dropdown, page layout), open the matching component in the Lovable repo and copy spacing, structure, and behavior. Map Tailwind classes to our tokens (e.g. `left-2 right-2` → `var(--gap-3)` 8px; `px-3` → 12px; `text-[13px]` → 13px).
2. **Phases — one at a time, confirm before next.**  
   - Phase 0: Cleanup, tokens, mock data, shared UI components.  
   - Phase 1: App Shell (sidebar, topbar, drawer, push layout, no overlay, sharp corners). **Confirm pixel-perfect.**  
   - Phase 2: Channels page. **Confirm pixel-perfect.**  
   - Phase 3: Channel detail page. **Confirm pixel-perfect.**  
   - Phase 4: Login (if in scope).  
   - Phase 5+: Pipeline, Monitor, Analytics, Stories, Brain, Settings, Admin — each confirmed before moving on.
3. **No hardcoded values.** All colors, spacing, and typography come from `:root` tokens (see Design section above). Components use CSS variables only.
4. **Components over one-offs.** Use shared components (Button, Input, Tabs, PageHeader, Avatar, StatCard, Dialog, etc.) so design stays consistent and token-driven.
5. **Desktop → tablet → mobile.** Check breakpoints (e.g. 1024px desktop, 768px tablet, 640px mobile) and safe-area insets for topbar/drawer on notched devices.
6. **Dummy data.** Keep all mock data in `frontend/src/data/mock.ts` (or equivalent). Swap to real API hooks when design is locked; no design logic in mock.

**Key reference files (Lovable):**
- Sidebar + project dropdown: `vid-wise-owl-55f3df98-main/src/components/AppSidebar.tsx` (dropdown: `left-2 right-2`, `rounded-xl`, `px-3` on rows, "Projects" label).
- Layout: `vid-wise-owl-55f3df98-main/src/components/AppLayout.tsx`.
- Channels / Channel detail / Video table: same repo `src/pages/` and `src/components/` as needed.

**Commit rule (from .cursor rules):** Format messages as: `[CHANGED FILES]: ... [WHAT CHANGED]: ... [ROUTES AFFECTED]: ... (if backend) [FUNCTIONS CHANGED]: ... (if frontend)`.