import { describe, it, expect, vi, beforeEach } from 'vitest'
import { saveFileRef, loadFileRef, clearFileRef, createDebouncedSaver } from './session'
import { TodoomApp } from './state'
import { FakeStore } from '../drive/fakeStore'

beforeEach(() => {
  localStorage.clear()
})

describe('file ref persistence', () => {
  it('returns null when nothing is stored', () => {
    expect(loadFileRef()).toBeNull()
  })

  it('round trips a ref', () => {
    saveFileRef({ id: 'abc', name: 'todo.txt' })
    expect(loadFileRef()).toEqual({ id: 'abc', name: 'todo.txt' })
  })

  it('clears a ref', () => {
    saveFileRef({ id: 'abc', name: 'todo.txt' })
    clearFileRef()
    expect(loadFileRef()).toBeNull()
  })

  it('returns null for corrupt storage', () => {
    localStorage.setItem('todoom.fileRef', 'not json')
    expect(loadFileRef()).toBeNull()
  })
})

describe('createDebouncedSaver', () => {
  it('saves once after the delay', async () => {
    vi.useFakeTimers()
    const store = new FakeStore({ 'todo.txt': '' })
    await store.signIn()
    const app = new TodoomApp(store, () => '2026-09-10')
    await app.load(store.refFor('todo.txt'))
    const saver = createDebouncedSaver(app, 2000)

    app.addTask('a')
    saver.schedule()
    app.addTask('b')
    saver.schedule()

    expect(app.state.saveState).toBe('dirty')
    await vi.advanceTimersByTimeAsync(2000)
    expect(app.state.saveState).toBe('saved')
    expect((await store.read(store.refFor('todo.txt'))).text).toContain('a')
    vi.useRealTimers()
  })

  it('flush saves immediately and cancels the pending timer', async () => {
    vi.useFakeTimers()
    const store = new FakeStore({ 'todo.txt': '' })
    await store.signIn()
    const app = new TodoomApp(store, () => '2026-09-10')
    await app.load(store.refFor('todo.txt'))
    const saver = createDebouncedSaver(app, 2000)

    app.addTask('a')
    saver.schedule()
    await saver.flush()
    expect(app.state.saveState).toBe('saved')

    await vi.advanceTimersByTimeAsync(2000)
    expect(app.state.saveState).toBe('saved')
    vi.useRealTimers()
  })
})
