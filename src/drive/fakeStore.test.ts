import { describe, it, expect } from 'vitest'
import { FakeStore } from './fakeStore'

async function newFile(s: FakeStore, name: string) {
  return s.findOrCreateFileIn(await s.findOrCreateFolder('Todoom'), name)
}

describe('FakeStore', () => {
  it('starts signed out', () => {
    expect(new FakeStore().isSignedIn()).toBe(false)
  })

  it('signs in and out', async () => {
    const s = new FakeStore()
    await s.signIn()
    expect(s.isSignedIn()).toBe(true)
    s.signOut()
    expect(s.isSignedIn()).toBe(false)
  })

  it('creates a file that reads back empty', async () => {
    const s = new FakeStore()
    await s.signIn()
    const ref = await newFile(s, 'todo.txt')
    expect(ref.name).toBe('todo.txt')
    expect((await s.read(ref)).text).toBe('')
  })

  it('returns the same file on repeat find-or-create calls', async () => {
    const s = new FakeStore()
    await s.signIn()
    const first = await newFile(s, 'todo.txt')
    const second = await newFile(s, 'todo.txt')
    expect(second).toEqual(first)
  })

  it('writes and reads back', async () => {
    const s = new FakeStore()
    await s.signIn()
    const ref = await newFile(s, 'todo.txt')
    await s.write(ref, 'Buy milk\n')
    expect((await s.read(ref)).text).toBe('Buy milk\n')
  })

  it('advances modifiedTime on each write', async () => {
    const s = new FakeStore()
    await s.signIn()
    const ref = await newFile(s, 'todo.txt')
    const first = (await s.write(ref, 'a\n')).modifiedTime
    const second = (await s.write(ref, 'b\n')).modifiedTime
    expect(second).not.toBe(first)
    expect(await s.getModifiedTime(ref)).toBe(second)
  })

  it('returns the same folder on repeat calls', async () => {
    const s = new FakeStore()
    await s.signIn()
    const a = await s.findOrCreateFolder('Todoom')
    const b = await s.findOrCreateFolder('Todoom')
    expect(a.id).toBe(b.id)
  })

  it('rejects reads when signed out', async () => {
    const s = new FakeStore()
    await s.signIn()
    const ref = await newFile(s, 'todo.txt')
    s.signOut()
    await expect(s.read(ref)).rejects.toThrow('not signed in')
  })

  it('rejects reads of an unknown file', async () => {
    const s = new FakeStore()
    await s.signIn()
    await expect(s.read({ id: 'nope', name: 'x' })).rejects.toThrow('file not found')
  })

  it('can be seeded with file contents', async () => {
    const s = new FakeStore({ 'todo.txt': 'Buy milk\n' })
    await s.signIn()
    const ref = s.refFor('todo.txt')
    expect((await s.read(ref)).text).toBe('Buy milk\n')
  })
})

describe('FakeStore folders and attachments', () => {
  async function signedIn(): Promise<FakeStore> {
    const store = new FakeStore()
    await store.signIn()
    return store
  }

  it('creates a folder once and reuses it', async () => {
    const store = await signedIn()
    const first = await store.findOrCreateFolder('Todoom')
    expect(await store.findOrCreateFolder('Todoom')).toEqual(first)
  })

  it('keeps files with the same name apart when they are in different folders', async () => {
    const store = await signedIn()
    const a = await store.findOrCreateFolder('Todoom')
    const b = await store.findOrCreateFolder('Other')
    const inA = await store.findOrCreateFileIn(a, 'todo.txt')
    const inB = await store.findOrCreateFileIn(b, 'todo.txt')
    expect(inA.id).not.toBe(inB.id)
  })

  it('lists only what is inside the folder', async () => {
    const store = await signedIn()
    const folder = await store.findOrCreateFolder('Todoom')
    await store.findOrCreateFileIn(folder, 'todo.txt')
    await store.findOrCreateFolder('Other')
    expect((await store.listFiles(folder)).map((e) => e.name)).toEqual(['todo.txt'])
  })

  it('stores an uploaded file with its contents and a link', async () => {
    const store = await signedIn()
    const folder = await store.findOrCreateFolder('Todoom')
    const entry = await store.uploadFile(folder, new File(['eggs'], 'recipe.txt'))
    expect(entry.name).toBe('recipe.txt')
    expect(entry.webViewLink).toContain(entry.id)
    expect((await store.read(entry)).text).toBe('eggs')
  })

  it('hides a trashed file from listings', async () => {
    const store = await signedIn()
    const folder = await store.findOrCreateFolder('Todoom')
    const entry = await store.uploadFile(folder, new File(['eggs'], 'recipe.txt'))
    await store.trashFile(entry.id)
    expect(await store.listFiles(folder)).toEqual([])
    expect(store.isTrashed(entry.id)).toBe(true)
  })
})
