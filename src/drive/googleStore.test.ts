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

/** Answers each call with the next body, so a two-step operation can be asserted. */
function driveBodies(...bodies: unknown[]): ReturnType<typeof vi.fn> {
  let call = 0
  const spy = vi.fn(async () => {
    const body = bodies[Math.min(call, bodies.length - 1)] ?? {}
    call += 1
    return new Response(JSON.stringify(body), { status: 200 })
  })
  vi.stubGlobal('fetch', spy)
  return spy
}

function urlOf(spy: ReturnType<typeof vi.fn>, call: number): string {
  return String(spy.mock.calls[call]?.[0])
}

function bodyOf(spy: ReturnType<typeof vi.fn>, call: number): Record<string, unknown> {
  const init = spy.mock.calls[call]?.[1] as RequestInit | undefined
  return JSON.parse(String(init?.body)) as Record<string, unknown>
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

describe('GoogleDriveStore folders', () => {
  it('creates the folder at the root with the Drive folder mime type', async () => {
    const drive = driveBodies({ files: [] }, { id: 'fol', name: 'Todoom' })
    const store = new GoogleDriveStore(tokenSource('tok'))

    expect(await store.findOrCreateFolder('Todoom')).toEqual({ id: 'fol', name: 'Todoom' })
    expect(bodyOf(drive, 1)).toEqual({
      name: 'Todoom',
      mimeType: 'application/vnd.google-apps.folder',
      parents: ['root'],
    })
  })

  it('reuses a folder that is already there', async () => {
    const drive = driveBodies({ files: [{ id: 'fol', name: 'Todoom' }] })
    const store = new GoogleDriveStore(tokenSource('tok'))

    expect(await store.findOrCreateFolder('Todoom')).toEqual({ id: 'fol', name: 'Todoom' })
    expect(drive).toHaveBeenCalledTimes(1)
  })

  it('looks for a folder by mime type, so a file of the same name is not mistaken for one', async () => {
    const drive = driveBodies({ files: [{ id: 'fol', name: 'Todoom' }] })
    const store = new GoogleDriveStore(tokenSource('tok'))

    await store.findOrCreateFolder('Todoom')
    expect(decodeURIComponent(urlOf(drive, 0))).toContain(
      "mimeType = 'application/vnd.google-apps.folder'",
    )
  })

  it('scopes a file lookup to its parent folder', async () => {
    const drive = driveBodies({ files: [] }, { id: 'f', name: 'todo.txt' })
    const store = new GoogleDriveStore(tokenSource('tok'))

    await store.findOrCreateFileIn({ id: 'fol', name: 'Todoom' }, 'todo.txt')
    expect(decodeURIComponent(urlOf(drive, 0))).toContain("'fol' in parents")
    expect(bodyOf(drive, 1)['parents']).toEqual(['fol'])
  })
})

describe('GoogleDriveStore attachments', () => {
  const folder = { id: 'fol', name: 'Todoom' }
  const file = () => new File(['hello'], 'notes.txt', { type: 'text/plain' })

  it('uploads in two steps: the metadata, then the bytes', async () => {
    const drive = driveBodies({ id: 'up', name: 'notes.txt', webViewLink: 'https://drive/up' })
    const store = new GoogleDriveStore(tokenSource('tok'))

    await store.uploadFile(folder, file())

    expect(urlOf(drive, 0)).toContain('/drive/v3/files?')
    expect(bodyOf(drive, 0)).toEqual({
      name: 'notes.txt',
      mimeType: 'text/plain',
      parents: ['fol'],
    })
    expect(urlOf(drive, 1)).toContain('/upload/drive/v3/files/up?uploadType=media')
  })

  it('returns the id, name and Drive link of the upload', async () => {
    driveBodies({
      id: 'up',
      name: 'notes.txt',
      webViewLink: 'https://drive/up',
      mimeType: 'text/plain',
    })
    const store = new GoogleDriveStore(tokenSource('tok'))

    expect(await store.uploadFile(folder, file())).toEqual({
      id: 'up',
      name: 'notes.txt',
      webViewLink: 'https://drive/up',
      mimeType: 'text/plain',
    })
  })

  it('falls back to a generic mime type for a file the browser cannot name', async () => {
    const drive = driveBodies({ id: 'up', name: 'blob', webViewLink: 'https://drive/up' })
    const store = new GoogleDriveStore(tokenSource('tok'))

    await store.uploadFile(folder, new File(['x'], 'blob', { type: '' }))
    expect(bodyOf(drive, 0)['mimeType']).toBe('application/octet-stream')
  })

  it('lists what is in the folder', async () => {
    const drive = driveBodies({
      files: [{ id: 'a', name: 'one.txt', webViewLink: 'https://drive/a', mimeType: 'image/png' }],
    })
    const store = new GoogleDriveStore(tokenSource('tok'))

    expect(await store.listFiles(folder)).toEqual([
      { id: 'a', name: 'one.txt', webViewLink: 'https://drive/a', mimeType: 'image/png' },
    ])
    expect(decodeURIComponent(urlOf(drive, 0))).toContain("'fol' in parents")
  })

  it('asks Drive for the mime type', async () => {
    const drive = driveBodies({ files: [] })
    const store = new GoogleDriveStore(tokenSource('tok'))
    await store.listFiles(folder)
    expect(urlOf(drive, 0)).toContain('mimeType')
  })

  it('falls back to an empty mime type when Drive omits it', async () => {
    driveBodies({ files: [{ id: 'a', name: 'one.txt', webViewLink: 'https://drive/a' }] })
    const store = new GoogleDriveStore(tokenSource('tok'))
    expect((await store.listFiles(folder))[0]?.mimeType).toBe('')
  })

  it('trashes rather than deletes, so a mistake is recoverable', async () => {
    const drive = driveBodies({})
    const store = new GoogleDriveStore(tokenSource('tok'))

    await store.trashFile('up')
    expect(urlOf(drive, 0)).toContain('/drive/v3/files/up')
    expect(bodyOf(drive, 0)).toEqual({ trashed: true })
  })
})
