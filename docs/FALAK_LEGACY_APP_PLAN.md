# Falak Legacy App — Full Plan & Button Reference

This document describes **how the legacy Falak app works** (single-file HTML with dummy data and access control), page by page, including every major element and what each button does. Source: [old-falak/falak_access_10.html](https://github.com/aldhubaib/old-falak/blob/main/falak_access_10.html).

---

## 1. App flow (high level)

1. **Login** → User picks an account from a list (dummy; no real Google OAuth in the demo). Access control applies: each user has **pages** and **projects** they can access.
2. **First page after login** → User is sent to their first allowed page (e.g. Channels) with the **active project** (e.g. Fun, Horror, Travel) shown in the header.
3. **Global chrome** → Sidebar (nav items: Channels, Pipeline, Monitor, Analytics, Stories, Brain, Settings, Admin), project dropdown at top, user block at bottom with sign-out.
4. **Navigation** → Clicking a nav item calls `navigate(page)`. If the current user’s `pages` does **not** include that page, the app shows **Access Denied** instead of the page. Locked nav items are dimmed and not clickable.
5. **Project scope** → Channels, Pipeline, Monitor, Analytics, Stories, and Brain are all scoped to the **selected project**. Admin and Settings are global.

---

## 2. Pages and routes

| Route / ID    | Page name  | Purpose |
|---------------|------------|--------|
| `login`       | Login      | Pick account (dummy) or “Continue with Google”; access hint text. |
| `channels`    | Channels   | List channels in project; add channel; open channel detail. |
| `channel`     | Channel    | Single channel: hero, stats, video table, right panel (properties, ownership, actions). |
| `video`       | Video      | Single video: transcript, comments, AI insights, logs; right panel (properties, actions). |
| `pipeline`     | Pipeline   | Kanban by stage; pause/resume; retry; column drawers. |
| `monitor`     | Monitor    | Channel health table; alerts; pause/resume; force run; cadence override. |
| `analytics`   | Analytics  | Period selector; universe stats; You vs Them; benchmarks; trend chart; top videos; insights; Beat X. |
| `stories`     | Stories    | Stage rail + detail panel; fetch; move stage; brief; first-mover. |
| `brain`       | Brain      | Per-workspace story DB; extract from transcripts; published videos; gap win rate; query builder. |
| `settings`    | Settings   | API keys (YouTube, Anthropic); usage and cost; clear key; reset usage. |
| `admin`       | Admin      | User list; add user; edit user (role, pages, projects); delete user. |
| `denied`      | Access Denied | Shown when user tries to open a page they don’t have access to. |

Sub-pages: `channel` and `video` are treated as part of **Channels** for access (if user has `channels`, they can open channel and video).

---

## 3. Login page (`#page-login`)

**Elements:**
- Title: “Sign in to Falak”, subtitle “YouTube intelligence platform”.
- **Continue with Google** button (in demo, hidden when access control is on).
- **Access hint**: “Access is invite-only. Your account must be pre-approved to sign in.”
- Footer: “falak.io · v0.4.1”.

**Access control (demo):**
- “Continue with Google” is hidden; a **user picker** is shown instead.
- **Select your account**: list of dummy users (e.g. Abdulaziz, Sara, Faisal) with initials, name, email, role.
- **What each option does:** Clicking a user calls `loginAs(userId)`: sets `currentUser`, applies `applyAccess(user)` (updates sidebar locks and admin nav), then `navigate(firstPage)` where `firstPage` is `user.pages[0]` or `'channels'`.

**Buttons / actions:**
- **User row** → `loginAs(userId)`: log in as that user and go to first allowed page.

---

## 4. Sidebar (global)

**Elements:**
- Brand row: “Falak” + collapse toggle (← / →). Collapsed state is stored in `localStorage` (`sbCollapsed`).
- **Project dropdown** (when not collapsed): shows current project name and color dot; click opens dropdown with project list and “＋ New project”.
- **Nav items** (each has `data-label` and `onclick="navigate('pageId')"`):
  - Channels, Pipeline, Monitor, Analytics, Stories, Brain, Settings, Admin.
- **Nav locked:** If `currentUser.pages` does not include that page, the item gets class `nav-locked` (dimmed, no pointer, not clickable).
- **User block:** Avatar (initials), name, email; **⎋** sign-out.

**Buttons / actions:**
- **Collapse toggle** → `toggleSidebar()`: toggle `.collapsed` on sidebar, persist to localStorage.
- **Project row** → `toggleProjectDropdown()`: show/hide project list.
- **Project option** → `selectProject(el)`: set active project (update header title, sub, tag, dropdown label and dot), close dropdown.
- **＋ New project** → `openNewProject()`: open “New project” modal.
- **Nav item** → `navigate(pageId)` (unless locked).
- **Sign-out (⎋)** → `signOut()`: confirm “Sign out of Falak?” then `navigate('login')` and clear `currentUser`, show login picker again.

---

## 5. New project modal

**Elements:**
- Title: “New Project”.
- **Project Name** (required).
- **Description** (optional).
- **Color** row: color dot buttons; one is “selected”.
- **Cancel** / **Create Project**.

**Buttons / actions:**
- **Cancel** → `closeNewProject()`: close modal.
- **Color dot** → `selectColor(c, el)`: set `selectedColor`, update “selected” state.
- **Create Project** → `createProject()`: read name; if empty, show error on name field; else create `projects[id] = { name, color, desc }`, add option to list, close modal, call `selectProject(div)` on the new option.

---

## 6. Channels page (`#page-channels`)

**Elements:**
- **Header:** “Channels”, subtitle, **channel count** badge (e.g. “6 ch”).
- **Project header:** Project name, “● Active”, description, project dropdown (Fun ▾), list (Fun 6 ch, Horror 6 ch, Travel 6 ch), “＋ New project”.
- **Add box:** “+ Add Channel” section:
  - Text input (URL or @handle).
  - **Competitor** / **Ours** toggle (`addOwnership`).
  - **+ Add** button.
  - Hint: “Examples: youtube.com/@channelname, @handle, or UCxxx...”.
- **Channel grid:** Cards; each card:
  - Avatar, name (RTL), handle, status (Active), last sync time, “★” if ours.
  - Stats: Subs, Views, Videos.
  - **↗ View Details** | **⟳** (sync) | **🗑** (delete).

**Buttons / actions:**
- **+ Add** → `addChannel()`: validate input; if handle already in grid, show error “This channel is already in the project”; else add card to grid (dummy), clear input.
- **↗ View Details** → `navigate('channel')` (and pass channel context so channel page can render; in demo this is implicit).
- **⟳** on card → Sync that channel (dummy: refresh displayed time).
- **🗑** on card → `openDeleteModal(btn)`: set `cardToDelete`, show delete modal with channel name.

**Delete modal:**
- “Remove channel?” + “Are you sure…?”; **Cancel** → `closeDeleteModal()`; **Remove Channel** → `confirmDelete()`: animate card out, remove from DOM, close modal.

**Ownership:** “Ours” vs “Competitor” sets `addOwnership`; new channels are added with that type. On a card, clicking the **ownership badge** (or a dedicated toggle) calls `toggleOwnership(card)`: flip between ours/competitor, update ★ and card class.

---

## 7. Channel detail page (`#page-channel`)

**Elements:**
- **Top bar:** “← Channels” back, right-side buttons (e.g. Sync, Analyze).
- **Hero:** Avatar, channel name, handle (link), badges (e.g. Active, 282 videos, “⟳ Synced today”).
- **Stats row:** 6 boxes (e.g. Subscribers, Total Views, Total Videos, Avg Views, Engagement) with value, change vs last period.
- **Body left:** “Videos” section:
  - **Filter tabs:** Imported, Transcribed, Comments, Analyzing, Done, Failed (with counts).
  - **Table:** Title, Type, Views, Likes, Date, Status (sortable). Rows are videos.
  - **Pagination:** Rows per page (10/25/50), “Showing X–Y of Z”, « ‹ › ».
- **Right panel (Properties):**
  - Handle, Added, Videos/Shorts, Subscribers, Total Views, Engagement, Status, Last sync, Next sync.
  - **Channel Type:** Ours / Competitor toggle.
  - **Actions:** “↺ Sync now”, “⚡ Analyze all pending”, “⊘ Remove channel”.
- **Panel toggle:** “⊟ Properties” to hide/show panel.

**Buttons / actions:**
- **← Channels** → `navigate('channels')`.
- **Filter tab** → Sets `vtFilter`, `vtPage = 1`, then `renderTable()` / `renderCards()` (table and card view filtered by stage/type).
- **Column header (sortable)** → `sortTable(col)`: toggle asc/desc, re-sort rows, re-render.
- **Page size** → `updatePageSize(v)`: set `vtPageSize`, reset to page 1, re-render.
- **Page buttons** → `goPage(p)`: set `vtPage`, re-render.
- **Video row** → Navigate to video detail (e.g. `navigate('video')` with video id).
- **Ours / Competitor** (panel) → `setPanelOwnership(val, el)`: sync panel and sheet toggles; in real app would persist to backend.
- **↺ Sync now** → Sync this channel (dummy).
- **⚡ Analyze all pending** → Queue all pending videos for analysis (dummy).
- **⊘ Remove channel** → Remove channel from project (dummy; would call API in real app).
- **⊟ Properties** → `togglePanel('ch-panel')`: hide/show right panel; on mobile opens sheet instead.

---

## 8. Video detail page (`#page-video`)

**Elements:**
- **Top bar:** “← Channel” back, “⊟ Properties” panel toggle.
- **Left:** Thumbnail, “Watch on YouTube” link, **Tabs:** Transcript | Comments | AI Insights | Logs.
  - **Transcript:** Timestamped lines; “⎘ Copy” button.
  - **Comments:** List with sentiment filter (all / positive / negative / question); pin (★) on comment.
  - **AI Insights:** (Dummy content.)
  - **Logs:** (Dummy.)
- **Right panel:** Properties and **Actions**: “⚡ Retry Analysis”, “↺ Re-fetch comments”, “⊘ Omit from Analytics”.

**Buttons / actions:**
- **← Channel** → `navigate('channel')`.
- **Transcript / Comments / Insights / Logs** → `switchTab(name)`: show that panel.
- **⎘ Copy** → `copyTranscript()`: copy transcript text to clipboard; button shows “✓ Copied” briefly.
- **Comment filter** → `filterComments(type, btn)`: show only that sentiment; update button state.
- **Pin (★)** → `pinComment(btn)`: toggle pinned state and styling.
- **⊟ Properties** → `togglePanel('vid-panel')`.
- **⚡ Retry Analysis** → Retry AI analysis for this video (dummy).
- **↺ Re-fetch comments** → Re-fetch comments (dummy).
- **⊘ Omit from Analytics** → Mark video as omitted from analytics (dummy).

---

## 9. Pipeline page (`#page-pipeline`)

**Elements:**
- **Header:** “Pipeline”, “Est. completion ~2h 14m · Refreshing in 30s”, “System running”, **⏸ Pause**, **↺ Retry all failed (8)**.
- **Stats grid:** Total videos, “in pipeline”, “done”; then per stage: count, “active”, “left”, ETA; Failed: count, “needs retry”, “errors”.
- **Kanban columns:** Import (48), Transcribe (62), Comments (71), AI Analysis (38), Failed (8). Each column has:
  - Step number and label, “↺ All” (retry all in column), subtitle (e.g. “YouTube metadata · API”).
  - List of cards: title, channel handle, status (e.g. “Fetching…”, “4m 01s waiting”), **↺** retry.
- **Column click** → Opens a **drawer** with full list for that stage, search, and same retry behavior conceptually.
- **30s countdown** → When it hits 0, “Refreshed!” and countdown resets to 30.

**Buttons / actions:**
- **⏸ Pause** → `plPauseResume(btn)`: set `plPaused = true`, button becomes “▶ Resume”, status “Paused”, timers stop.
- **▶ Resume** → Same function: `plPaused = false`, button “⏸ Pause”, status “System running”, timers run again.
- **↺ Retry all failed (8)** → `plRetryAll()`: all “Retry” buttons in Failed column get “↺ Queued”, disabled.
- **↺** on a card → Retry that single item (dummy: button state “Queued”).
- **↺ All** on column header → Retry all in that column (dummy).
- **Column header / count** → `openColDrawer(col, total, title, sub)`: open column drawer with list and search; **✕** on drawer → `closeColDrawer()`.
- **Drawer search** → `filterDrawer(query)`: filter list by title or handle.

---

## 10. Monitor page (`#page-monitor`)

**Elements:**
- **Alert bar** (if any): e.g. “Critical: 1 channel unreachable @mghamdi…”; **Dismiss** | **Remove**.
- **Header:** “Monitor”, status line (e.g. “Now checking @badr3 · 32/47 due today · API quota resets in 14h 22m”), “Crawler running”, **⏸ Pause**, **↺ Force run all**.
- **Stats:** Channel Health (Total, Healthy, Inactive, Gone); Check cadence (auto-learned buckets); API Quota (used/remaining, resets, keys); “32 checks today”, “68 queued tomorrow”.
- **Tabs:** All (47) | Due today (32) | Issues (8).
- **Table:** Channel (emoji, ★ if owned, name, handle), Last check, New videos, Last video, Next check, Cadence, Override (dropdown or “locked” for owned).

**Buttons / actions:**
- **Dismiss** (alert) → Hide alert bar.
- **Remove** (alert) → `removeChannel(handle)`: hide alert (and in real app would remove or flag channel).
- **⏸ Pause** → `monPauseResume(btn)`: toggle “▶ Resume” / “⏸ Pause”.
- **↺ Force run all** → `monForceRun()`: alert “Force crawl triggered…” (dummy).
- **Tab** → `monFilter(filter, btn)`: set `monActiveFilter`, update active tab, `monRenderTable()`.
- **Search** → `monSearch(q)`: set `monSearchQ`, re-render table.
- **Override dropdown** → `monSetOverride(handle, val)`: set channel’s `override` (e.g. “Every 2d”), re-render; owned channels show “locked”.

---

## 11. Analytics page (`#page-analytics`)

**Elements:**
- **Header:** “Analytics”, “9 channels tracked · Apr 2025 – Mar 2026”, period buttons **30d** **90d** **12m**.
- **Universe stats:** Channels (11, 2 owned, 9 competitors), Total Subscribers, Total Views, Videos Tracked, Avg Engagement, Uploads/Month; some with “yours” vs “top” and channel handle.
- **You vs the Field:** Metric tabs (Subscribers, Engagement, Views, Upload rate); score cards; comparison bars (you vs each competitor); action banner (text insight).
- **Channel Analysis:** “Your channels” vs “Competitors” list.
- **Channel Benchmarks:** Three columns (Subscribers, Total Video Views, Avg Engagement Rate); each column is a ranked list with bar.
- **Monthly Trend:** Tabs (Videos, Views, Likes, Subscribers); SVG chart; legend “Your channels” / “Competitors”.
- **Top Videos by Views:** Ranked list (title, channel, views).
- **Key Insights:** Cards with tag (Efficiency, Opportunity, Threat, Market, Signal), title, body.
- **Beat X:** Two dropdowns “Your channel” / “vs channel”; then comparison blocks (Upload rate, Engagement, Avg views, Subscribers) with “Winning” / “Top priority” etc., gap, target, and **Action Plan** steps.

**Buttons / actions:**
- **30d / 90d / 12m** → `anSetPeriod(p, btn)`: set period, update active button (chart/data in demo are fixed).
- **You vs Them metric tab** → `anYvtMetric(metric, btn)`: set `anYvtCurrent`, re-render comparison and banner.
- **Trend metric tab** → `anSetTrend(metric, btn)`: set `anTrendMetric`, re-render SVG trend chart.
- **Beat: channel selects** → Changing dropdowns triggers `anRenderBeat()`: compare selected “my channel” vs “vs channel”, show gaps and action plan.

---

## 12. Stories page (`#page-stories`)

**Elements:**
- **Summary bar:** Pipeline-style cells: AI Suggestion, Liked, Approved, Produced, Publish, Done (each with count and sub-label); “First Mover” percentage.
- **View dropdown:** “AI Suggestion ▾” (or current stage); opens list of stages (favorites + all); search.
- **Rail (left):** List of stories in current stage; each item: headline, “1st”/“Late” badge, source, date, score chips (R, V, FM), total, “→”.
- **Detail panel (right):** Selected story: headline, stage, source, scores, coverage; **Brief** (title, hook, ending, script long/short); **Publish** block (URL, stats when done); stage actions (e.g. Like, Approve, Generate brief, Mark produced, Publish, Done).
- **Fetch:** “↓ Fetch” (or similar) to fetch new suggestions (dummy).

**Buttons / actions:**
- **Stage in dropdown** → Select stage, `stActiveStage = id`, `stRenderRail()`, `stRenderDetail()`.
- **Story in rail** → `stSelect(id)`: set `stSelectedId`, render rail and detail; if panel was closed, `stOpenPanel(id)`.
- **Close panel** → `stClosePanel()`: hide detail, expand rail.
- **Stage action buttons** (e.g. Like, Approve, → Produced) → Move story to next stage; update `ST_STORIES`, re-render rail and summary.
- **Generate brief** → Generate AI brief for approved story (dummy).
- **Copy script** → Copy short/long script to clipboard.
- **↓ Fetch** → Fetch new story suggestions (dummy).

---

## 13. Brain page (`#page-brain`)

**Elements:**
- **Workspace selector:** Tabs or list (e.g. Fun, Horror, Travel) for “Channel Brain” per workspace.
- **Competitor Story Database:** “Last extracted” or “No stories extracted yet”; **↻ Re-extract** or **▶ Extract from Transcripts**; then lists “Already Covered by Competitors” and “Untouched — Nobody Made a Video Yet” with story rows.
- **Your Published Videos:** “+ Add URL”; then list of videos with title, views, likes, comments, date, “🎯 Gap Win” / “⚔ Late”.
- **Gap Win Rate:** Gap Wins count, Late count, Win rate %, and optional “Gap Win avg / Late avg” and first-mover advantage line.
- **Competitor Transcripts:** Channels feeding this workspace; checkmark if transcript used.
- **Auto Search Query:** Perplexity-style prompt; **Copy** button.
- **⚙ API Keys** → Opens Brain API keys modal (Anthropic, YouTube); **Cancel** / **Save**; “✓ Brain updated”.

**Buttons / actions:**
- **Workspace tab** → `brSwitchWs(id)`: set `brActiveWs`, `brRenderContent()`.
- **▶ Extract from Transcripts** → `brExtractStories()`: call Claude to extract story names from competitor transcripts, update `storyDB`, set `lastExtracted`, re-render.
- **↻ Re-extract** → Same extraction again.
- **+ Add URL** → Show input for YouTube URL; **Analyze** → `brFetchVideo()`: fetch video, check if story was gap/late, add to `published`, re-render.
- **Copy** (query) → `brCopyQuery()`: copy smart query to clipboard.
- **⚙ API Keys** → `brOpenSettings()`: show keys modal; **Save** → `brSaveSettings()`; **Cancel** → `brCloseSettings()`.

---

## 14. Settings page (`#page-settings`)

**Elements:**
- **Header:** “Settings”, “API keys and usage monitoring — admin only”, **✓ Saved**, **Save All Keys**.
- **Summary:** Total API calls, Estimated cost, Keys configured (e.g. 2/3).
- **API Keys:** For each key (YouTube Data API v3, Anthropic): icon, label, “● SET” / “○ NOT SET”, **Clear** (if set), description.
- **Note:** “Keys are stored in session memory only…”
- **Usage This Session:** Per API: icon, label, primary stat (tokens/units/calls), % of limit, cost; **Reset counters**.
- **Recent API Calls:** Table (Time, API, Action, Tokens/Units, Cost, Status).

**Buttons / actions:**
- **Save All Keys** → `seteSaveAll()`: read inputs for each key id, if non-empty and not placeholder update `API_KEYS[id].key`, sync to Brain keys if present, re-render, show “✓ Saved” briefly.
- **Clear** (per key) → `seteClearKey(id)`: clear that key, re-render.
- **Reset counters** → `seteResetUsage()`: zero all usage and log, re-render.

---

## 15. Admin page (`#page-admin`)

**Elements:**
- **Sidebar:** Same nav as main app (locked by `user.pages`); current user block.
- **Main:** “Access Control”, “Manage which users…”, **↻** refresh.
- **Blurb:** “The project owner always has full access… You can control which pages and projects each user can access.”
- **Add Allowed User:** Email input, **Viewer / Editor / Admin** role select, **Add**; error line.
- **User list:** For each user: avatar, name (“owner” tag, “(you)” if self), email, note, “Added by”, date; **page chips** (Channels, Pipeline, …), **project chips** (Fun, Horror, Travel); **role** pill; **✎** Edit, **🗑** Delete (owner has no Delete).
- **Edit drawer:** Name, Email, Note; **Role** (Admin / Editor / Viewer) with cards; **Pages** grid (toggle each page on/off); **Projects** grid (toggle each project on/off); **Save**; **Delete user** with confirm.

**Buttons / actions:**
- **↻** → `acRefresh()`: `acRenderPage()`.
- **Add** → `acAddUser()`: validate email; if duplicate show error; else create user with default `pages` by role (admin: all, editor: channels/pipeline/analytics, viewer: channels/analytics), all projects, push to `USERS`, re-render list and login picker.
- **✎** → `acOpenDrawer(userId)`: load user into drawer (`_acEditId`, `_acPages`, `_acProjs`, `_acRole`), fill form and toggles, open drawer.
- **🗑** (in list) → `acQuickDelete(userId)`: if not owner, confirm then remove from `USERS`, re-render and update picker.
- **Role card** (in drawer) → `acSelectRole(role, btn)`: set `_acRole`, update selection style.
- **Page toggle** → `acTogglePage(pageId, el)`: add/remove `pageId` from `_acPages`, toggle “on” class.
- **Project toggle** → `acToggleProj(projId, el)`: add/remove from `_acProjs`, update style (color for project).
- **Save** → `acSaveUser()`: update user’s name, email, note, role, pages, projects; if editing self, `applyAccess(user)`; close drawer, re-render list and picker.
- **Delete user** (in drawer) → `acShowDelConfirm()` then **Confirm** → `acConfirmDelete()`: remove user, close drawer, re-render and picker.

---

## 16. Access Denied page (`#page-denied`)

**Elements:**
- Centered content: message that user does not have access to the requested page (exact copy can vary).

**Flow:**
- Shown when `navigate(page)` is called and `currentUser.pages` does not include the requested page (or its parent, for channel/video). All pages are deactivated and `#page-denied` gets `.active`.

---

## 17. Navigation and access control (summary)

- **`navigate(page)`** (overridden when access control is on):
  - If no `currentUser` → original navigate (for login flow).
  - If `page === 'login'` → clear user, go to login, show picker.
  - Else compute `checkPage` (e.g. `channel` → `channels`). If `!currentUser.pages.includes(checkPage)` → show **Access Denied** and return.
  - Else call original `navigate(page)`; then page-specific inits (e.g. admin: `acRenderPage()`; stories: `stInit()`; brain: `brInit()`; settings: `seteInit()`; analytics: `anInit()`).
- **Sidebar:** `applyAccess(user)` adds `nav-locked` to nav items whose page is not in `user.pages`.
- **Dummy users (example):**
  - **u1 (admin, owner):** all pages, all projects.
  - **u2 (editor):** channels, pipeline, analytics; projects Fun, Travel.
  - **u3 (viewer):** channels, analytics; project Horror only.

---

## 18. Data and state (dummy)

- **Projects:** `projects` object (e.g. fun, horror, travel) with name, color, desc; “New project” adds to this and to the dropdown list.
- **Channels:** Rendered from static HTML / injected cards; add channel only updates DOM.
- **Pipeline:** `plColData` per stage; `plState` and `plQueue` for timers; pause state `plPaused`.
- **Monitor:** `monChannels` array; filters and search in memory; override per channel.
- **Analytics:** `anChannels`, `anYou`, `anTopVideos`, period/trend metric; “Beat X” uses same data.
- **Stories:** `ST_STORIES` array, `ST_STAGES`; `stActiveStage`, `stSelectedId`, `stActiveProj`.
- **Brain:** `WORKSPACE_BRAINS` per workspace (storyDB, published, compHandles, lastExtracted); `BR_KEYS` for API keys.
- **Settings:** `API_KEYS`, `API_TOTALS`, `API_USAGE_LOG`.
- **Admin:** `USERS` array; `PAGES`; `PROJECTS_DEF`; `currentUser`; edit state `_acEditId`, `_acPages`, `_acProjs`, `_acRole`.

---

This document is the single reference for “how the legacy app works and what each button does” for the Falak legacy HTML app. Use it to align the new React/API app’s behavior and to implement or refine features (e.g. access control, project scope, and per-page actions).
