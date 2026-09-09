import { describe, it, expect, beforeEach } from 'vitest'
import { render, describeTask } from './render'
import { TodoomApp } from '../app/state'
import { FakeStore } from '../drive/fakeStore'
import { parseLine } from '../core/parse'

const TODAY = '2026-09-10'

async function mount(seed: string) {
  const store = new FakeStore({ 'todo.txt': seed })
  await store.signIn()
  const app = new TodoomApp(store, () => TODAY)
  await app.load(store.refFor('todo.txt'))
  const root = document.createElement('div')
  document.body.appendChild(root)
  render(root, app, TODAY)
  return { app, root, store }
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('describeTask', () => {
  it('marks an overdue task', () => {
    const d = describeTask(parseLine('Buy milk due:2026-09-01'), TODAY)
    expect(d.classes).toContain('task--overdue')
    expect(d.dueLabel).toBe('Overdue 2026-09-01')
  })

  it('marks a task due today', () => {
    const d = describeTask(parseLine('Buy milk due:2026-09-10'), TODAY)
    expect(d.classes).toContain('task--today')
    expect(d.dueLabel).toBe('Due today')
  })

  it('labels a future due date plainly', () => {
    const d = describeTask(parseLine('Buy milk due:2026-09-20'), TODAY)
    expect(d.classes).not.toContain('task--overdue')
    expect(d.dueLabel).toBe('Due 2026-09-20')
  })

  it('has no due label without a due date', () => {
    expect(describeTask(parseLine('Buy milk'), TODAY).dueLabel).toBe('')
  })

  it('ignores a malformed due date', () => {
    expect(describeTask(parseLine('Buy milk due:soon'), TODAY).dueLabel).toBe('')
  })

  it('marks a completed task', () => {
    const d = describeTask(parseLine('x 2026-09-09 Buy milk'), TODAY)
    expect(d.classes).toContain('task--done')
  })
})

describe('render', () => {
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
    const checkbox = root.querySelector<HTMLInputElement>('.task__check')
    checkbox?.click()
    expect(app.state.tasks[0]?.completed).toBe(true)
  })

  it('adds a task when the form is submitted', async () => {
    const { root, app } = await mount('')
    const input = root.querySelector<HTMLInputElement>('.add-input')!
    input.value = 'Call plumber'
    root.querySelector<HTMLFormElement>('.add-form')!.dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }),
    )
    expect(app.state.tasks).toHaveLength(1)
    expect(app.state.tasks[0]?.description).toBe('Call plumber')
  })

  it('deletes a task when the delete button is clicked', async () => {
    const { root, app } = await mount('Buy milk\n')
    root.querySelector<HTMLButtonElement>('.task__delete')?.click()
    expect(app.state.tasks).toHaveLength(0)
  })

  it('opens an editor when the text is clicked', async () => {
    const { root } = await mount('Buy milk\n')
    root.querySelector<HTMLElement>('.task__text')?.click()
    expect(root.querySelector('.task__editor')).not.toBeNull()
  })

  it('filters by project when a chip is clicked', async () => {
    const { root, app } = await mount('a +house\nb +work\n')
    const chips = [...root.querySelectorAll<HTMLButtonElement>('.chip')]
    const houseChip = chips.find((c) => c.textContent === '+house')
    houseChip?.click()
    expect(app.state.filter.projects).toEqual(['house'])
  })

  it('offers a retry button after a failed save', async () => {
    const { root, app, store } = await mount('a\n')
    app.addTask('b')
    store.signOut()
    await app.save()
    render(root, app, TODAY)
    expect(root.querySelector('.status--error')).not.toBeNull()
    expect(root.querySelector('.status__retry')).not.toBeNull()
  })

  it('shows the save status', async () => {
    const { root, app } = await mount('a\n')
    app.addTask('b')
    render(root, app, TODAY)
    expect(root.querySelector('.status')?.textContent).toBe('Unsaved changes')
  })
})
