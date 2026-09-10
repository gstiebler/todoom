import { describe, it, expect } from 'vitest'
import { buildConsentUrl, SCOPE } from './oauth'

describe('buildConsentUrl', () => {
  const url = new URL(
    buildConsentUrl({
      clientId: 'client-123',
      redirectUri: 'https://todoom.example.workers.dev/auth/callback',
      state: 'nonce',
    }),
  )

  it('asks for a code, not a token', () => {
    expect(url.searchParams.get('response_type')).toBe('code')
  })

  it('asks for offline access so Google issues a refresh token', () => {
    expect(url.searchParams.get('access_type')).toBe('offline')
  })

  it('forces consent so a returning user also gets a refresh token', () => {
    expect(url.searchParams.get('prompt')).toBe('consent')
  })

  it('requests only the drive.file scope', () => {
    expect(url.searchParams.get('scope')).toBe(SCOPE)
    expect(SCOPE).toBe('https://www.googleapis.com/auth/drive.file')
  })

  it('carries the state nonce and redirect uri', () => {
    expect(url.searchParams.get('state')).toBe('nonce')
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://todoom.example.workers.dev/auth/callback',
    )
  })
})
