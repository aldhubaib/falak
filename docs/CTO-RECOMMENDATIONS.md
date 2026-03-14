# CTO Recommendations: Clean, Scalable, Fast

High-impact changes to make Falak cleaner, more scalable, and faster—in priority order.

---

## 1. **Split the frontend (clean + scalable)**

**Current:** Single ~10k-line `public/index.html` with inline CSS/JS, no build.

**Problems:** Hard to maintain, no tree-shaking, no code-splitting, every page loads everything, merge conflicts, no type safety.

**Recommendation:**

- **Introduce a real frontend app** (e.g. Vite + React or Vue) in `frontend/` or `app/`:
  - Routes → separate pages/components; shared layout and design tokens.
  - State → one small store (Zustand/Pinia) or React Query for server state; kill 50+ global variables.
  - API → single `api` client with typed responses and consistent error handling.
- **Keep design tokens** in CSS variables; move component styles into CSS modules or a single design system file.
- **Build step:** `npm run build` → static assets; serve from Express or CDN. Enables caching and faster loads.

**Impact:** Much cleaner codebase, easier onboarding, better performance (lazy routes, smaller initial bundle).

---

## 2. **Backend: consistent structure and error handling**

**Current:** Routes do ad-hoc try/catch, `res.status(500).json({ error: e.message })`; no shared validation or error codes.

**Recommendation:**

- **Central error handler:** Express error middleware that maps known errors (e.g. `NotFound`, `ValidationError`) to status codes and a stable JSON shape: `{ error: { code, message } }`. Routes `throw new NotFound('Video not found')` instead of manual `res.status(404)`.
- **Validation:** Use a schema layer (e.g. Zod) for request body/query; validate in one place and throw `ValidationError`.
- **Route layout:** Keep `src/routes/` and `src/services/`; add a thin `src/controllers/` if you want routes to only call `controller.fn(req, res)` and keep handlers testable without `res`.
- **BigInt serialization:** One shared `serialise` (or Prisma middleware) so you never leak raw BigInt in JSON.

**Impact:** Predictable API contract, fewer bugs, easier testing and client handling.

---

## 3. **Pagination and list limits**

**Current:** List endpoints return full sets (channels, videos, pipeline items). Channel detail loads *all* videos for that channel with no limit.

**Recommendation:**

- **Cursor- or offset-based pagination** on all list APIs:
  - `GET /api/channels?projectId=x&limit=20&cursor=...`
  - `GET /api/channels/:id/videos?limit=50&offset=0` (or cursor by `publishedAt`).
  - `GET /api/pipeline?stage=...&limit=...`
- **Default limits** (e.g. 50) and a max (e.g. 200) to avoid accidental 10k-row responses.
- **Channel detail:** For avgViews/engagement, either:
  - Persist in `Channel` or `ChannelSnapshot` and stop recomputing on every request, or
  - Use a single aggregated query (e.g. `Video` aggregate by `channelId`) instead of loading all rows into JS.

**Impact:** Stable response times as data grows; no “timeout on channel with 2000 videos”.

---

## 4. **Stop writing on every read (channel snapshot)**

**Current:** `GET /api/channels/:id` **creates** a `ChannelSnapshot` on every request.

**Problems:** Write amplification, lock contention, and unnecessary storage if the page is hit often.

**Recommendation:**

- Create snapshots only when data actually changes:
  - In the pipeline after import/sync, or in a scheduled job (e.g. daily), or when channel stats are refreshed.
- Keep `GET /api/channels/:id` read-only: load channel + last snapshot (if any) + optionally aggregated video stats from DB.

**Impact:** Fewer writes, faster and more predictable channel detail endpoint.

---

## 5. **Pipeline: move to a real queue**

**Current:** In-process worker polling DB every 10s; up to 3 items per stage. Single process.

**Problems:** Doesn’t scale horizontally (multiple app instances would double-process), polling is inefficient, no retry backoff, no dead-letter handling.

**Recommendation:**

- **Introduce a queue** (e.g. Bull/BullMQ with Redis, or SQS):
  - Pipeline stages push jobs to the queue; workers pull and process.
  - One job per pipeline item (or per stage); idempotency key = `pipelineItem.id` + stage.
- **Run workers separately** (e.g. `npm run worker` or a separate Railway service); scale worker count independently from API.
- **Retries:** Exponential backoff and max retries in the queue; on final failure, mark item failed and optionally notify.

**Impact:** Horizontal scaling, no duplicate work, better reliability under load.

---

## 6. **Caching where it matters**

**Current:** No caching; every request hits the DB and external APIs (YouTube, transcript, etc.).

**Recommendation:**

- **API response cache (short TTL)** for read-heavy, slowly changing data:
  - e.g. `GET /api/analytics?projectId=&period=` cache for 5–15 minutes (in-memory or Redis).
  - Invalidate or use a short TTL when pipeline/import runs for that project.
- **External API responses:** Cache transcript and maybe video metadata by `youtubeId` for a few hours to reduce YouTube/transcript API calls.
- **HTTP cache headers:** For static assets and for GET endpoints that are cacheable, set `Cache-Control` so browsers/CDNs can cache.

**Impact:** Lower DB and external API load, faster repeat visits.

---

## 7. **Database: avoid N+1 and heavy reads**

**Current:** Some routes do multiple sequential queries (channel + all videos + snapshot) and compute in JS.

**Recommendation:**

- **Channel detail:** One query with `include: { videos: { take: 500, select: { viewCount, likeCount, commentCount } } }` if you still need in-memory aggregates, or use Prisma `aggregate`/`groupBy` so the DB does the math.
- **Analytics:** Already one `findMany` with nested `videos`; ensure `omitFromAnalytics` and `publishedAt` are in the same `where` and indexes are used (you have indexes; verify with `EXPLAIN` on heavy queries).
- **Pipeline list:** Already a single `findMany` with includes; keep it. If the list grows (e.g. 10k items), add pagination and filter by stage/status in the query.

**Impact:** Fewer round-trips and less data over the wire; faster response times.

---

## 8. **API rate limiting and security**

**Current:** Rate limit only on auth; no global or per-user limits on expensive endpoints.

**Recommendation:**

- **Global rate limit** for `/api/*` (e.g. 200 req/min per IP) to protect against abuse.
- **Stricter limits** on expensive or external-calling endpoints (e.g. refetch-comments, refetch-transcript, pipeline retry).
- **Auth:** Keep HTTP-only cookie + optional Bearer; ensure `requireAuth` and `requireRole` are used on every protected route (audit once).

**Impact:** Safer and more predictable under traffic spikes or misuse.

---

## 9. **Config and env**

**Current:** Env vars read ad-hoc; no single validated config.

**Recommendation:**

- **One config module** (e.g. `src/config.js`): read `process.env` once, validate required keys (e.g. `DATABASE_URL`, `JWT_SECRET`), export a frozen object. Fail fast at startup if something is missing.
- **No secrets in logs:** Ensure Prisma and any logger never log request bodies or tokens.

**Impact:** Clear contract for deployment and fewer “works on my machine” issues.

---

## 10. **Observability and operations**

**Current:** Console logging; health check returns `{ ok: true }`.

**Recommendation:**

- **Structured logs:** JSON logs with level, timestamp, request id, and error stack so you can ship to a log aggregator (e.g. Railway, Datadog).
- **Health check:** Include DB check (e.g. `prisma.$queryRaw\`SELECT 1\``) and optionally queue/Redis if you add it. Return 503 if DB is down.
- **Metrics (optional):** Counts for pipeline stages, API latency percentiles, and external API errors so you can alert and tune.

**Impact:** Easier debugging and production readiness.

---

## Summary table

| Area            | Change                                      | Clean | Scalable | Fast |
|----------------|---------------------------------------------|-------|----------|------|
| Frontend        | Split to app + build, state, routes         | ✅✅   | ✅       | ✅   |
| API             | Error middleware, validation, pagination   | ✅✅   | ✅       | ✅   |
| Channel detail  | No snapshot-on-read; aggregates in DB      | ✅    | ✅       | ✅✅  |
| Pipeline        | Queue (Redis/SQS) + separate workers        | ✅    | ✅✅     | ✅   |
| Caching         | Short TTL on analytics + external responses | ✅    | ✅       | ✅✅  |
| Rate limiting   | Global + strict on heavy endpoints         | ✅    | ✅       | ✅   |
| Config          | Single validated config module              | ✅✅   | —        | —    |
| Observability   | Structured logs, health with DB check       | ✅    | ✅       | —    |

Implementing **2 (errors + validation), 3 (pagination), 4 (snapshot-on-read), and 7 (DB aggregates)** gives the biggest gain for relatively small refactors. **1 (frontend split)** and **5 (queue)** are larger efforts but set you up for long-term scale and cleanliness.
