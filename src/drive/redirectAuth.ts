// OAuth 2.0 implicit flow driven by a top-level redirect rather than the
// Google Identity Services popup.
//
// A popup is opened by script, so the browser blocks it unless a click is in
// scope — which makes automatic sign-in impossible on page load. A top-level
// navigation is a first-party context, so it carries the user's Google session
// cookie: with `prompt=none` Google recognises an existing grant and redirects
// straight back, with no UI at all.
//
// The token arrives in the URL fragment. A fragment is never sent to a server —
// it appears in no request, log or Referer header — and `takeAuthResponse`
// strips it from the address bar before anything else runs. See spec §5.1.

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'

export interface AuthRequest {
  clientId: string
  redirectUri: string
  scope: string
  state: string
  /** `none` never shows UI and fails instead; `interactive` may prompt. */
  mode: 'none' | 'interactive'
}

export function buildAuthUrl(request: AuthRequest): string {
  const params = new URLSearchParams({
    client_id: request.clientId,
    redirect_uri: request.redirectUri,
    response_type: 'token',
    scope: request.scope,
    state: request.state,
    include_granted_scopes: 'true',
  })
  if (request.mode === 'none') params.set('prompt', 'none')
  return `${AUTH_ENDPOINT}?${params.toString()}`
}

export type AuthResponse =
  | { kind: 'token'; accessToken: string; expiresIn: number; state: string }
  | { kind: 'error'; error: string; state: string }
  | { kind: 'none' }

export function parseAuthFragment(hash: string): AuthResponse {
  const params = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash)
  const state = params.get('state') ?? ''

  const error = params.get('error')
  if (error) return { kind: 'error', error, state }

  const accessToken = params.get('access_token')
  if (!accessToken) return { kind: 'none' }

  // A missing or malformed expires_in is treated as an immediately stale token
  // rather than an unbounded one.
  const expiresIn = Number(params.get('expires_in'))
  return {
    kind: 'token',
    accessToken,
    expiresIn: Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 0,
    state,
  }
}

export function randomState(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}
