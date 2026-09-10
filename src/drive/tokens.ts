// The browser's half of the backend-for-frontend: it never sees a refresh
// token, a client secret, or a Google redirect. It asks its own origin for an
// access token and gets one as long as the session cookie is good.

export interface AccessToken {
  accessToken: string
  expiresIn: number
}

/** Thrown when the session is gone and only a fresh sign-in will fix it. */
export class SignedOutError extends Error {
  constructor() {
    super('signed out')
    this.name = 'SignedOutError'
  }
}

export interface TokenSource {
  fetch(): Promise<AccessToken>
}

export const backendTokens: TokenSource = {
  async fetch(): Promise<AccessToken> {
    const response = await fetch('/api/token', {
      // The cookie is HttpOnly and same-origin; this asks the browser to send
      // it even though the request comes from script.
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    })
    if (response.status === 401) throw new SignedOutError()
    if (!response.ok) throw new Error(`Could not reach the sign-in service (${response.status})`)
    const payload = (await response.json()) as Partial<AccessToken>
    if (!payload.accessToken) throw new Error('The sign-in service returned no token')
    return {
      accessToken: payload.accessToken,
      expiresIn: typeof payload.expiresIn === 'number' ? payload.expiresIn : 0,
    }
  },
}
