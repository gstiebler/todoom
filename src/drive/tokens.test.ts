import { describe, it, expect, vi, afterEach } from 'vitest'
import { backendTokens, SignedOutError } from './tokens'

function respond(status: number, body: unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(body), { status })),
  )
}

afterEach(() => vi.unstubAllGlobals())

describe('backendTokens', () => {
  it('returns the token the backend issued', async () => {
    respond(200, { accessToken: 'ya29.tok', expiresIn: 3599 })
    expect(await backendTokens.fetch()).toEqual({ accessToken: 'ya29.tok', expiresIn: 3599 })
  })

  it('reports a signed-out session distinctly', async () => {
    respond(401, { error: 'signed_out' })
    await expect(backendTokens.fetch()).rejects.toBeInstanceOf(SignedOutError)
  })

  it('does not mistake an outage for a sign-out', async () => {
    respond(500, { error: 'boom' })
    await expect(backendTokens.fetch()).rejects.not.toBeInstanceOf(SignedOutError)
  })

  it('rejects a response with no token', async () => {
    respond(200, { expiresIn: 3599 })
    await expect(backendTokens.fetch()).rejects.toThrow(/no token/)
  })

  it('treats a missing expiry as immediately stale', async () => {
    respond(200, { accessToken: 'ya29.tok' })
    expect((await backendTokens.fetch()).expiresIn).toBe(0)
  })

  it('sends the session cookie', async () => {
    respond(200, { accessToken: 'ya29.tok', expiresIn: 3599 })
    await backendTokens.fetch()
    expect(vi.mocked(fetch).mock.calls[0]?.[1]).toMatchObject({ credentials: 'same-origin' })
  })
})
