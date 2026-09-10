import { describe, it, expect } from 'vitest'
import { TodoomApp } from './state'
import { FakeStore } from '../drive/fakeStore'
import { formatTask } from '../core/format'

const TODAY = '2026-09-10'

async function setup(seed = 'Buy milk\n') {
  const store = new FakeStore({ 'todo.txt': seed })
  await store.signIn()
  const ref = store.refFor('todo.txt')
  const app = new TodoomApp(store, () => TODAY)
  await app.load(ref)
  return { store, ref, app }
}

describe('load', () => {
  it('parses the file into tasks', async () => {
    const { app } = await setup('Buy milk\n(A) Call plumber\n')
    expect(app.state.tasks).toHaveLength(2)
    expect(app.state.saveState).toBe('idle')
  })

  it('records the loaded modifiedTime', async () => {
    const { app } = await setup()
    expect(app.state.loadedModifiedTime).not.toBeNull()
  })
})

describe('addTask', () => {
  it('appends a task stamped with today', async () => {
    const { app } = await setup()
    app.addTask('(A) Call plumber +house')
    expect(formatTask(app.state.tasks[1]!)).toBe('(A) 2026-09-10 Call plumber +house')
    expect(app.state.saveState).toBe('dirty')
  })

  it('ignores blank input', async () => {
    const { app } = await setup()
    app.addTask('   ')
    expect(app.state.tasks).toHaveLength(1)
    expect(app.state.saveState).toBe('idle')
  })
})

describe('toggleComplete', () => {
  it('completes an incomplete task', async () => {
    const { app } = await setup()
    app.toggleComplete(0)
    expect(formatTask(app.state.tasks[0]!)).toBe('x 2026-09-10 Buy milk')
  })

  it('uncompletes a completed task', async () => {
    const { app } = await setup('x 2026-09-09 Buy milk\n')
    app.toggleComplete(0)
    expect(formatTask(app.state.tasks[0]!)).toBe('Buy milk')
  })

  it('appends the next occurrence of a recurring task', async () => {
    const { app } = await setup('Water plants due:2026-09-01 rec:+1w\n')
    app.toggleComplete(0)
    expect(app.state.tasks).toHaveLength(2)
    expect(app.state.tasks[0]?.completed).toBe(true)
    expect(app.state.tasks[1]?.pairs['due']).toBe('2026-09-08')
    expect(app.state.tasks[1]?.completed).toBe(false)
  })

  it('does not respawn when uncompleting', async () => {
    const { app } = await setup('x 2026-09-09 Water plants rec:1w\n')
    app.toggleComplete(0)
    expect(app.state.tasks).toHaveLength(1)
  })
})

describe('editTask and deleteTask', () => {
  it('replaces a line', async () => {
    const { app } = await setup()
    app.editTask(0, '(B) Buy oat milk')
    expect(formatTask(app.state.tasks[0]!)).toBe('(B) Buy oat milk')
    expect(app.state.saveState).toBe('dirty')
  })

  it('deletes a line', async () => {
    const { app } = await setup('a\nb\n')
    app.deleteTask(0)
    expect(app.state.tasks.map((t) => t.description)).toEqual(['b'])
  })
})

describe('visibleTasks', () => {
  it('applies the filter and the sort', async () => {
    const { app } = await setup('(B) second\nx 2026-09-09 done\n(A) first\n')
    expect(app.visibleTasks().map((t) => t.description)).toEqual(['first', 'second'])
  })
})

describe('save', () => {
  it('writes the file and clears the dirty flag', async () => {
    const { app, store, ref } = await setup()
    app.addTask('Call plumber')
    await app.save()
    expect(app.state.saveState).toBe('saved')
    expect((await store.read(ref)).text).toBe('Buy milk\n2026-09-10 Call plumber\n')
  })

  it('does nothing when there is nothing to save', async () => {
    const { app, store, ref } = await setup()
    const before = await store.getModifiedTime(ref)
    await app.save()
    expect(await store.getModifiedTime(ref)).toBe(before)
  })

  it('writes a conflict copy when the file changed underneath', async () => {
    const { app, store, ref } = await setup()
    store.editOutside(ref, 'Edited elsewhere\n')
    app.addTask('Call plumber')
    await app.save()
    expect((await store.read(ref)).text).toContain('Call plumber')
    const conflict = await store.findFileNamedLike('todo.conflict-')
    expect(conflict).not.toBeNull()
    expect((await store.read(conflict!)).text).toBe('Edited elsewhere\n')
  })

  it('keeps the dirty flag and records the error when the write fails', async () => {
    const { app, store } = await setup()
    app.addTask('Call plumber')
    store.signOut()
    await app.save()
    expect(app.state.saveState).toBe('error')
    expect(app.state.error).toContain('not signed in')
    expect(app.state.tasks).toHaveLength(2)
  })

  it('stays dirty if an edit lands while a save is still in flight', async () => {
    const { app, store } = await setup()
    app.addTask('Call plumber')
    const gate = store.holdNextWrite()
    const savePromise = app.save()
    await gate.writeStarted
    app.addTask('Another task, added mid-save')
    gate.release()
    await savePromise
    expect(app.state.saveState).toBe('dirty')
  })
})

describe('refreshIfClean', () => {
  it('reloads when there are no local changes', async () => {
    const { app, store, ref } = await setup()
    store.editOutside(ref, 'Edited elsewhere\n')
    await app.refreshIfClean()
    expect(app.state.tasks.map((t) => t.description)).toEqual(['Edited elsewhere'])
  })

  it('does not reload when there are local changes', async () => {
    const { app, store, ref } = await setup()
    app.addTask('Call plumber')
    store.editOutside(ref, 'Edited elsewhere\n')
    await app.refreshIfClean()
    expect(app.state.tasks).toHaveLength(2)
  })
})

describe('archive', () => {
  it('moves completed tasks to done.txt', async () => {
    const { app, store, ref } = await setup('a\nx 2026-09-09 b\n')
    const moved = await app.archive()
    expect(moved).toBe(1)
    expect((await store.read(ref)).text).toBe('a\n')
    const done = await store.findOrCreateSibling(ref, 'done.txt')
    expect((await store.read(done)).text).toBe('x 2026-09-09 b\n')
  })

  it('appends to an existing done.txt', async () => {
    const store = new FakeStore({ 'todo.txt': 'a\nx 2026-09-09 b\n', 'done.txt': 'x 2026-01-01 old\n' })
    await store.signIn()
    const ref = store.refFor('todo.txt')
    const app = new TodoomApp(store, () => TODAY)
    await app.load(ref)
    await app.archive()
    const done = store.refFor('done.txt')
    expect((await store.read(done)).text).toBe('x 2026-01-01 old\nx 2026-09-09 b\n')
  })

  it('does nothing when nothing is complete', async () => {
    const { app } = await setup('a\n')
    expect(await app.archive()).toBe(0)
  })

  it('surfaces failure when the todo.txt write fails after done.txt already succeeded', async () => {
    const { app, store, ref } = await setup('a\nx 2026-09-09 b\n')
    store.failNextWriteTo('todo.txt')
    await expect(app.archive()).rejects.toThrow()
    expect(app.state.saveState).toBe('error')
    const done = await store.findOrCreateSibling(ref, 'done.txt')
    expect((await store.read(done)).text).toBe('x 2026-09-09 b\n')
  })

  it('preserves an edit made while the archive write is in flight', async () => {
    const { app, store, ref } = await setup('a\nx 2026-09-09 b\n')
    const gate = store.holdNextWrite()

    const archivePromise = app.archive()
    await gate.writeStarted
    app.editTask(0, 'a, edited mid-archive')
    gate.release()

    await expect(archivePromise).resolves.toBe(1)
    expect(app.state.tasks.map(formatTask)).toEqual(['a, edited mid-archive'])
    expect((await store.read(ref)).text).toBe('a, edited mid-archive\n')
  })
})

describe('subscribe', () => {
  it('notifies listeners on change', async () => {
    const { app } = await setup()
    let calls = 0
    const unsubscribe = app.subscribe(() => { calls += 1 })
    app.addTask('Call plumber')
    expect(calls).toBe(1)
    unsubscribe()
    app.addTask('Another')
    expect(calls).toBe(1)
  })
})
