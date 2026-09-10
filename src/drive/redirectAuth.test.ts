import { describe, it, expect } from 'vitest'
import { buildAuthUrl, parseAuthFragment, randomState } from './redirectAuth'

const BASE = {
  clientId: 'client-123',
  redirectUri: 'https://gstiebler.github.io/todoom/',
  scope: 'https://www.googleapis.com/auth/drive.file',
  state: 'abc',
}

describe('buildAuthUrl', () => {
  it('asks for a token with no UI in silent mode', () => {
    const url = new URL(buildAuthUrl({ ...BASE, mode: 'none' }))
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    expect(url.searchParams.get('prompt')).toBe('none')
    expect(url.searchParams.get('response_type')).toBe('token')
    expect(url.searchParams.get('client_id')).toBe('client-123')
    expect(url.searchParams.get('redirect_uri')).toBe(BASE.redirectUri)
    expect(url.searchParams.get('state')).toBe('abc')
  })

  it('omits prompt in interactive mode so Google may ask', () => {
    const url = new URL(buildAuthUrl({ ...BASE, mode: 'interactive' }))
    expect(url.searchParams.get('prompt')).toBeNull()
  })

  it('requests only the drive.file scope', () => {
    const url = new URL(buildAuthUrl({ ...BASE, mode: 'none' }))
    expect(url.searchParams.get('scope')).toBe('https://www.googleapis.com/auth/drive.file')
  })
})

describe('parseAuthFragment', () => {
  it('reads a token response', () => {
    const out = parseAuthFragment('#access_token=ya29.tok&expires_in=3599&state=abc')
    expect(out).toEqual({ kind: 'token', accessToken: 'ya29.tok', expiresIn: 3599, state: 'abc' })
  })

  it('reads an error response', () => {
    const out = parseAuthFragment('#error=interaction_required&state=abc')
    expect(out).toEqual({ kind: 'error', error: 'interaction_required', state: 'abc' })
  })

  it('reports nothing for an unrelated fragment', () => {
    expect(parseAuthFragment('#section-two')).toEqual({ kind: 'none' })
    expect(parseAuthFragment('')).toEqual({ kind: 'none' })
  })

  it('treats a missing expires_in as already stale', () => {
    const out = parseAuthFragment('#access_token=ya29.tok&state=abc')
    expect(out).toMatchObject({ kind: 'token', expiresIn: 0 })
  })

  it('treats a malformed expires_in as already stale', () => {
    const out = parseAuthFragment('#access_token=ya29.tok&expires_in=soon&state=abc')
    expect(out).toMatchObject({ kind: 'token', expiresIn: 0 })
  })

  it('does not mistake an error for a token', () => {
    const out = parseAuthFragment('#error=access_denied&access_token=ya29.tok&state=abc')
    expect(out.kind).toBe('error')
  })
})

describe('randomState', () => {
  it('produces a distinct value each call', () => {
    expect(randomState()).not.toBe(randomState())
  })

  it('produces a 32-character hex string', () => {
    expect(randomState()).toMatch(/^[0-9a-f]{32}$/)
  })
})
