const express = require('express')
const { OAuth2Client } = require('google-auth-library')
const jwt = require('jsonwebtoken')
const nodeFetch = require('node-fetch')
const config = require('../config')
const db  = require('../lib/db')
const { requireAuth } = require('../middleware/auth')

// Use node-fetch for guaranteed compatibility
const fetchFn = nodeFetch.default || nodeFetch

const router = express.Router()
const client = new OAuth2Client(config.GOOGLE_CLIENT_ID)

// Base URL with no trailing slash (required for Google redirect_uri)
function getAppBaseUrl() {
  return config.APP_URL
}

// Sanitize returnTo: must be a path (starts with /, no protocol or //)
function sanitizeReturnTo(returnTo) {
  if (!returnTo || typeof returnTo !== 'string') return ''
  const s = returnTo.trim().replace(/^\/+/, '/')
  if (!s.startsWith('/') || s.includes('//') || s.includes(':')) return ''
  return s
}

// ── GET /api/auth/google/url
// Returns the Google OAuth URL. Query: returnTo (path to redirect after login).
router.get('/google/url', (req, res) => {
  const baseUrl = getAppBaseUrl()
  const returnTo = sanitizeReturnTo(req.query.returnTo)
  const params = new URLSearchParams({
    client_id:     config.GOOGLE_CLIENT_ID,
    redirect_uri:  `${baseUrl}/api/auth/google/callback`,
    response_type: 'code',
    scope:         'openid email profile',
    access_type:   'offline',
    prompt:        'select_account',
    ...(returnTo && { state: returnTo }),
  })
  res.json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` })
})

// ── GET /api/auth/google/callback
// Google redirects here after login — we create/find user, issue JWT
router.get('/google/callback', async (req, res) => {
  const baseUrl = getAppBaseUrl()
  const redirectUri = `${baseUrl}/api/auth/google/callback`

  // Prevent caching of this response (some proxies/CDNs can strip Set-Cookie)
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private')
  res.set('Pragma', 'no-cache')

  try {
    const { code, state } = req.query
    if (!code) return res.redirect(`${baseUrl}/?error=no_code`)
    const returnTo = sanitizeReturnTo(state)

    // Exchange code for tokens
    const tokenRes = await fetchFn('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id:     config.GOOGLE_CLIENT_ID,
        client_secret: config.GOOGLE_CLIENT_SECRET,
        redirect_uri:  redirectUri,
        grant_type:    'authorization_code',
      }),
    })
    const tokens = await tokenRes.json()

    if (tokens.error) {
      console.error('Google token exchange error:', tokens.error, tokens.error_description)
      return res.redirect(`${baseUrl}/?error=oauth_failed&hint=${encodeURIComponent(tokens.error_description || tokens.error)}`)
    }
    if (!tokens.id_token) {
      console.error('Google token response missing id_token:', Object.keys(tokens))
      return res.redirect(`${baseUrl}/?error=oauth_failed`)
    }

    // Verify ID token
    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: config.GOOGLE_CLIENT_ID,
    })
    const { sub: googleId, email, name, picture } = ticket.getPayload()

    // Check if user is allowed
    const existing = await db.user.findFirst({
      where: { OR: [{ googleId }, { email }] }
    })

    // Owner email always gets in as admin
    const isOwner = config.OWNER_EMAIL ? email === config.OWNER_EMAIL : false

    if (!existing && !isOwner) {
      return res.redirect(`${baseUrl}/?error=access_denied`)
    }

    let user
    if (isOwner && !existing) {
      user = await db.user.create({
        data: { email, name, avatarUrl: picture, googleId, role: 'owner', isActive: true }
      })
    } else {
      user = await db.user.update({
        where: { id: existing.id },
        data: { googleId, name, avatarUrl: picture, updatedAt: new Date() }
      })
    }

    if (!user.isActive) return res.redirect(`${baseUrl}/?error=disabled`)

    // Create session (30-day expiry)
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    const token = jwt.sign({ userId: user.id }, config.JWT_SECRET, { expiresIn: '30d' })

    await db.session.create({ data: { userId: user.id, token, expiresAt } })

    // Set cookie + redirect to app
    // secure: true when APP_URL is https or when request came over HTTPS (e.g. Railway proxy)
    const isHttps = baseUrl.toLowerCase().startsWith('https') || req.get('x-forwarded-proto') === 'https'
    const cookieOpts = {
      httpOnly: true,
      secure: isHttps,
      sameSite: 'lax',
      path: '/',
      expires: expiresAt,
    }
    res.cookie('token', token, cookieOpts)
    res.redirect(returnTo ? baseUrl + returnTo : baseUrl + '/')
  } catch (e) {
    console.error('OAuth error:', e.message, e.stack)
    res.redirect(`${baseUrl}/?error=oauth_failed`)
  }
})

// ── POST /api/auth/logout
// No requireAuth: always clear the cookie so the client is logged out even if token is missing or invalid
router.post('/logout', async (req, res) => {
  const token = req.cookies?.token
  if (token) await db.session.deleteMany({ where: { token } }).catch(() => {})
  const baseUrl = getAppBaseUrl()
  const isHttps = baseUrl.toLowerCase().startsWith('https') || req.get('x-forwarded-proto') === 'https'
  res.clearCookie('token', { httpOnly: true, secure: isHttps, sameSite: 'lax', path: '/' })
  res.json({ ok: true })
})

// ── GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  const { id, email, name, avatarUrl, role, pageAccess, channelAccess, canCreateProfile } = req.user
  res.json({ id, email, name, avatarUrl, role, pageAccess, channelAccess, canCreateProfile })
})

module.exports = router
