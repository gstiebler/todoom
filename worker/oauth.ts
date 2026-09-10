// Google's authorization code flow, which is available to the Worker and not
// to the browser: it requires a client secret, and a secret shipped to a page
// is not a secret. In exchange Google issues a refresh token, which is what
// lets a session outlive the one-hour access token.

const CONSENT_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
const REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke'

export const SCOPE = 'https://www.googleapis.com/auth/drive.file'

export function buildConsentUrl(options: {
  clientId: string
  redirectUri: string
  state: string
}): string {
  const params = new URLSearchParams({
    client_id: options.clientId,
    redirect_uri: options.redirectUri,
    response_type: 'code',
    scope: SCOPE,
    state: options.state,
    // Without offline access Google returns no refresh token at all, and
    // without a forced consent it returns one only on a user's very first
    // authorization — so a user who reconnects later would silently get a
    // session that dies in an hour.
    access_type: 'offline',
    prompt: 'consent',
  })
  return `${CONSENT_ENDPOINT}?${params.toString()}`
}

export interface Credentials {
  accessToken: string
  expiresIn: number
  refreshToken: string
}

interface TokenResponse {
  access_token?: string
  expires_in?: number
  refresh_token?: string
  error?: string
  error_description?: string
}

async function postToken(body: Record<string, string>): Promise<TokenResponse> {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  })
  const payload = (await response.json()) as TokenResponse
  if (!response.ok || payload.error) {
    throw new Error(payload.error_description ?? payload.error ?? `token endpoint ${response.status}`)
  }
  return payload
}

export async function exchangeCode(options: {
  clientId: string
  clientSecret: string
  redirectUri: string
  code: string
}): Promise<Credentials> {
  const payload = await postToken({
    client_id: options.clientId,
    client_secret: options.clientSecret,
    redirect_uri: options.redirectUri,
    grant_type: 'authorization_code',
    code: options.code,
  })
  if (!payload.access_token || !payload.refresh_token) {
    throw new Error('Google returned no refresh token')
  }
  return {
    accessToken: payload.access_token,
    expiresIn: payload.expires_in ?? 0,
    refreshToken: payload.refresh_token,
  }
}

export async function refreshAccess(options: {
  clientId: string
  clientSecret: string
  refreshToken: string
}): Promise<{ accessToken: string; expiresIn: number }> {
  const payload = await postToken({
    client_id: options.clientId,
    client_secret: options.clientSecret,
    grant_type: 'refresh_token',
    refresh_token: options.refreshToken,
  })
  if (!payload.access_token) throw new Error('Google returned no access token')
  return { accessToken: payload.access_token, expiresIn: payload.expires_in ?? 0 }
}

export async function revoke(token: string): Promise<void> {
  await fetch(REVOKE_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token }).toString(),
  })
}
