import { describe, it, expect, vi, afterEach } from 'vitest'
import { GoogleDriveStore } from './googleStore'
import { SignedOutError, type TokenSource } from './tokens'

function tokenSource(...tokens: string[]): TokenSource & { calls: number } {
  return {
    calls: 0,
    async fetch() {
      const token = tokens[this.calls] ?? tokens[tokens.length - 1] ?? 'tok'
      this.calls += 1
      return { accessToken: token, expiresIn: 3600 }
    },
  }
}

function driveReturns(...statuses: number[]): ReturnType<typeof vi.fn> {
  let call = 0
  const spy = vi.fn(async () => {
    const status = statuses[Math.min(call, statuses.length - 1)] ?? 200
    call += 1
    return new Response(JSON.stringify({ modifiedTime: '2026-09-10T00:00:00Z' }), { status })
  })
  vi.stubGlobal('fetch', spy)
  return spy
}

function bearerOf(spy: ReturnType<typeof vi.fn>, call: number): string | null {
  const init = spy.mock.calls[call]?.[1] as RequestInit | undefined
  return new Headers(init?.headers).get('Authorization')
}

afterEach(() => vi.unstubAllGlobals())

describe('GoogleDriveStore authorization', () => {
  it('fetches a token once and reuses it across requests', async () => {
    const tokens = tokenSource('tok-1')
    const drive = driveReturns(200)
    const store = new GoogleDriveStore(tokens)

    await store.getModifiedTime({ id: 'f', name: 'todo.txt' })
    await store.getModifiedTime({ id: 'f', name: 'todo.txt' })

    expect(tokens.calls).toBe(1)
    expect(bearerOf(drive, 1)).toBe('Bearer tok-1')
  })

  it('renews once and retries when Drive rejects the token', async () => {
    const tokens = tokenSource('stale', 'fresh')
    const drive = driveReturns(401, 200)
    const store = new GoogleDriveStore(tokens)

    await store.getModifiedTime({ id: 'f', name: 'todo.txt' })

    expect(tokens.calls).toBe(2)
    expect(bearerOf(drive, 0)).toBe('Bearer stale')
    expect(bearerOf(drive, 1)).toBe('Bearer fresh')
  })

  it('reports a signed-out session when even a fresh token is rejected', async () => {
    const tokens = tokenSource('tok')
    driveReturns(401, 401)
    const store = new GoogleDriveStore(tokens)

    await expect(store.getModifiedTime({ id: 'f', name: 'todo.txt' })).rejects.toBeInstanceOf(
      SignedOutError,
    )
  })

  it('does not retry a 403, which is a permission answer and not a stale token', async () => {
    const tokens = tokenSource('tok')
    const drive = driveReturns(403)
    const store = new GoogleDriveStore(tokens)

    await expect(store.getModifiedTime({ id: 'f', name: 'todo.txt' })).rejects.toBeInstanceOf(
      SignedOutError,
    )
    expect(drive).toHaveBeenCalledTimes(1)
  })

  it('surfaces other Drive failures untouched', async () => {
    driveReturns(500)
    const store = new GoogleDriveStore(tokenSource('tok'))
    await expect(store.getModifiedTime({ id: 'f', name: 'todo.txt' })).rejects.toThrow(/500/)
  })

  it('is signed out until a token has actually been issued', async () => {
    const store = new GoogleDriveStore(tokenSource('tok'))
    expect(store.isSignedIn()).toBe(false)
    driveReturns(200)
    await store.signIn()
    expect(store.isSignedIn()).toBe(true)
  })
})
