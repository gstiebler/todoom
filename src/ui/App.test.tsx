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
  await app.load(await store.workspace())
  const { container } = render(<App app={app} today={() => TODAY} />)
  return { app, root: container, store }
}

// The modal is the only way in, so every add-a-task case opens it first.
function type_(root: HTMLElement, text: string): void {
  if (!root.querySelector('.modal')) fireEvent.click(root.querySelector('.add-task')!)
  fireEvent.change(root.querySelector('.add-input')!, { target: { value: text } })
}

function chip(root: HTMLElement, name: string): Element {
  if (!root.querySelector('.modal')) fireEvent.click(root.querySelector('.add-task')!)
  return [...root.querySelectorAll('.modal-chip')].find((c) => c.textContent?.startsWith(name))!
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

  it('adds a task from the modal', async () => {
    const { root, app } = await mount('')
    type_(root, 'Call plumber')
    fireEvent.submit(root.querySelector('.modal')!)
    expect(app.state.tasks).toHaveLength(1)
    expect(app.state.tasks[0]?.description).toBe('Call plumber')
  })

  it('closes the modal after submitting', async () => {
    const { root } = await mount('')
    type_(root, 'Call plumber')
    fireEvent.submit(root.querySelector('.modal')!)
    expect(root.querySelector('.modal')).toBeNull()
  })

  it('appends the date chosen in the date popover', async () => {
    const { root, app } = await mount('')
    type_(root, 'Call plumber')
    fireEvent.click(chip(root, 'Date'))
    fireEvent.click(root.querySelectorAll('.quick-date')[0]!)
    fireEvent.submit(root.querySelector('.modal')!)
    expect(app.state.tasks[0]?.pairs['due']).toBe(TODAY)
  })

  it('leaves a date typed into the text alone', async () => {
    const { root, app } = await mount('')
    type_(root, 'Call plumber due:2026-10-01')
    fireEvent.click(chip(root, 'Date'))
    fireEvent.click(root.querySelectorAll('.quick-date')[0]!)
    fireEvent.submit(root.querySelector('.modal')!)
    expect(app.state.tasks[0]?.pairs['due']).toBe('2026-10-01')
    expect(app.state.tasks[0]?.raw).not.toContain(`due:${TODAY}`)
  })

  it('prepends the priority chosen in the priority popover', async () => {
    const { root, app } = await mount('')
    type_(root, 'Call plumber')
    fireEvent.click(chip(root, 'Priority'))
    fireEvent.click(root.querySelectorAll('.priority')[0]!)
    fireEvent.submit(root.querySelector('.modal')!)
    expect(app.state.tasks[0]?.priority).toBe('A')
  })

  it('appends a label ticked in the labels popover', async () => {
    const { root, app } = await mount('Buy milk +groceries\n')
    fireEvent.click(root.querySelector('.add-task')!)
    type_(root, 'Buy eggs')
    fireEvent.click(chip(root, 'Labels'))
    fireEvent.click(root.querySelector('.label-option input')!)
    fireEvent.submit(root.querySelector('.modal')!)
    expect(app.state.tasks.find((t) => t.description.startsWith('Buy eggs'))?.projects).toEqual([
      'groceries',
    ])
  })

  it('adds nothing when the modal is dismissed with Escape', async () => {
    const { root, app } = await mount('')
    type_(root, 'Call plumber')
    fireEvent.keyDown(root.querySelector('.modal')!, { key: 'Escape' })
    expect(root.querySelector('.modal')).toBeNull()
    expect(app.state.tasks).toHaveLength(0)
  })

  it('closes only the popover on the first Escape', async () => {
    const { root } = await mount('')
    fireEvent.click(chip(root, 'Date'))
    fireEvent.keyDown(root.querySelector('.modal')!, { key: 'Escape' })
    expect(root.querySelector('.popover')).toBeNull()
    expect(root.querySelector('.modal')).not.toBeNull()
  })

  it('deletes a task when the delete button is clicked', async () => {
    const { root, app } = await mount('Buy milk\n')
    fireEvent.click(root.querySelector('.task__delete')!)
    expect(app.state.tasks).toHaveLength(0)
  })

  it('opens the task modal when the text is clicked', async () => {
    const { root } = await mount('Buy milk\n')
    fireEvent.click(root.querySelector('.task__text')!)
    expect(root.querySelector('.task-modal')).not.toBeNull()
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
    expect(root.querySelector('.main .add-task')).not.toBeNull()
    expect(root.querySelector('.main .task-list')).not.toBeNull()
  })

  it('omits a chip group heading when nothing carries that kind of tag', async () => {
    const { root } = await mount('Buy milk\n')
    const headings = [...root.querySelectorAll('.filters__heading')].map((h) => h.textContent)
    expect(headings).toEqual([])
  })
})

describe('attachments', () => {
  // A mounted app whose one task carries two file words, one of which Drive
  // knows the name of and one of which it does not.
  async function withAttachments() {
    const mounted = await mount('Buy milk file:known file:gone\n')
    await act(async () => {
      mounted.app.attachmentsById.set('known', {
        id: 'known',
        name: 'spec.pdf',
        webViewLink: 'https://drive.example/known',
      })
    })
    return mounted
  }

  it('shows the attachment count on the row', async () => {
    const { root } = await withAttachments()
    expect(root.querySelector('.task__attach')?.textContent).toContain('2')
  })

  it('opens the popover with the file names', async () => {
    const { root } = await withAttachments()
    fireEvent.click(root.querySelector('.task__attach')!)
    expect(root.querySelector('.popover--attachments')?.textContent).toContain('spec.pdf')
  })

  it('links an attachment to its Drive page in a new tab', async () => {
    const { root } = await withAttachments()
    fireEvent.click(root.querySelector('.task__attach')!)
    const link = root.querySelector('.attachment__link') as HTMLAnchorElement
    expect(link.href).toBe('https://drive.example/known')
    expect(link.target).toBe('_blank')
    expect(link.rel).toBe('noopener noreferrer')
  })

  it('shows a missing file as removable', async () => {
    const { root } = await withAttachments()
    fireEvent.click(root.querySelector('.task__attach')!)
    const rows = [...root.querySelectorAll('.attachment')]
    const missing = rows.find((row) => row.textContent?.includes('gone'))
    expect(missing?.querySelector('.attachment__remove')).not.toBeNull()
  })

  it('closes the popover on Escape', async () => {
    const { root } = await withAttachments()
    fireEvent.click(root.querySelector('.task__attach')!)
    fireEvent.keyDown(root.querySelector('.popover--attachments')!, { key: 'Escape' })
    expect(root.querySelector('.popover--attachments')).toBeNull()
  })
})

describe('attaching while composing', () => {
  function pick(root: HTMLElement, name: string): void {
    const picker = root.querySelector('.attach-picker') as HTMLInputElement
    fireEvent.change(picker, { target: { files: [new File(['x'], name)] } })
  }

  it('uploads the chosen files on submit and links them', async () => {
    const { root, app } = await mount('')
    type_(root, 'Read the spec')
    fireEvent.click(chip(root, 'Attach'))
    pick(root, 'spec.pdf')
    await act(async () => {
      fireEvent.submit(root.querySelector('.modal')!)
    })
    const ids = app.state.tasks[0]?.attachments ?? []
    expect(ids).toHaveLength(1)
    expect(app.attachmentsById.get(ids[0] as string)?.name).toBe('spec.pdf')
  })

  it('uploads nothing when the modal is cancelled', async () => {
    const { root, app, store } = await mount('')
    type_(root, 'Read the spec')
    fireEvent.click(chip(root, 'Attach'))
    pick(root, 'spec.pdf')
    fireEvent.click(root.querySelector('.modal-cancel')!)
    const files = await store.listFiles(app.attachmentsFolder)
    expect(files.map((f) => f.name)).not.toContain('spec.pdf')
  })
})

describe('task description', () => {
  it('adds the description typed in the composer', async () => {
    const { root, app } = await mount('')
    type_(root, 'Call plumber')
    fireEvent.change(root.querySelector('.add-description')!, {
      target: { value: 'Ask about the boiler' },
    })
    await act(async () => {
      fireEvent.submit(root.querySelector('.modal')!)
    })
    expect(app.state.tasks[0]?.note).toBe('Ask about the boiler')
  })

  it('shows the description under the title, not in it', async () => {
    const { root } = await mount('Buy milk desc:"from the corner shop"\n')
    expect(root.querySelector('.task__text')?.textContent).toBe('Buy milk')
    expect(root.querySelector('.task__note')?.textContent).toBe('from the corner shop')
  })
})

describe('task modal', () => {
  function open(root: HTMLElement, text = 'Buy milk'): Element {
    const row = [...root.querySelectorAll('.task')].find((t) => t.textContent?.includes(text))!
    fireEvent.click(row.querySelector('.task__text')!)
    return root.querySelector('.task-modal')!
  }

  it('opens on the task title with the task in it', async () => {
    const { root } = await mount('Buy milk +groceries desc:"from the corner shop"\n')
    const modal = open(root)
    expect((modal.querySelector('.task-modal__title') as HTMLInputElement).value).toBe('Buy milk')
    expect((modal.querySelector('.task-modal__note') as HTMLInputElement).value).toBe(
      'from the corner shop',
    )
  })

  it('renames the task and keeps its tags', async () => {
    const { root, app } = await mount('Buy milk +groceries\n')
    const modal = open(root)
    const title = modal.querySelector('.task-modal__title')!
    fireEvent.change(title, { target: { value: 'Buy oat milk' } })
    fireEvent.blur(title)
    expect(app.state.tasks[0]?.description).toBe('Buy oat milk +groceries')
  })

  it('writes the description', async () => {
    const { root, app } = await mount('Buy milk\n')
    const modal = open(root)
    const note = modal.querySelector('.task-modal__note')!
    fireEvent.change(note, { target: { value: 'the oat one' } })
    fireEvent.blur(note)
    expect(app.state.tasks[0]?.note).toBe('the oat one')
  })

  it('sets a priority from the sidebar', async () => {
    const { root, app } = await mount('Buy milk\n')
    const modal = open(root)
    fireEvent.click(modal.querySelector('.field--priority .field__value')!)
    fireEvent.click([...modal.querySelectorAll('.priority')].find((b) => b.textContent === '(B)')!)
    expect(app.state.tasks[0]?.priority).toBe('B')
  })

  it('sets a due date from the sidebar', async () => {
    const { root, app } = await mount('Buy milk\n')
    const modal = open(root)
    fireEvent.click(modal.querySelector('.field--date .field__value')!)
    fireEvent.click(modal.querySelector('.quick-date')!)
    expect(app.state.tasks[0]?.pairs['due']).toBe(TODAY)
  })

  it('sets a deadline from the sidebar and shows it on the row', async () => {
    const { root, app } = await mount('File taxes\n')
    const modal = open(root, 'File taxes')
    fireEvent.click(modal.querySelector('.field--deadline .field__value')!)
    expect(modal.querySelector('.field--deadline .repeats')).toBeNull()
    fireEvent.click(modal.querySelector('.field--deadline .quick-date')!)
    expect(app.state.tasks[0]?.pairs['deadline']).toBe(TODAY)
    expect(modal.querySelector('.field--deadline .field__value')?.textContent).toBe('Today')

    fireEvent.keyDown(modal, { key: 'Escape' })
    const chip = root.querySelector('.task__deadline')!
    expect(chip.textContent).toBe('Today')
    expect(chip.className).toContain('deadline--today')
  })

  it('toggles a label from the sidebar', async () => {
    const { root, app } = await mount('Buy milk\nCall plumber +house\n')
    const modal = open(root)
    fireEvent.click(modal.querySelector('.field--labels .field__value')!)
    fireEvent.click(modal.querySelector('.label-option input')!)
    expect(app.state.tasks[0]?.projects).toEqual(['house'])
  })

  it('closes on Escape', async () => {
    const { root } = await mount('Buy milk\n')
    const modal = open(root)
    fireEvent.keyDown(modal, { key: 'Escape' })
    expect(root.querySelector('.task-modal')).toBeNull()
  })
})

describe('task dependencies', () => {
  function open(root: HTMLElement, title: string): Element {
    const text = [...root.querySelectorAll('.task__text')].find((t) => t.textContent === title)!
    fireEvent.click(text)
    return root.querySelector('.task-modal')!
  }

  it('picks a dependency in the modal and dims the row while it is open', async () => {
    const { root, app } = await mount('Buy milk\nBake cake\n')
    const modal = open(root, 'Bake cake')
    fireEvent.click(modal.querySelector('.field--deps .field__value')!)
    const option = [...modal.querySelectorAll('.dep-option')].find((o) =>
      o.textContent?.includes('Buy milk'),
    )!
    fireEvent.click(option)

    expect(modal.querySelector('.field--deps .field__value')?.textContent).toBe('Buy milk')
    expect(app.state.tasks[1]?.pairs['dep']).toBe(app.state.tasks[0]?.pairs['id'])

    fireEvent.keyDown(modal, { key: 'Escape' })
    const row = [...root.querySelectorAll('.task')].find((t) => t.textContent?.includes('Bake cake'))!
    expect(row.className).toContain('task--blocked')
    expect(row.querySelector('.task__blocked')?.textContent).toBe('Waiting on Buy milk')

    fireEvent.click(root.querySelector('.task .task__check')!)
    expect(row.className).not.toContain('task--blocked')
  })

  it('offers neither the task itself nor anything that would loop', async () => {
    const { root } = await mount('A id:aaaaaa dep:bbbbbb\nB id:bbbbbb\nC\n')
    const modal = open(root, 'B')
    fireEvent.click(modal.querySelector('.field--deps .field__value')!)
    const offered = [...modal.querySelectorAll('.dep-option')].map((o) => o.textContent)
    expect(offered).toEqual(['C'])
  })
})
