// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { App } from './App'
import { TodoomApp } from '../app/state'
import { FakeStore } from '../drive/fakeStore'
import { FakeModel } from '../app/fakeModel'

const TODAY = '2026-09-10'

async function mount(seed: string, model = new FakeModel('unavailable')) {
  const store = new FakeStore({ 'todo.txt': seed })
  await store.signIn()
  const app = new TodoomApp(store, () => TODAY, model)
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
  return [...root.querySelectorAll('.chip, .labels__label')].map((c) => c.textContent ?? '')
}

function heading(root: HTMLElement, name: string): Element {
  return [...root.querySelectorAll('.labels__heading')].find((h) =>
    h.textContent?.includes(name),
  )!
}

function row(root: HTMLElement, label: string): Element {
  return [...root.querySelectorAll('.labels__row')].find(
    (r) => r.querySelector('.labels__label')?.textContent === label,
  )!
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

  it('filters by project when a label row is clicked', async () => {
    const { root, app } = await mount('a +house\nb +work\n')
    fireEvent.click(heading(root, 'Projects'))
    fireEvent.click(row(root, '+house'))
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

describe('label sections', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => localStorage.clear())

  it('starts collapsed with a glyph and no rows', async () => {
    const { root } = await mount('a +house @phone\n')
    expect(heading(root, 'Projects').textContent).toBe('▸ Projects')
    expect(heading(root, 'Contexts').textContent).toBe('▸ Contexts')
    expect(root.querySelectorAll('.labels__row')).toHaveLength(0)
  })

  it('expands to rows with open-task counts', async () => {
    const { root } = await mount('a +house\nb +house\nx 2026-09-09 c +old\n')
    fireEvent.click(heading(root, 'Projects'))
    expect(heading(root, 'Projects').textContent).toBe('▾ Projects')
    const rows = [...root.querySelectorAll('.labels__row')].map((r) => [
      r.querySelector('.labels__label')?.textContent,
      r.querySelector('.labels__count')?.textContent,
    ])
    expect(rows).toEqual([
      ['+house', '2'],
      ['+old', '0'],
    ])
  })

  it('marks the active row and keeps the section open while selected', async () => {
    const { root, app } = await mount('a +house\nb +work\n')
    act(() => app.setFilter({ projects: ['house'] }))
    expect(row(root, '+house').classList.contains('labels__row--active')).toBe(true)
    expect(heading(root, 'Projects').textContent).toBe('▾ Projects (1)')
    fireEvent.click(heading(root, 'Projects'))
    expect(heading(root, 'Projects').textContent).toBe('▾ Projects')
    fireEvent.click(heading(root, 'Projects'))
    expect(root.querySelectorAll('.labels__row')).toHaveLength(2)
    expect(heading(root, 'Projects').textContent).toBe('▾ Projects (1)')
    fireEvent.click(row(root, '+house'))
    expect(root.querySelectorAll('.labels__row')).toHaveLength(0)
    expect(heading(root, 'Projects').textContent).toBe('▸ Projects')
  })

  it('shows how many selections hold a collapsed section open', async () => {
    const { root, app } = await mount('a +house\nb +work\n')
    act(() => app.setFilter({ projects: ['house', 'work'] }))
    fireEvent.click(heading(root, 'Projects'))
    fireEvent.click(heading(root, 'Projects'))
    act(() => app.setFilter({ projects: ['house'] }))
    expect(heading(root, 'Projects').textContent).toBe('▾ Projects (1)')
  })

  it('remembers the open state across a remount', async () => {
    const first = await mount('a @phone\n')
    fireEvent.click(heading(first.root, 'Contexts'))
    expect(localStorage.getItem('todoom.labels.contexts')).toBe('open')
    cleanup()
    const second = await mount('a @phone\n')
    expect(second.root.querySelectorAll('.labels__row')).toHaveLength(1)
    fireEvent.click(heading(second.root, 'Contexts'))
    expect(localStorage.getItem('todoom.labels.contexts')).toBeNull()
  })

  it('hides a section that has no labels', async () => {
    const { root } = await mount('a +house\n')
    expect(heading(root, 'Contexts')).toBeUndefined()
  })
})

describe('sidebar layout', () => {
  it('keeps the completed toggle out of the exclusive view group', async () => {
    const { root } = await mount('Buy milk\n')
    const views = [...root.querySelectorAll('.views .view-btn')].map((b) => b.textContent)
    expect(views).toEqual(['All', 'Overdue', 'Today', 'Upcoming', 'Stats', 'Columns', 'Gantt'])

    const toggle = root.querySelector<HTMLButtonElement>('.toggles .toggle-btn')
    expect(toggle?.textContent).toBe('Show completed')
    expect(toggle?.className).not.toContain('view-btn')
  })

  it('puts the controls in the sidebar and the tasks in the main pane', async () => {
    const { root } = await mount('Buy milk +house\n')
    expect(root.querySelector('.sidebar .search')).not.toBeNull()
    expect(root.querySelector('.sidebar .labels__heading')?.textContent).toBe('▸ Projects')
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
        name: 'notes.txt',
        webViewLink: 'https://drive.example/known',
        mimeType: 'text/plain',
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
    expect(root.querySelector('.popover--attachments')?.textContent).toContain('notes.txt')
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

  async function withPreviewable() {
    const mounted = await mount('Buy milk file:img file:zip\n')
    await act(async () => {
      mounted.app.attachmentsById.set('img', {
        id: 'img',
        name: 'photo.png',
        webViewLink: 'https://drive.example/img',
        mimeType: 'image/png',
      })
      mounted.app.attachmentsById.set('zip', {
        id: 'zip',
        name: 'bundle.zip',
        webViewLink: 'https://drive.example/zip',
        mimeType: 'application/zip',
      })
    })
    fireEvent.click(mounted.root.querySelector('.task__attach')!)
    return mounted
  }

  it('offers a preview button for images and a link for other files', async () => {
    const { root } = await withPreviewable()
    expect(root.querySelector('.attachment__preview')?.textContent).toBe('photo.png')
    expect(root.querySelector('.attachment__link')?.textContent).toBe('bundle.zip')
  })

  it('opens the Drive preview in a modal and closes it on Escape', async () => {
    const { root } = await withPreviewable()
    const previewButton = root.querySelector<HTMLButtonElement>('.attachment__preview')!
    previewButton.focus()
    fireEvent.click(previewButton)
    // The modal portals to document.body, outside the render container.
    const frame = document.body.querySelector<HTMLIFrameElement>('.preview__frame')
    expect(frame?.getAttribute('src')).toBe('https://drive.google.com/file/d/img/preview')
    expect(document.body.querySelector('.preview__title')?.textContent).toBe('photo.png')
    expect(document.body.querySelector<HTMLAnchorElement>('.preview__open')?.href).toBe(
      'https://drive.example/img',
    )
    expect(document.body.querySelector('.preview__loading')).not.toBeNull()
    fireEvent.load(frame!)
    expect(document.body.querySelector('.preview__loading')).toBeNull()
    // Fired on the focused button, the way a real Escape keypress bubbles, so
    // it exercises the popover's own onKeyDown rather than bypassing it.
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(document.body.querySelector('.preview')).toBeNull()
    expect(root.querySelector('.popover--attachments')).not.toBeNull()
  })

  it('leaves the task modal open when Escape only closes its preview', async () => {
    const { root, app } = await mount('Buy milk file:img\n')
    await act(async () => {
      app.attachmentsById.set('img', {
        id: 'img',
        name: 'photo.png',
        webViewLink: 'https://drive.example/img',
        mimeType: 'image/png',
      })
    })
    fireEvent.click(root.querySelector('.task__text')!)
    expect(root.querySelector('.task-modal')).not.toBeNull()
    const previewButton = root.querySelector<HTMLButtonElement>('.attachment__preview')!
    fireEvent.click(previewButton)
    expect(document.body.querySelector('.preview')).not.toBeNull()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(document.body.querySelector('.preview')).toBeNull()
    expect(root.querySelector('.task-modal')).not.toBeNull()
  })

  it('closes the preview from its button and its backdrop', async () => {
    const { root } = await withPreviewable()
    fireEvent.click(root.querySelector('.attachment__preview')!)
    fireEvent.click(document.body.querySelector('.preview__close')!)
    expect(document.body.querySelector('.preview')).toBeNull()
    fireEvent.click(root.querySelector('.attachment__preview')!)
    fireEvent.click(document.body.querySelector('.preview')!.parentElement!)
    expect(document.body.querySelector('.preview')).toBeNull()
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

describe('stats page', () => {
  it('opens from the sidebar and draws the history', async () => {
    const { root, app } = await mount('x 2026-09-10 Buy milk\nCall plumber\n')
    fireEvent.click([...root.querySelectorAll('.view-btn')].find((b) => b.textContent === 'Stats')!)
    await waitFor(() => expect(root.querySelector('.streak__grid')).not.toBeNull())
    expect(app.state.archived).toEqual([])
    expect(root.querySelector('.add-task')).toBeNull()
    expect(root.querySelectorAll('.streak__day')).toHaveLength(52 * 7)
    expect(root.querySelectorAll('.streak__day--4')).toHaveLength(1)
    expect(root.querySelector('.stats__note')?.textContent).toBe('1 day running')

    fireEvent.click([...root.querySelectorAll('.view-btn')].find((b) => b.textContent === 'All')!)
    expect(root.querySelector('.add-task')).not.toBeNull()
  })
})

describe('smart filters', () => {
  it('narrows the list with a query', async () => {
    const { root } = await mount('a +house @phone\nb +house\nc @phone\n')
    fireEvent.change(root.querySelector('.search')!, { target: { value: '+house & !@phone' } })
    const rows = [...root.querySelectorAll('.task__text')].map((el) => el.textContent)
    expect(rows).toEqual(['b'])
  })

  it('shows a parse error and keeps the previous list', async () => {
    const { root } = await mount('a +house\nb +work\n')
    const search = root.querySelector('.search')!
    fireEvent.change(search, { target: { value: '+house' } })
    fireEvent.change(search, { target: { value: '+house |' } })
    expect(root.querySelector('.query-error')?.textContent).toBe('Missing a term at the end')
    expect(root.querySelectorAll('.task')).toHaveLength(1)
    expect(root.querySelector('.save-filter')).toBeNull()
  })

  it('saves the query as a filter and lists it in the sidebar', async () => {
    const { root, app } = await mount('a +house\nb +work\n')
    expect(root.querySelector('.saved')).toBeNull()
    fireEvent.change(root.querySelector('.search')!, { target: { value: '+house' } })
    fireEvent.click(root.querySelector('.save-filter')!)
    fireEvent.change(root.querySelector('.save-filter__name')!, { target: { value: 'House' } })
    fireEvent.submit(root.querySelector('.save-filter__form')!)
    await waitFor(() =>
      expect(app.state.filters).toEqual([{ name: 'House', query: '+house', column: false }]),
    )
    expect(root.querySelector('.save-filter__form')).toBeNull()
    expect([...root.querySelectorAll('.saved .view-btn')].map((b) => b.textContent)).toEqual(['House'])
  })

  it('applies a saved filter and clears the chips', async () => {
    const { root, app } = await mount('a +house\nb +work\n')
    await app.saveFilter('Work', '+work')
    act(() => {
      app.setFilter({ projects: ['house'], dueView: 'today' })
      app.showPage('stats')
    })
    fireEvent.click([...root.querySelectorAll('.saved .view-btn')][0]!)
    expect(app.state.page).toBe('tasks')
    expect(app.state.filter).toEqual({ ...app.state.filter, projects: [], dueView: 'all', search: '+work' })
    expect(root.querySelector('.saved .view-btn--active')?.textContent).toBe('Work')
    expect([...root.querySelectorAll('.task__text')].map((el) => el.textContent)).toEqual(['b'])
  })

  it('deletes a saved filter', async () => {
    const { root, app } = await mount('a\n')
    await app.saveFilter('Work', '+work')
    fireEvent.click(root.querySelector('[aria-label="Delete Work"]')!)
    await waitFor(() => expect(app.state.filters).toEqual([]))
    expect(root.querySelector('.saved')).toBeNull()
  })
})

describe('describe a filter', () => {
  it('hides the button without a model', async () => {
    const { root } = await mount('a\n')
    expect(root.querySelector('.ask-filter')).toBeNull()
  })

  it('puts the answer into the search box', async () => {
    const model = new FakeModel('available', ['+house'])
    const { root } = await mount('a +house\nb +work\n', model)
    await waitFor(() => expect(root.querySelector('.ask-filter')).not.toBeNull())
    fireEvent.click(root.querySelector('.ask-filter')!)
    fireEvent.change(root.querySelector('.ask-filter__text')!, { target: { value: 'house' } })
    fireEvent.submit(root.querySelector('.ask-filter__form')!)
    await waitFor(() => expect(root.querySelector<HTMLInputElement>('.search')?.value).toBe('+house'))
    expect(root.querySelector('.ask-filter__form')).toBeNull()
    expect(root.querySelectorAll('.task')).toHaveLength(1)
  })

  it('keeps the form open with the error', async () => {
    const model = new FakeModel('downloadable', ['+house |', '|'])
    const { root } = await mount('a +house\n', model)
    await waitFor(() => expect(root.querySelector('.ask-filter')).not.toBeNull())
    fireEvent.click(root.querySelector('.ask-filter')!)
    fireEvent.change(root.querySelector('.ask-filter__text')!, { target: { value: 'house' } })
    fireEvent.submit(root.querySelector('.ask-filter__form')!)
    await waitFor(() => expect(root.querySelector('.ask-filter__form .query-error')).not.toBeNull())
    expect(root.querySelector('.ask-filter__form .query-error')?.textContent).toBe('Unexpected |')
    expect(root.querySelector<HTMLInputElement>('.search')?.value).toBe('')
  })
})

describe('columns', () => {
  it('shows a hint until a filter is ticked', async () => {
    const { root, app } = await mount('a +house\n')
    act(() => app.showPage('columns'))
    expect(root.querySelector('.columns__empty')?.textContent).toBe(
      'Tick a saved filter in the sidebar to show it here.',
    )
  })

  it('renders one column per ticked filter with its tasks', async () => {
    const { root, app } = await mount('a +house\nb +work\nx c +house\n')
    await app.saveFilter('House', '+house')
    await app.saveFilter('Work', '+work')
    fireEvent.click(root.querySelector('[aria-label="Show House as a column"]')!)
    await waitFor(() => expect(app.columnFilters).toHaveLength(1))
    act(() => app.setFilter({ search: '+work' }))
    fireEvent.click([...root.querySelectorAll('.view-btn')].find((b) => b.textContent === 'Columns')!)
    expect(root.querySelectorAll('.column')).toHaveLength(1)
    expect(root.querySelector('.column__heading')?.textContent).toBe('House')
    expect(root.querySelector('.column__count')?.textContent).toBe('1')
    expect([...root.querySelectorAll('.column .task__text')].map((el) => el.textContent)).toEqual(['a'])
    expect(root.querySelector('.add-task')).toBeNull()
  })

  it('shows completed tasks in a column once the sidebar toggle is on', async () => {
    const { root, app } = await mount('a +house\nx b +house\n')
    await app.saveFilter('House', '+house')
    await app.setColumn('House', true)
    act(() => app.showPage('columns'))
    expect(root.querySelector('.column__count')?.textContent).toBe('1')
    act(() => app.setFilter({ showCompleted: true }))
    expect(root.querySelector('.column__count')?.textContent).toBe('2')
  })

  it('completes a task from a column', async () => {
    const { root, app } = await mount('a +house\n')
    await app.saveFilter('House', '+house')
    await app.setColumn('House', true)
    act(() => app.showPage('columns'))
    fireEvent.click(root.querySelector('.column .task__check')!)
    expect(app.state.tasks[0]?.completed).toBe(true)
    expect(root.querySelector('.column__count')?.textContent).toBe('0')
  })

  it('shows the parse error in a broken column', async () => {
    const { root, app } = await mount('a\n')
    await app.saveFilter('Bad', '+house |')
    await app.setColumn('Bad', true)
    act(() => app.showPage('columns'))
    expect(root.querySelector('.column .query-error')?.textContent).toBe('Missing a term at the end')
  })
})

describe('gantt', () => {
  function openGantt(root: HTMLElement) {
    fireEvent.click([...root.querySelectorAll('.view-btn')].find((b) => b.textContent === 'Gantt')!)
  }

  it('shows a hint when no task has a date', async () => {
    const { root } = await mount('Buy milk\n')
    openGantt(root)
    expect(root.querySelector('.gantt__empty')?.textContent).toBe(
      'Give a task a due date or a deadline to see it here.',
    )
  })

  it('draws one bar per dated task at the day column', async () => {
    const { root } = await mount('Buy milk\nCall due:2026-09-14\n')
    openGantt(root)
    const bars = root.querySelectorAll('.gantt__bar')
    expect(bars).toHaveLength(1)
    // Range starts 3 days before today (2026-09-07); today is column 3.
    expect(bars[0]?.getAttribute('x')).toBe(String(3 * 28))
    expect(bars[0]?.getAttribute('width')).toBe(String(5 * 28))
    expect(root.querySelectorAll('.gantt__row')).toHaveLength(1)
  })

  it('marks an overdue bar and draws a deadline tick', async () => {
    const { root } = await mount('Call due:2026-09-01 deadline:2026-09-20\n')
    openGantt(root)
    expect(root.querySelector('.gantt__bar--overdue')).not.toBeNull()
    expect(root.querySelectorAll('.gantt__deadline')).toHaveLength(1)
  })

  it('draws an arrow between a blocker and its dependant', async () => {
    const { root } = await mount('A id:aaaaaa due:2026-09-12\nB dep:aaaaaa due:2026-09-15\n')
    openGantt(root)
    expect(root.querySelectorAll('.gantt__arrow')).toHaveLength(1)
  })

  it('opens the task modal from a bar', async () => {
    const { root, app } = await mount('Call due:2026-09-14\n')
    openGantt(root)
    fireEvent.click(root.querySelector('.gantt__bar')!)
    expect(root.querySelector('.task-modal__title')).toHaveProperty('value', 'Call')
    const title = root.querySelector('.task-modal__title')!
    fireEvent.change(title, { target: { value: 'Call mum' } })
    fireEvent.blur(title)
    expect(root.querySelector('.task-modal__title')).toHaveProperty('value', 'Call mum')
    expect(app.state.tasks[0]?.description.startsWith('Call mum')).toBe(true)
  })

  it('keeps a row rendered when the search cannot parse', async () => {
    const { root } = await mount('Call due:2026-09-14\n')
    fireEvent.change(root.querySelector('.search')!, { target: { value: '(A' } })
    openGantt(root)
    expect(root.querySelectorAll('.gantt__row')).toHaveLength(1)
  })

  it('routes an arrow around the blocker when the dependant starts earlier', async () => {
    const { root } = await mount('A id:aaaaaa due:2026-09-15\nB dep:aaaaaa due:2026-09-12\n')
    openGantt(root)
    const arrows = root.querySelectorAll('.gantt__arrow')
    expect(arrows).toHaveLength(1)
    expect(arrows[0]?.getAttribute('d')?.match(/V/g)?.length).toBeGreaterThanOrEqual(2)
  })

  it('narrows the rows with the sidebar search', async () => {
    const { root } = await mount('Call +house due:2026-09-14\nPay +bills due:2026-09-15\n')
    fireEvent.change(root.querySelector('.search')!, { target: { value: '+house' } })
    openGantt(root)
    expect(root.querySelectorAll('.gantt__row')).toHaveLength(1)
  })

  it('hides completed tasks unless show completed is on', async () => {
    const { root } = await mount('x 2026-09-01 Call due:2026-09-14\n')
    openGantt(root)
    expect(root.querySelector('.gantt__empty')).not.toBeNull()
    fireEvent.click(root.querySelector('.toggles .toggle-btn')!)
    expect(root.querySelectorAll('.gantt__row')).toHaveLength(1)
  })
})

describe('search modal', () => {
  function openSearch(root: HTMLElement) {
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    return root.querySelector<HTMLInputElement>('.search-modal__input')!
  }

  it('opens with Ctrl+K and focuses the query', async () => {
    const { root } = await mount('Buy milk\n')
    const input = openSearch(root)
    expect(input).not.toBeNull()
    expect(document.activeElement).toBe(input)
  })

  it('opens with Cmd+K', async () => {
    const { root } = await mount('Buy milk\n')
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    expect(root.querySelector('.search-modal')).not.toBeNull()
  })

  it('opens with / when nothing is focused', async () => {
    const { root } = await mount('Buy milk\n')
    fireEvent.keyDown(window, { key: '/' })
    expect(root.querySelector('.search-modal')).not.toBeNull()
  })

  it('ignores / while an input is focused', async () => {
    const { root } = await mount('Buy milk\n')
    root.querySelector<HTMLInputElement>('.search')!.focus()
    fireEvent.keyDown(window, { key: '/' })
    expect(root.querySelector('.search-modal')).toBeNull()
  })

  it('ignores the shortcut while another modal is open', async () => {
    const { root } = await mount('Buy milk\n')
    fireEvent.click(root.querySelector('.add-task')!)
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    expect(root.querySelector('.search-modal')).toBeNull()
  })

  it('keeps owning Ctrl+K while open and prevents the browser default', async () => {
    const { root } = await mount('Buy milk\n')
    openSearch(root)
    const event = new KeyboardEvent('keydown', {
      key: 'k',
      ctrlKey: true,
      cancelable: true,
      bubbles: true,
    })
    act(() => {
      window.dispatchEvent(event)
    })
    expect(event.defaultPrevented).toBe(true)
    expect(root.querySelectorAll('.search-modal')).toHaveLength(1)
  })

  it('closes on Escape even after the input loses focus', async () => {
    const { root, app } = await mount('Call +house\nBuy milk\n')
    fireEvent.change(root.querySelector('.search')!, { target: { value: 'milk' } })
    const input = openSearch(root)
    fireEvent.change(input, { target: { value: 'nothing' } })
    fireEvent.click(root.querySelector('.search-modal__results')!)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(root.querySelector('.search-modal')).toBeNull()
    expect(app.state.filter.search).toBe('milk')
  })

  it('narrows the preview and the list behind while typing', async () => {
    const { root, app } = await mount('Call +house\nBuy milk +groceries\nA +house\n')
    const input = openSearch(root)
    fireEvent.change(input, { target: { value: '+house' } })
    expect(app.state.filter.search).toBe('+house')
    expect(root.querySelectorAll('.search-modal__row')).toHaveLength(2)
    expect(root.querySelectorAll('.task')).toHaveLength(2)
  })

  it('shows at most eight preview rows', async () => {
    const seed = Array.from({ length: 10 }, (_, i) => `Task ${i}`).join('\n') + '\n'
    const { root } = await mount(seed)
    openSearch(root)
    expect(root.querySelectorAll('.search-modal__row')).toHaveLength(8)
  })

  it('keeps the query on Enter and restores it on Escape', async () => {
    const { root, app } = await mount('Call +house\nBuy milk\n')
    fireEvent.change(root.querySelector('.search')!, { target: { value: 'milk' } })
    let input = openSearch(root)
    fireEvent.change(input, { target: { value: '+house' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(root.querySelector('.search-modal')).toBeNull()
    expect(app.state.filter.search).toBe('+house')

    input = openSearch(root)
    fireEvent.change(input, { target: { value: 'nothing' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(root.querySelector('.search-modal')).toBeNull()
    expect(app.state.filter.search).toBe('+house')
  })

  it('closes on backdrop click keeping the query', async () => {
    const { root, app } = await mount('Buy milk\n')
    const input = openSearch(root)
    fireEvent.change(input, { target: { value: 'milk' } })
    fireEvent.click(root.querySelector('.modal-backdrop')!)
    expect(root.querySelector('.search-modal')).toBeNull()
    expect(app.state.filter.search).toBe('milk')
  })

  it('shows the query error under the input', async () => {
    const { root } = await mount('Buy milk\n')
    const input = openSearch(root)
    fireEvent.change(input, { target: { value: '(+home' } })
    expect(root.querySelector('.search-modal .query-error')).not.toBeNull()
  })

  it('opens the picked task in its modal', async () => {
    const { root } = await mount('Buy milk due:2026-09-11 +groceries\n')
    openSearch(root)
    const row = root.querySelector('.search-modal__row')!
    expect(row.textContent).toContain('Buy milk')
    expect(row.textContent).toContain('Tomorrow')
    expect(row.textContent).toContain('+groceries')
    fireEvent.click(row)
    expect(root.querySelector('.search-modal')).toBeNull()
    expect(root.querySelector<HTMLInputElement>('.task-modal__title')?.value).toBe('Buy milk')
  })

  it('switches to the tasks page when opened elsewhere', async () => {
    const { root, app } = await mount('Buy milk\n')
    app.showPage('stats')
    openSearch(root)
    expect(app.state.page).toBe('tasks')
  })

  it('has a search button in the sidebar that opens the modal', async () => {
    const { root } = await mount('Buy milk\n')
    fireEvent.click(root.querySelector('[aria-label="Search"]')!)
    expect(root.querySelector('.search-modal')).not.toBeNull()
  })
})
