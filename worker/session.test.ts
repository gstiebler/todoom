import { describe, it, expect } from 'vitest'
import {
  clearCookie,
  randomState,
  readCookie,
  seal,
  setCookie,
  unseal,
} from './session'

const SECRET = 'a-test-signing-secret'

describe('seal / unseal', () => {
  it('round-trips a refresh token', async () => {
    const sealed = await seal('1//refresh-token-value', SECRET)
    expect(await unseal(sealed, SECRET)).toBe('1//refresh-token-value')
  })

  it('never emits the plaintext', async () => {
    const sealed = await seal('1//refresh-token-value', SECRET)
    expect(sealed).not.toContain('refresh-token-value')
  })

  it('produces a different ciphertext each time', async () => {
    expect(await seal('same', SECRET)).not.toBe(await seal('same', SECRET))
  })

  it('is cookie-safe', async () => {
    const sealed = await seal('1//refresh-token-value', SECRET)
    expect(sealed).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('refuses a cookie sealed under another key', async () => {
    const sealed = await seal('secret', SECRET)
    expect(await unseal(sealed, 'a-different-secret')).toBeNull()
  })

  it('refuses a tampered cookie', async () => {
    const sealed = await seal('secret', SECRET)
    // Tamper in the middle, never the final character: base64's last symbol
    // can carry unused padding bits, so changing it may decode to the very
    // same bytes and prove nothing.
    const at = Math.floor(sealed.length / 2)
    const tampered =
      sealed.slice(0, at) + (sealed[at] === 'A' ? 'B' : 'A') + sealed.slice(at + 1)
    expect(tampered).not.toBe(sealed)
    expect(await unseal(tampered, SECRET)).toBeNull()
  })

  it('refuses garbage rather than throwing', async () => {
    expect(await unseal('not-a-cookie', SECRET)).toBeNull()
    expect(await unseal('', SECRET)).toBeNull()
  })
})

describe('readCookie', () => {
  it('finds a value among several', () => {
    expect(readCookie('a=1; todoom_session=xyz; b=2', 'todoom_session')).toBe('xyz')
  })

  it('does not match a name by suffix', () => {
    expect(readCookie('not_todoom_session=xyz', 'todoom_session')).toBeNull()
  })

  it('returns null with no header', () => {
    expect(readCookie(null, 'todoom_session')).toBeNull()
  })
})

describe('setCookie', () => {
  it('keeps the cookie out of scripts and off plain http', () => {
    const header = setCookie('todoom_session', 'xyz', { maxAge: 60 })
    expect(header).toContain('HttpOnly')
    expect(header).toContain('Secure')
    expect(header).toContain('SameSite=Lax')
    expect(header).toContain('Max-Age=60')
  })

  it('expires the cookie immediately when cleared', () => {
    expect(clearCookie('todoom_session')).toContain('Max-Age=0')
  })
})

describe('randomState', () => {
  it('differs each call and is url-safe', () => {
    expect(randomState()).not.toBe(randomState())
    expect(randomState()).toMatch(/^[A-Za-z0-9_-]+$/)
  })
})
