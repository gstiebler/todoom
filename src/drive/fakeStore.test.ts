import { describe, it, expect } from 'vitest'
import { FakeStore } from './fakeStore'

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
    const ref = await s.createFile('todo.txt')
    expect(ref.name).toBe('todo.txt')
    expect((await s.read(ref)).text).toBe('')
  })

  it('returns the same root file on repeat find-or-create calls', async () => {
    const s = new FakeStore()
    await s.signIn()
    const first = await s.findOrCreateRootFile('todo.txt')
    const second = await s.findOrCreateRootFile('todo.txt')
    expect(second).toEqual(first)
  })

  it('writes and reads back', async () => {
    const s = new FakeStore()
    await s.signIn()
    const ref = await s.createFile('todo.txt')
    await s.write(ref, 'Buy milk\n')
    expect((await s.read(ref)).text).toBe('Buy milk\n')
  })

  it('advances modifiedTime on each write', async () => {
    const s = new FakeStore()
    await s.signIn()
    const ref = await s.createFile('todo.txt')
    const first = (await s.write(ref, 'a\n')).modifiedTime
    const second = (await s.write(ref, 'b\n')).modifiedTime
    expect(second).not.toBe(first)
    expect(await s.getModifiedTime(ref)).toBe(second)
  })

  it('returns the same sibling on repeat calls', async () => {
    const s = new FakeStore()
    await s.signIn()
    const todo = await s.createFile('todo.txt')
    const a = await s.findOrCreateSibling(todo, 'done.txt')
    const b = await s.findOrCreateSibling(todo, 'done.txt')
    expect(a.id).toBe(b.id)
  })

  it('rejects reads when signed out', async () => {
    const s = new FakeStore()
    await s.signIn()
    const ref = await s.createFile('todo.txt')
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
