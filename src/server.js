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
const authRoutes     = require('./routes/auth')
const channelRoutes  = require('./routes/channels')
const pipelineRoutes = require('./routes/pipeline')
const storyRoutes    = require('./routes/stories')
const analyticsRoutes = require('./routes/analytics')
const { monitor, admin, projects } = require('./routes/misc')

const app = express()

// ── Trust proxy (Railway, etc.) so redirects and X-Forwarded-* work ──
app.set('trust proxy', 1)

// ── Request id and structured logging ─────────────────────────
app.use(requestIdMiddleware)
app.use(pinoHttp({ logger, autoLogging: true }))

// ── Security & Middleware ─────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false })) // CSP off — single HTML app
app.use(compression())
app.use(cookieParser())
app.use(express.json())
app.use(cors({
  origin: config.APP_URL,
  credentials: true,
}))

// Rate limiting: global API 200/min; auth 30/15min
app.use('/api', rateLimit({ windowMs: 60 * 1000, max: 200, message: { error: { code: 'rate_limit', message: 'Too many requests' } } }))
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, max: 30 }))

// ── API Routes ────────────────────────────────────────────────
app.use('/api/auth',      authRoutes)
app.use('/api/channels',  channelRoutes)
app.use('/api/videos',     require('./routes/videos'))
app.use('/api/pipeline',  pipelineRoutes)
app.use('/api/stories',   storyRoutes)
app.use('/api/analytics', analyticsRoutes)
app.use('/api/monitor',   monitor)
app.use('/api/settings',  require('./routes/settings'))
app.use('/api/admin',     admin)
app.use('/api/projects',  projects)
app.use('/api/brain',     require('./routes/brain'))

// ── Public thumbnails — no auth required (used by login page) ─────────────
app.get('/api/public/thumbnails', async (req, res) => {
  try {
    // First try: videos from "ours"/"own" channels with thumbnails
    const videos = await db.video.findMany({
      where: {
        thumbnailUrl: { not: null },
        channel: { type: { in: ['ours', 'own'] } },
      },
      select: { thumbnailUrl: true },
      orderBy: { viewCount: 'desc' },
      take: 60,
    })
    let urls = videos.map(v => v.thumbnailUrl).filter(Boolean)

    // Fallback: if no "ours" videos have thumbnails yet, return any channel's thumbnails
    if (urls.length === 0) {
      const allVideos = await db.video.findMany({
        where: { thumbnailUrl: { not: null } },
        select: { thumbnailUrl: true },
        orderBy: { viewCount: 'desc' },
        take: 60,
      })
      urls = allVideos.map(v => v.thumbnailUrl).filter(Boolean)
    }

    res.set('Cache-Control', 'public, max-age=60')
    res.json({ urls })
  } catch (e) {
    res.json({ urls: [] })
  }
})

// ── Central error handler (must be after routes) ─────────────
const { errorHandler } = require('./middleware/errors')
app.use(errorHandler)

// ── Health check (DB probe; optional Redis when queue enabled) ─
app.get('/health', async (req, res) => {
  try {
    await db.$queryRaw`SELECT 1`
  } catch (_) {
    return res.status(503).json({ ok: false, error: 'Database unavailable' })
  }
  if (config.REDIS_URL) {
    try {
      const Redis = require('ioredis')
      const redis = new Redis(config.REDIS_URL)
      await redis.ping()
      redis.disconnect()
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
app.use(express.static(staticDir))
// SPA catch-all — must be last; serve index.html for all non-API routes
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(fallbackIndex)
  }
})

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

// ── One-time migration: normalise channel type 'own' → 'ours' ──────────────
async function migrateChannelTypes() {
  try {
    const { count } = await db.channel.updateMany({
      where: { type: 'own' },
      data: { type: 'ours' },
    })
    if (count > 0) logger.info(`[migrate] Renamed ${count} channel(s) type 'own' → 'ours'`)
  } catch (e) {
    logger.warn('[migrate] Channel type migration failed:', e.message)
  }
}

// ── Start ─────────────────────────────────────────────────────
async function main() {
  await seedApiKeys()
  await migrateChannelTypes()
  app.listen(config.PORT, () => {
    logger.info({ port: config.PORT }, 'Falak running')
    // Start the pipeline worker in-process.
    // Railway runs a single service via `npm start` — there is no separate worker dyno.
    // Requiring here (not at top) avoids any circular-dep issues at module load time.
    try {
      const { getQueue } = require('./queue/pipeline')
      const { runPollingWorker, runQueueWorker } = require('./worker')
      if (getQueue()) {
        runQueueWorker().catch(e => logger.error(e, '[worker] queue worker fatal'))
      } else {
        runPollingWorker()   // fire-and-forget: runs its own infinite async loop
      }
    } catch (e) {
      logger.error(e, '[worker] failed to start — pipeline items will not be processed')
    }
  })
}
main().catch(e => {
  logger.error(e, 'Startup failed')
  process.exit(1)
})
