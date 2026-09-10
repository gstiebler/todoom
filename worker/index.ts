// Todoom's backend-for-frontend.
//
// It serves the static app and four auth routes from ONE origin. That is not
// a convenience: a session cookie set by another origin is a third-party
// cookie, which Safari's ITP and Edge's tracking prevention block outright.
// Same-origin makes it first-party and untouchable. See spec §5.1.

import { buildConsentUrl, exchangeCode, refreshAccess, revoke } from './oauth'
import {
  clearCookie,
  randomState,
  readCookie,
  seal,
  setCookie,
  unseal,
} from './session'

export interface Env {
  GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET: string
  SESSION_SECRET: string
  ASSETS: { fetch(request: Request): Promise<Response> }
}

const SESSION_COOKIE = 'todoom_session'
const STATE_COOKIE = 'todoom_oauth_state'
const SESSION_MAX_AGE = 60 * 60 * 24 * 365
const STATE_MAX_AGE = 60 * 10

function redirectUri(url: URL): string {
  return new URL('/auth/callback', url.origin).href
}

function redirect(location: string, cookies: string[] = []): Response {
  const headers = new Headers({ Location: location })
  for (const cookie of cookies) headers.append('Set-Cookie', cookie)
  return new Response(null, { status: 302, headers })
}

function json(body: unknown, status: number, cookies: string[] = []): Response {
  const headers = new Headers({
    'Content-Type': 'application/json',
    // The token is per-user and short-lived; no cache may ever hold it.
    'Cache-Control': 'no-store',
  })
  for (const cookie of cookies) headers.append('Set-Cookie', cookie)
  return new Response(JSON.stringify(body), { status, headers })
}

async function startSignIn(url: URL, env: Env): Promise<Response> {
  const state = randomState()
  return redirect(buildConsentUrl({
    clientId: env.GOOGLE_CLIENT_ID,
    redirectUri: redirectUri(url),
    state,
  }), [setCookie(STATE_COOKIE, state, { maxAge: STATE_MAX_AGE })])
}

async function completeSignIn(request: Request, url: URL, env: Env): Promise<Response> {
  const expected = readCookie(request.headers.get('Cookie'), STATE_COOKIE)
  const state = url.searchParams.get('state')
  const code = url.searchParams.get('code')

  // A callback this browser did not initiate is refused before the code is
  // ever presented to Google.
  if (!expected || !state || state !== expected) {
    return redirect('/?error=state', [clearCookie(STATE_COOKIE)])
  }
  if (!code) {
    const reason = url.searchParams.get('error') ?? 'no_code'
    return redirect(`/?error=${encodeURIComponent(reason)}`, [clearCookie(STATE_COOKIE)])
  }

  // Google rejects an exchange for reasons the user can act on — a redirect URI
  // that is not registered, a withdrawn grant, a rotated secret. Letting that
  // throw gives them the platform's 500 page and no idea what went wrong, so
  // the reason is carried back to the app instead. The Worker's log still has
  // the full error.
  let credentials
  try {
    credentials = await exchangeCode({
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      redirectUri: redirectUri(url),
      code,
    })
  } catch (cause) {
    console.error('code exchange failed', cause)
    const reason = cause instanceof Error ? cause.message : 'exchange_failed'
    return redirect(`/?error=${encodeURIComponent(reason)}`, [clearCookie(STATE_COOKIE)])
  }

  const sealed = await seal(credentials.refreshToken, env.SESSION_SECRET)
  return redirect('/', [
    clearCookie(STATE_COOKIE),
    setCookie(SESSION_COOKIE, sealed, { maxAge: SESSION_MAX_AGE }),
  ])
}

async function issueToken(request: Request, env: Env): Promise<Response> {
  const sealed = readCookie(request.headers.get('Cookie'), SESSION_COOKIE)
  if (!sealed) return json({ error: 'signed_out' }, 401)

  const refreshToken = await unseal(sealed, env.SESSION_SECRET)
  if (!refreshToken) return json({ error: 'signed_out' }, 401, [clearCookie(SESSION_COOKIE)])

  try {
    const { accessToken, expiresIn } = await refreshAccess({
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      refreshToken,
    })
    return json({ accessToken, expiresIn }, 200)
  } catch {
    // The refresh token was revoked, expired, or the grant was withdrawn from
    // the Google account page. The cookie is now worthless, so drop it and let
    // the app offer a fresh connect rather than retrying forever.
    return json({ error: 'signed_out' }, 401, [clearCookie(SESSION_COOKIE)])
  }
}

async function signOut(request: Request, env: Env): Promise<Response> {
  const sealed = readCookie(request.headers.get('Cookie'), SESSION_COOKIE)
  if (sealed) {
    const refreshToken = await unseal(sealed, env.SESSION_SECRET)
    // Best effort: the cookie is cleared either way, and an un-revoked token
    // the browser can no longer reach is not reachable by anyone else.
    if (refreshToken) await revoke(refreshToken).catch(() => {})
  }
  return json({ ok: true }, 200, [clearCookie(SESSION_COOKIE)])
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === '/auth/start') return startSignIn(url, env)
    if (url.pathname === '/auth/callback') return completeSignIn(request, url, env)
    if (url.pathname === '/api/token') return issueToken(request, env)
    if (url.pathname === '/auth/logout') {
      if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
      return signOut(request, env)
    }

    return env.ASSETS.fetch(request)
  },
}
