// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  saveWorkspace,
  loadWorkspace,
  clearWorkspace,
  openWorkspace,
  createDebouncedSaver,
} from './session'
import { TodoomApp } from './state'
import { FakeStore } from '../drive/fakeStore'

beforeEach(() => {
  localStorage.clear()
})

describe('workspace persistence', () => {
  const workspace = {
    folder: { id: 'fol', name: 'Todoom' },
    todo: { id: 'abc', name: 'todo.txt' },
    attachments: { id: 'att', name: 'attachments' },
  }

  it('returns null when nothing is stored', () => {
    expect(loadWorkspace()).toBeNull()
  })

  it('round trips a workspace', () => {
    saveWorkspace(workspace)
    expect(loadWorkspace()).toEqual(workspace)
  })

  it('clears a workspace', () => {
    saveWorkspace(workspace)
    clearWorkspace()
    expect(loadWorkspace()).toBeNull()
  })

  it('returns null for corrupt storage', () => {
    localStorage.setItem('todoom.workspace', 'not json')
    expect(loadWorkspace()).toBeNull()
  })

  it('returns null for a half-written workspace', () => {
    localStorage.setItem('todoom.workspace', JSON.stringify({ todo: workspace.todo }))
    expect(loadWorkspace()).toBeNull()
  })

  it('creates the Todoom folder and the todo file inside it', async () => {
    const store = new FakeStore()
    await store.signIn()

    const opened = await openWorkspace(store)

    expect(opened.folder.name).toBe('Todoom')
    expect(opened.todo.name).toBe('todo.txt')
    expect(await store.listFiles(opened.folder)).toEqual([
      expect.objectContaining({ id: opened.todo.id, name: 'todo.txt' }),
      expect.objectContaining({ id: opened.attachments.id, name: 'attachments' }),
    ])
  })

  it('puts the attachments folder inside the Todoom folder', async () => {
    const store = new FakeStore()
    await store.signIn()

    const opened = await openWorkspace(store)

    expect(opened.attachments.name).toBe('attachments')
    expect(await store.listFiles(opened.attachments)).toEqual([])
  })

  it('ignores a workspace remembered before attachments had their own folder', () => {
    localStorage.setItem(
      'todoom.workspace',
      JSON.stringify({ folder: workspace.folder, todo: workspace.todo }),
    )
    expect(loadWorkspace()).toBeNull()
  })

  it('remembers the workspace instead of asking Drive again', async () => {
    const store = new FakeStore()
    await store.signIn()
    const opened = await openWorkspace(store)

    const findOrCreateFolder = vi.fn()
    const findOrCreateFileIn = vi.fn()
    await expect(openWorkspace({ findOrCreateFolder, findOrCreateFileIn })).resolves.toEqual(opened)
    expect(findOrCreateFolder).not.toHaveBeenCalled()
    expect(findOrCreateFileIn).not.toHaveBeenCalled()
  })

  it('ignores a file remembered by an older version of the app', async () => {
    localStorage.setItem('todoom.rootFileRef', JSON.stringify({ id: 'old', name: 'todo.txt' }))
    const store = new FakeStore()
    await store.signIn()

    const opened = await openWorkspace(store)

    expect(opened.todo.id).not.toBe('old')
    expect(opened.folder.name).toBe('Todoom')
  })
})

describe('createDebouncedSaver', () => {
  it('saves once after the delay', async () => {
    vi.useFakeTimers()
    const store = new FakeStore({ 'todo.txt': '' })
    await store.signIn()
    const app = new TodoomApp(store, () => '2026-09-10')
    await app.load(await store.workspace())
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
    await app.load(await store.workspace())
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
