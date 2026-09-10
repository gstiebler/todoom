// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { App } from './App'
import { TodoomApp } from '../app/state'
import { FakeStore } from '../drive/fakeStore'

const TODAY = '2026-09-10'

async function mount(seed: string) {
  const store = new FakeStore({ 'todo.txt': seed })
  await store.signIn()
  const app = new TodoomApp(store, () => TODAY)
  await app.load(store.refFor('todo.txt'))
  const { container } = render(<App app={app} today={() => TODAY} />)
  return { app, root: container, store }
}

function labels(root: HTMLElement): string[] {
  return [...root.querySelectorAll('.chip')].map((c) => c.textContent ?? '')
}

afterEach(cleanup)

describe('App', () => {
  it('renders one row per visible task', async () => {
    const { root } = await mount('Buy milk\n(A) Call plumber\n')
    expect(root.querySelectorAll('.task')).toHaveLength(2)
  })

  it('puts the highest priority first', async () => {
    const { root } = await mount('Buy milk\n(A) Call plumber\n')
    expect(root.querySelector('.task .task__text')?.textContent).toContain('Call plumber')
  })

  it('shows an empty message when nothing matches', async () => {
    const { root } = await mount('')
    expect(root.querySelector('.empty')).not.toBeNull()
  })

  it('renders projects and contexts as tags', async () => {
    const { root } = await mount('Call plumber +house @phone\n')
    expect(root.querySelector('.tag--project')?.textContent).toBe('+house')
    expect(root.querySelector('.tag--context')?.textContent).toBe('@phone')
  })

  it('hides completed tasks by default', async () => {
    const { root } = await mount('a\nx 2026-09-09 b\n')
    expect(root.querySelectorAll('.task')).toHaveLength(1)
  })

  it('completes a task when the checkbox is clicked', async () => {
    const { root, app } = await mount('Buy milk\n')
    fireEvent.click(root.querySelector('.task__check')!)
    expect(app.state.tasks[0]?.completed).toBe(true)
  })

  it('adds a task when the form is submitted', async () => {
    const { root, app } = await mount('')
    fireEvent.change(root.querySelector('.add-input')!, { target: { value: 'Call plumber' } })
    fireEvent.submit(root.querySelector('.add-form')!)
    expect(app.state.tasks).toHaveLength(1)
    expect(app.state.tasks[0]?.description).toBe('Call plumber')
  })

  it('clears the add box after submitting', async () => {
    const { root } = await mount('')
    const input = root.querySelector<HTMLInputElement>('.add-input')!
    fireEvent.change(input, { target: { value: 'Call plumber' } })
    fireEvent.submit(root.querySelector('.add-form')!)
    expect(input.value).toBe('')
  })

  it('deletes a task when the delete button is clicked', async () => {
    const { root, app } = await mount('Buy milk\n')
    fireEvent.click(root.querySelector('.task__delete')!)
    expect(app.state.tasks).toHaveLength(0)
  })

  it('opens an editor when the text is clicked', async () => {
    const { root } = await mount('Buy milk\n')
    fireEvent.click(root.querySelector('.task__text')!)
    expect(root.querySelector('.task__editor')).not.toBeNull()
  })

  it('commits an inline edit on Enter', async () => {
    const { root, app } = await mount('Buy milk\n')
    fireEvent.click(root.querySelector('.task__text')!)
    const editor = root.querySelector('.task__editor')!
    fireEvent.change(editor, { target: { value: 'Buy oat milk' } })
    fireEvent.keyDown(editor, { key: 'Enter' })
    expect(app.state.tasks[0]?.description).toBe('Buy oat milk')
  })

  it('discards an inline edit on Escape', async () => {
    const { root, app } = await mount('Buy milk\n')
    fireEvent.click(root.querySelector('.task__text')!)
    const editor = root.querySelector('.task__editor')!
    fireEvent.change(editor, { target: { value: 'Buy oat milk' } })
    fireEvent.keyDown(editor, { key: 'Escape' })
    fireEvent.blur(editor)
    expect(app.state.tasks[0]?.description).toBe('Buy milk')
    expect(root.querySelector('.task__editor')).toBeNull()
  })

  it('filters by project when a chip is clicked', async () => {
    const { root, app } = await mount('a +house\nb +work\n')
    const chips = [...root.querySelectorAll<HTMLButtonElement>('.chip')]
    fireEvent.click(chips.find((c) => c.textContent === '+house')!)
    expect(app.state.filter.projects).toEqual(['house'])
  })

  it('keeps the search box focused while typing', async () => {
    const { root, app } = await mount('Buy milk\n')
    const search = root.querySelector<HTMLInputElement>('.search')!
    search.focus()
    fireEvent.change(search, { target: { value: 'milk' } })
    expect(app.state.filter.search).toBe('milk')
    expect(document.activeElement).toBe(root.querySelector('.search'))
  })

  it('offers a retry button after a failed save', async () => {
    const { root, app, store } = await mount('a\n')
    app.addTask('b')
    store.signOut()
    await act(async () => {
      await app.save()
    })
    expect(root.querySelector('.status--error')).not.toBeNull()
    expect(root.querySelector('.status__retry')).not.toBeNull()
  })

  it('shows the save status', async () => {
    const { root, app } = await mount('a\n')
    act(() => app.addTask('b'))
    expect(root.querySelector('.status')?.textContent).toBe('Unsaved changes')
  })
})

describe('stranded filter chips', () => {
  it('keeps a selected project chip after its last task is archived', async () => {
    const { root, app } = await mount('Buy milk +groceries\nCall plumber +house\n')
    act(() => app.setFilter({ projects: ['groceries'] }))
    expect(labels(root)).toContain('+groceries')

    const milk = app.state.tasks.find((t) => t.projects.includes('groceries'))
    if (milk) act(() => app.toggleComplete(app.state.tasks.indexOf(milk)))
    await act(async () => {
      await app.archive()
    })

    expect(labels(root)).toContain('+groceries')
  })

  it('keeps a selected context chip that no task carries', async () => {
    const { root, app } = await mount('Call plumber +house\n')
    act(() => app.setFilter({ contexts: ['phone'] }))
    expect(labels(root)).toContain('@phone')
  })

  it('keeps a selected priority chip that no task carries', async () => {
    const { root, app } = await mount('Call plumber +house\n')
    act(() => app.setFilter({ priorities: ['A'] }))
    expect(labels(root)).toContain('(A)')
  })
})

describe('sidebar layout', () => {
  it('keeps the completed toggle out of the exclusive view group', async () => {
    const { root } = await mount('Buy milk\n')
    const views = [...root.querySelectorAll('.views .view-btn')].map((b) => b.textContent)
    expect(views).toEqual(['All', 'Overdue', 'Today', 'Upcoming'])

    const toggle = root.querySelector<HTMLButtonElement>('.toggles .toggle-btn')
    expect(toggle?.textContent).toBe('Show completed')
    expect(toggle?.className).not.toContain('view-btn')
  })

  it('puts the controls in the sidebar and the tasks in the main pane', async () => {
    const { root } = await mount('Buy milk +house\n')
    expect(root.querySelector('.sidebar .search')).not.toBeNull()
    expect(root.querySelector('.sidebar .chip')?.textContent).toBe('+house')
    expect(root.querySelector('.sidebar .archive-btn')).not.toBeNull()
    expect(root.querySelector('.main .add-form')).not.toBeNull()
    expect(root.querySelector('.main .task-list')).not.toBeNull()
  })

  it('omits a chip group heading when nothing carries that kind of tag', async () => {
    const { root } = await mount('Buy milk\n')
    const headings = [...root.querySelectorAll('.filters__heading')].map((h) => h.textContent)
    expect(headings).toEqual([])
  })
})
