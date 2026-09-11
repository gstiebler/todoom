import { reaction } from 'mobx'
import { describe, it, expect } from 'vitest'
import { TodoomApp } from './state'
import { FakeStore } from '../drive/fakeStore'
import { formatTask } from '../core/format'
import { FakeModel } from './fakeModel'

const TODAY = '2026-09-10'

async function setup(seed = 'Buy milk\n') {
  const store = new FakeStore({ 'todo.txt': seed })
  await store.signIn()
  const workspace = await store.workspace()
  const app = new TodoomApp(store, () => TODAY)
  await app.load(workspace)
  return { store, workspace, app }
}

async function waitFor(check: () => void): Promise<void> {
  for (let i = 0; i < 50; i += 1) {
    try {
      check()
      return
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 5))
    }
  }
  check()
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
    const { app, store, workspace } = await setup()
    app.addTask('Call plumber')
    await app.save()
    expect(app.state.saveState).toBe('saved')
    expect((await store.read(workspace.todo)).text).toBe('Buy milk\n2026-09-10 Call plumber\n')
  })

  it('does nothing when there is nothing to save', async () => {
    const { app, store, workspace } = await setup()
    const before = await store.getModifiedTime(workspace.todo)
    await app.save()
    expect(await store.getModifiedTime(workspace.todo)).toBe(before)
  })

  it('writes a conflict copy when the file changed underneath', async () => {
    const { app, store, workspace } = await setup()
    store.editOutside(workspace.todo, 'Edited elsewhere\n')
    app.addTask('Call plumber')
    await app.save()
    expect((await store.read(workspace.todo)).text).toContain('Call plumber')
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
    const { app, store, workspace } = await setup()
    store.editOutside(workspace.todo, 'Edited elsewhere\n')
    await app.refreshIfClean()
    expect(app.state.tasks.map((t) => t.description)).toEqual(['Edited elsewhere'])
  })

  it('does not reload when there are local changes', async () => {
    const { app, store, workspace } = await setup()
    app.addTask('Call plumber')
    store.editOutside(workspace.todo, 'Edited elsewhere\n')
    await app.refreshIfClean()
    expect(app.state.tasks).toHaveLength(2)
  })
})

describe('archive', () => {
  it('moves completed tasks to done.txt', async () => {
    const { app, store, workspace } = await setup('a\nx 2026-09-09 b\n')
    const moved = await app.archive()
    expect(moved).toBe(1)
    expect((await store.read(workspace.todo)).text).toBe('a\n')
    const done = await store.findOrCreateFileIn(workspace.folder, 'done.txt')
    expect((await store.read(done)).text).toBe('x 2026-09-09 b\n')
  })

  it('appends to an existing done.txt', async () => {
    const store = new FakeStore({ 'todo.txt': 'a\nx 2026-09-09 b\n', 'done.txt': 'x 2026-01-01 old\n' })
    await store.signIn()
    const workspace = await store.workspace()
    const app = new TodoomApp(store, () => TODAY)
    await app.load(workspace)
    await app.archive()
    const done = store.refFor('done.txt')
    expect((await store.read(done)).text).toBe('x 2026-01-01 old\nx 2026-09-09 b\n')
  })

  it('does nothing when nothing is complete', async () => {
    const { app } = await setup('a\n')
    expect(await app.archive()).toBe(0)
  })

  it('surfaces failure when the todo.txt write fails after done.txt already succeeded', async () => {
    const { app, store, workspace } = await setup('a\nx 2026-09-09 b\n')
    store.failNextWriteTo('todo.txt')
    await expect(app.archive()).rejects.toThrow()
    expect(app.state.saveState).toBe('error')
    const done = await store.findOrCreateFileIn(workspace.folder, 'done.txt')
    expect((await store.read(done)).text).toBe('x 2026-09-09 b\n')
  })

  it('preserves an edit made while the archive write is in flight', async () => {
    const { app, store, workspace } = await setup('a\nx 2026-09-09 b\n')
    const gate = store.holdNextWrite()

    const archivePromise = app.archive()
    await gate.writeStarted
    app.editTask(0, 'a, edited mid-archive')
    gate.release()

    await expect(archivePromise).resolves.toBe(1)
    expect(app.state.tasks.map(formatTask)).toEqual(['a, edited mid-archive'])
    expect((await store.read(workspace.todo)).text).toBe('a, edited mid-archive\n')
  })
})

describe('observability', () => {
  it('reacts when the task list changes', async () => {
    const { app } = await setup()
    let calls = 0
    const stop = reaction(
      () => app.state.tasks.length,
      () => {
        calls += 1
      },
    )
    app.addTask('Call plumber')
    expect(calls).toBe(1)
    stop()
    app.addTask('Another')
    expect(calls).toBe(1)
  })

  it('reacts when the filter changes', async () => {
    const { app } = await setup()
    let seen: string[] = []
    const stop = reaction(
      () => app.state.filter,
      (filter) => {
        seen = filter.projects
      },
    )
    app.setFilter({ projects: ['house'] })
    stop()
    expect(seen).toEqual(['house'])
  })
})

function upload(name: string, text = 'hello'): File {
  return new File([text], name, { type: 'text/plain' })
}

describe('attachments', () => {
  it('uploads a file and appends its id to the line', async () => {
    const { app } = await setup()
    await app.attachFiles(0, [upload('spec.pdf')])
    const ids = app.state.tasks[0]?.attachments ?? []
    expect(ids).toHaveLength(1)
    expect(app.attachmentsById.get(ids[0] as string)?.name).toBe('spec.pdf')
  })

  it('lists the folder once at load and knows the names', async () => {
    const { app, store, workspace } = await setup()
    await store.uploadFile(workspace.attachments, upload('notes.txt'))
    await app.loadAttachments()
    const names = [...app.attachmentsById.values()].map((entry) => entry.name)
    expect(names).toContain('notes.txt')
  })

  it('detaching removes the id and trashes the Drive file', async () => {
    const { app, store } = await setup()
    await app.attachFiles(0, [upload('spec.pdf')])
    const id = app.state.tasks[0]?.attachments[0] as string
    await app.detachFile(0, id)
    expect(app.state.tasks[0]?.attachments).toEqual([])
    expect(store.isTrashed(id)).toBe(true)
  })

  it('an upload failure lands in state.error and leaves the line alone', async () => {
    const { app, store } = await setup()
    store.failNextUploads(1)
    await app.attachFiles(0, [upload('spec.pdf')])
    expect(app.state.error).toContain('spec.pdf')
    expect(app.state.tasks[0]?.attachments).toEqual([])
  })

  it('uploadFiles returns one id per file', async () => {
    const { app } = await setup()
    const ids = await app.uploadFiles([upload('a.txt'), upload('b.txt')])
    expect(ids).toHaveLength(2)
  })
})

describe('setDependency', () => {
  it('gives the target an id and points the task at it', async () => {
    const { app } = await setup('Buy milk\nBake cake\n')
    app.setDependency(1, 0)
    const id = app.state.tasks[0]?.pairs['id']
    expect(id).toMatch(/^[a-z0-9]{6}$/)
    expect(app.state.tasks[1]?.pairs['dep']).toBe(id)
    expect(app.state.saveState).toBe('dirty')
  })

  it('reuses an existing id and can be cleared', async () => {
    const { app } = await setup('Buy milk id:abc123\nBake cake\n')
    app.setDependency(1, 0)
    expect(app.state.tasks[1]?.description).toBe('Bake cake dep:abc123')
    app.setDependency(1, null)
    expect(app.state.tasks[1]?.description).toBe('Bake cake')
  })
})

describe('loadHistory', () => {
  it('reads the archived tasks from done.txt', async () => {
    const { app } = await setup('Buy milk\n')
    expect(app.state.archived).toBeNull()
    app.addTask('Old chore')
    app.toggleComplete(1)
    await app.archive()
    await app.loadHistory()
    expect(app.state.archived?.map((t) => t.description)).toEqual(['Old chore'])
  })

  it('is empty when nothing was ever archived', async () => {
    const { app } = await setup('Buy milk\n')
    await app.loadHistory()
    expect(app.state.archived).toEqual([])
  })
})

describe('query errors', () => {
  it('reports the parse error and keeps the last good result', async () => {
    const { app } = await setup('a +house\nb +work\n')
    app.setFilter({ search: '+house' })
    expect(app.queryError).toBeNull()
    expect(app.visibleTasks().map((t) => t.description)).toEqual(['a +house'])
    app.setFilter({ search: '+house | (' })
    expect(app.queryError).toBe('Missing a term at the end')
    expect(app.visibleTasks().map((t) => t.description)).toEqual(['a +house'])
    app.setFilter({ search: '' })
    expect(app.queryError).toBeNull()
    expect(app.visibleTasks()).toHaveLength(2)
  })
})

describe('saved filters', () => {
  it('loads filters.txt with the workspace', async () => {
    const store = new FakeStore({ 'todo.txt': 'a\n', 'filters.txt': 'Home: +home\n' })
    await store.signIn()
    const app = new TodoomApp(store, () => TODAY)
    await app.load(await store.workspace())
    expect(app.state.filters).toEqual([{ name: 'Home', query: '+home', column: false }])
  })

  it('is empty when there is no filters.txt yet', async () => {
    const { app } = await setup()
    expect(app.state.filters).toEqual([])
  })

  it('saves, replaces and deletes filters in file order', async () => {
    const { app, store } = await setup()
    await app.saveFilter('Home', '+home')
    await app.saveFilter('Calls', '@phone')
    await app.saveFilter('Home', '+home & !done')
    expect(app.state.filters).toEqual([
      { name: 'Home', query: '+home & !done', column: false },
      { name: 'Calls', query: '@phone', column: false },
    ])
    const file = (await store.findOrCreateFileIn(app.folder, 'filters.txt'))
    expect((await store.read(file)).text).toBe('Home: +home & !done\nCalls: @phone\n')
    await app.deleteFilter('Home')
    expect(app.state.filters).toEqual([{ name: 'Calls', query: '@phone', column: false }])
    expect((await store.read(file)).text).toBe('Calls: @phone\n')
  })

  it('rejects a name containing ": ", which would corrupt filters.txt', async () => {
    const { app } = await setup()
    await expect(app.saveFilter('Work: urgent', '+work')).rejects.toThrow(
      'Filter names cannot contain ": "',
    )
  })

  it('rejects a name starting with "*", which would corrupt filters.txt', async () => {
    const { app } = await setup()
    await expect(app.saveFilter('*Fun', '+fun')).rejects.toThrow(
      'Filter names cannot start with "*"',
    )
  })

  it('marks and unmarks a filter as a column', async () => {
    const { app, store } = await setup()
    await app.saveFilter('Home', '+home')
    await app.saveFilter('Calls', '@phone')
    await app.setColumn('Calls', true)
    expect(app.columnFilters).toEqual([{ name: 'Calls', query: '@phone', column: true }])
    const file = await store.findOrCreateFileIn(app.folder, 'filters.txt')
    expect((await store.read(file)).text).toBe('Home: +home\n* Calls: @phone\n')
    await app.setColumn('Calls', false)
    expect(app.columnFilters).toEqual([])
  })
})

describe('translate', () => {
  async function setupModel(model: FakeModel) {
    const store = new FakeStore({ 'todo.txt': 'a +home @phone\nb +work\n' })
    await store.signIn()
    const app = new TodoomApp(store, () => TODAY, model)
    await app.load(await store.workspace())
    return app
  }

  it('reports the availability once asked', async () => {
    const app = await setupModel(new FakeModel('downloadable'))
    await waitFor(() => expect(app.state.model).toBe('downloadable'))
  })

  it('puts a valid answer into the search', async () => {
    const model = new FakeModel('available', ['+home & due:today'])
    const app = await setupModel(model)
    await app.translate('home things for today')
    expect(app.state.filter.search).toBe('+home & due:today')
    expect(model.prompts).toEqual(['home things for today'])
    expect(model.systemPrompt).toContain('Projects: +home +work')
    expect(model.systemPrompt).toContain('Contexts: @phone')
  })

  it('strips fences and keeps the first line', async () => {
    const app = await setupModel(new FakeModel('available', ['`+home`\nsecond line']))
    await app.translate('home')
    expect(app.state.filter.search).toBe('+home')
  })

  it('skips a fence line to find the first real line', async () => {
    const app = await setupModel(new FakeModel('available', ['```\n+home\n```']))
    await app.translate('home')
    expect(app.state.filter.search).toBe('+home')
  })

  it('retries once with the parse error', async () => {
    const model = new FakeModel('available', ['+home |', '+home'])
    const app = await setupModel(model)
    await app.translate('home')
    expect(app.state.filter.search).toBe('+home')
    expect(model.prompts[1]).toContain('"+home |"')
    expect(model.prompts[1]).toContain('Missing a term at the end')
  })

  it('gives up after the second bad answer', async () => {
    const app = await setupModel(new FakeModel('available', ['+home |', 'done |']))
    await expect(app.translate('home')).rejects.toThrow('Missing a term at the end')
    expect(app.state.filter.search).toBe('')
  })

  it('reports download progress and reuses the session', async () => {
    const model = new FakeModel('available', ['+home', 'done'], [0.5])
    const app = await setupModel(model)
    const seen: Array<number | null> = []
    const stop = reaction(() => app.state.modelProgress, (p) => seen.push(p))
    await app.translate('home')
    await app.translate('finished')
    expect(seen).toEqual([0, 0.5, null])
    expect(model.sessions).toBe(1)
    stop()
  })

  it('clears the progress when the download fails', async () => {
    const model = new FakeModel()
    model.failCreate = new Error('declined')
    const app = await setupModel(model)
    await expect(app.translate('home')).rejects.toThrow('declined')
    expect(app.state.modelProgress).toBeNull()
  })
})
