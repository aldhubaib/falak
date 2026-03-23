try { require('dotenv').config() } catch (_) {}
const config     = require('./config')
const express    = require('express')
const helmet     = require('helmet')
const cors       = require('cors')
const compression = require('compression')
const cookieParser = require('cookie-parser')
const path       = require('path')
const rateLimit  = require('express-rate-limit')
const pinoHttp   = require('pino-http')
const logger     = require('./lib/logger')
const { requestIdMiddleware } = require('./middleware/requestId')

const db = require('./lib/db')
const { encrypt } = require('./services/crypto')
const { bigintJson } = require('./lib/serialise')
const authRoutes     = require('./routes/auth')
const channelRoutes  = require('./routes/channels')
const pipelineRoutes = require('./routes/pipeline')
const storyRoutes    = require('./routes/stories')
const analyticsRoutes = require('./routes/analytics')
const { monitor, profiles } = require('./routes/misc')

const app = express()

// ── Trust proxy (Railway, etc.) so redirects and X-Forwarded-* work ──
app.set('trust proxy', 1)

// ── Request id and structured logging ─────────────────────────
app.use(requestIdMiddleware)
app.use(pinoHttp({ logger, autoLogging: true }))

// ── Security & Middleware ─────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false })) // CSP off — single HTML app
app.use(compression({
  filter: (req, res) => {
    if (req.headers.accept === 'text/event-stream') return false
    return compression.filter(req, res)
  },
}))
app.use(cookieParser())
app.use(express.json({ limit: '2mb' }))
// CORS: allow exact APP_URL; also allow request origin if same host (e.g. Railway URL with/without www)
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true) // same-origin or non-browser
    const appHost = new URL(config.APP_URL).host
    const originHost = (() => { try { return new URL(origin).host } catch { return '' } })()
    if (origin === config.APP_URL || originHost === appHost) return cb(null, true)
    return cb(null, config.APP_URL)
  },
  credentials: true,
}))

// Rate limiting: global API 500/min; auth mutations 30/15min (GET /me exempt)
app.use('/api', rateLimit({ windowMs: 60 * 1000, max: 500, message: { error: { code: 'rate_limit', message: 'Too many requests' } } }))
app.use('/api/auth', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  skip: (req) => req.method === 'GET' && req.path === '/me',
}))

// ── API Routes ────────────────────────────────────────────────
app.use('/api/auth',      authRoutes)
app.use('/api/channels',  bigintJson, channelRoutes)
app.use('/api/videos',    bigintJson, require('./routes/videos'))
app.use('/api/pipeline',  bigintJson, pipelineRoutes)
app.use('/api/stories',   storyRoutes)
app.use('/api/analytics', bigintJson, analyticsRoutes)
app.use('/api/monitor',   monitor)
app.use('/api/settings',  require('./routes/settings'))
app.use('/api/profiles',  bigintJson, profiles)
app.use('/api/upload',    require('./routes/upload'))
app.use('/api/gallery',   bigintJson, require('./routes/gallery'))
app.use('/api/admin',            require('./routes/admin'))
app.use('/api/article-sources',  require('./routes/articleSources'))
app.use('/api/article-pipeline', require('./routes/articlePipeline'))
app.use('/api/vector-intelligence', bigintJson, require('./routes/vectorIntelligence'))

// ── Public thumbnails — no auth required (used by login page) ─────────────
app.get('/api/public/thumbnails', async (req, res) => {
  try {
    // Return thumbnails from "ours" channels with type info, ordered by most views
    const videos = await db.video.findMany({
      where: {
        thumbnailUrl: { not: null },
        channel: { type: 'ours' },
      },
      select: { thumbnailUrl: true, videoType: true },
      orderBy: { viewCount: 'desc' },
      take: 60,
    })
    let items = videos.map(v => ({ url: v.thumbnailUrl, isShort: v.videoType === 'short' })).filter(v => v.url)

    // Fallback: if no "ours" videos have thumbnails yet, return any channel's thumbnails
    if (items.length === 0) {
      const allVideos = await db.video.findMany({
        where: { thumbnailUrl: { not: null } },
        select: { thumbnailUrl: true, videoType: true },
        orderBy: { viewCount: 'desc' },
        take: 60,
      })
      items = allVideos.map(v => ({ url: v.thumbnailUrl, isShort: v.videoType === 'short' })).filter(v => v.url)
    }

    res.set('Cache-Control', 'public, max-age=60')
    res.json({ items })
  } catch (e) {
    res.json({ items: [] })
  }
})

// ── Health check (DB probe; optional Redis when queue enabled) ─
app.get('/health', async (req, res) => {
  try {
    await db.$queryRaw`SELECT 1`
  } catch (_) {
    return res.status(503).json({ ok: false, error: 'Database unavailable' })
  }
  if (config.REDIS_URL) {
    try {
      const { getQueue } = require('./queue/pipeline')
      const q = getQueue()
      if (q) {
        await q.client.ping()
      }
    } catch (_) {
      return res.status(503).json({ ok: false, error: 'Redis unavailable' })
    }
  }
  return res.json({ ok: true, ts: new Date() })
})



// ── Serve the frontend (Vite build from frontend/dist in prod, else public) ──
const frontendDist = path.join(__dirname, '../frontend/dist')
const useViteBuild = require('fs').existsSync(frontendDist)
const staticDir = useViteBuild ? frontendDist : path.join(__dirname, '../public')
const fallbackIndex = useViteBuild ? path.join(frontendDist, 'index.html') : path.join(__dirname, '../public/index.html')
logger.info({ useViteBuild, staticDir: staticDir.replace(process.cwd(), '.') }, 'Serving frontend from')
if (process.env.NODE_ENV === 'production' && !useViteBuild) {
  logger.warn('Production has no frontend/dist — SPA may show blank or wrong page. Run: npm run build')
}
app.use('/assets', express.static(path.join(staticDir, 'assets'), {
  index: false,
  maxAge: '1y',
  immutable: true,
}))
app.use(express.static(staticDir, { index: false }))
// SPA catch-all — serve index.html for non-API, non-asset GETs so /p/:id/stories etc. load
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path === '/health') return next()
  if (req.path.startsWith('/assets/') || req.path.startsWith('/favicon') || /\.(js|css|ico|png|svg|woff2?)$/i.test(req.path)) return next()
  res.set('Cache-Control', 'no-store')
  res.sendFile(fallbackIndex, (err) => {
    if (err) {
      logger.warn({ err: err.message, path: req.path }, 'SPA fallback sendFile failed')
      next(err)
    }
  })
})
// Explicit 404 for any request that didn't get a response (e.g. missing asset)
app.use((req, res) => { res.status(404).json({ error: 'Not found' }) })

// Central error handler — after all routes including static/catch-all
const { errorHandler } = require('./middleware/errors')
app.use(errorHandler)

// ── Seed API keys from env (e.g. ANTHROPIC_API_KEY on Railway) ──
async function seedApiKeys() {
  const raw = config.ANTHROPIC_API_KEY
  if (!raw) return
  const existing = await db.apiKey.findUnique({ where: { service: 'anthropic' } })
  if (!existing) {
    await db.apiKey.create({
      data: {
        service: 'anthropic',
        encryptedKey: encrypt(raw),
        isActive: true,
      },
    })
    logger.info('[seed] Anthropic API key seeded from env')
  }
}

// ── Startup migration: normalise legacy channel types ────────────────────────
async function migrateChannelTypes() {
  try {
    // Fix 'own' → 'ours' (legacy typo)
    const { count: ownCount } = await db.channel.updateMany({
      where: { type: 'own' },
      data: { type: 'ours' },
    })
    if (ownCount > 0) logger.info(`[migrate] Renamed ${ownCount} channel(s) type 'own' → 'ours'`)

    // Fix known stuck channels: any handle containing 'e3waisstories' that is wrongly set to competitor
    const { count: stuckCount } = await db.channel.updateMany({
      where: {
        handle: { contains: 'e3waisstories' },
        type: 'competitor',
      },
      data: { type: 'ours' },
    })
    if (stuckCount > 0) logger.info(`[migrate] Fixed ${stuckCount} stuck channel(s) → 'ours'`)
  } catch (e) {
    logger.warn('[migrate] Channel type migration failed:', e.message)
  }
}

// ── Startup migration: re-classify videos using YouTube Shorts URL check ─────
async function migrateVideoTypes() {
  try {
    const { isYouTubeShort } = require('./services/youtube')
    const BATCH_SIZE = 100
    let offset = 0
    let totalFixed = 0

    while (true) {
      const videos = await db.video.findMany({
        where: { videoType: 'video', duration: { not: null } },
        select: { id: true, youtubeId: true, duration: true },
        take: BATCH_SIZE,
        skip: offset,
        orderBy: { id: 'asc' },
      })
      if (videos.length === 0) break
      offset += videos.length

      const candidates = videos.filter(v => {
        const m = v.duration?.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
        if (!m) return false
        const secs = (parseInt(m[1] || 0) * 3600) + (parseInt(m[2] || 0) * 60) + parseInt(m[3] || 0)
        return secs <= 180
      })
      if (candidates.length === 0) continue

      logger.info(`[migrate] Checking batch of ${candidates.length} video(s) for Short classification...`)
      for (const v of candidates) {
        try {
          const short = await isYouTubeShort(v.youtubeId)
          if (short) {
            await db.video.update({ where: { id: v.id }, data: { videoType: 'short' } })
            totalFixed++
          }
        } catch (_) {}
      }

      if (videos.length < BATCH_SIZE) break
    }
    if (totalFixed > 0) logger.info(`[migrate] Re-classified ${totalFixed} video(s) as 'short' via YouTube URL check`)
  } catch (e) {
    logger.warn('[migrate] Video type migration failed:', e.message)
  }
}

// ── Start ─────────────────────────────────────────────────────
const http = require('http')

async function main() {
  await seedApiKeys()
  await migrateChannelTypes()
  migrateVideoTypes().catch(e => logger.warn('[migrate] videoTypes non-fatal:', e.message)) // run async, non-blocking

  const server = http.createServer(app)
  server.keepAliveTimeout = 65_000
  server.headersTimeout = 66_000

  process.on('uncaughtException', (err) => {
    logger.error(err, '[fatal] Uncaught exception — shutting down')
    gracefulShutdown(server, 1)
  })
  process.on('unhandledRejection', (reason) => {
    logger.error({ reason }, '[fatal] Unhandled rejection — shutting down')
    gracefulShutdown(server, 1)
  })

  const SHUTDOWN_TIMEOUT_MS = 15_000
  let shuttingDown = false
  function gracefulShutdown(srv, exitCode = 0) {
    if (shuttingDown) return
    shuttingDown = true
    logger.info('[shutdown] Closing HTTP server...')
    srv.close(() => {
      logger.info('[shutdown] HTTP server closed')
      const q = (() => { try { return require('./queue/pipeline').getQueue() } catch { return null } })()
      const closeQueue = q ? q.close() : Promise.resolve()
      closeQueue
        .then(() => db.$disconnect())
        .then(() => {
          logger.info('[shutdown] Cleanup complete')
          process.exit(exitCode)
        })
        .catch(() => process.exit(exitCode))
    })
    setTimeout(() => {
      logger.warn('[shutdown] Forced exit after timeout')
      process.exit(exitCode)
    }, SHUTDOWN_TIMEOUT_MS).unref()
  }

  process.on('SIGTERM', () => { logger.info('[shutdown] SIGTERM received'); gracefulShutdown(server, 0) })
  process.on('SIGINT', () => { logger.info('[shutdown] SIGINT received'); gracefulShutdown(server, 0) })

  server.listen(config.PORT, () => {
    logger.info({ port: config.PORT }, 'Falak running')

    // Auto-discover service descriptors for the service registry.
    try { require('./lib/serviceRegistry').autoDiscover() } catch (_) {}

    // Start the video pipeline worker in-process.
    // Railway runs a single service via `npm start` — there is no separate worker dyno.
    // Requiring here (not at top) avoids any circular-dep issues at module load time.
    try {
      const { getQueue } = require('./queue/pipeline')
      const { runPollingWorker, runQueueWorker } = require('./worker')
      if (getQueue()) {
        runQueueWorker().catch(e => logger.error(e, '[worker] queue worker fatal'))
      } else {
        runPollingWorker()
      }
    } catch (e) {
      logger.error(e, '[worker] failed to start — pipeline items will not be processed')
    }

    // Start the article pipeline worker in-process.
    try {
      const { runPollingWorker: runArticleWorker } = require('./worker-articles')
      runArticleWorker()
    } catch (e) {
      logger.error(e, '[article-worker] failed to start — articles will not be processed')
    }

    // Start the rescore worker in-process (refreshes stats + re-evaluates scores every 24h).
    try {
      const { runPollingWorker: runRescoreWorker } = require('./worker-rescore')
      runRescoreWorker()
    } catch (e) {
      logger.error(e, '[rescore-worker] failed to start — story scores will not auto-update')
    }
  })
}
main().catch(e => {
  logger.error(e, 'Startup failed')
  process.exit(1)
})
