import type { Task } from '../core/types'
import type { DueView } from '../core/query'
import type { TodoomApp } from '../app/state'
import { collectProjects, collectContexts, collectPriorities } from '../core/query'
import { daysBetween, isValidDate } from '../core/dates'
import { formatTask } from '../core/format'

const STATUS_TEXT: Record<string, string> = {
  idle: '',
  dirty: 'Unsaved changes',
  saving: 'Saving…',
  saved: 'Saved',
  error: '',
}

export function describeTask(task: Task, today: string): { classes: string[]; dueLabel: string } {
  const classes: string[] = ['task']
  if (task.completed) classes.push('task--done')

  const due = task.pairs['due']
  if (!due || !isValidDate(due)) return { classes, dueLabel: '' }

  const delta = daysBetween(today, due)
  if (!task.completed && delta < 0) {
    classes.push('task--overdue')
    return { classes, dueLabel: `Overdue ${due}` }
  }
  if (!task.completed && delta === 0) {
    classes.push('task--today')
    return { classes, dueLabel: 'Due today' }
  }
  return { classes, dueLabel: `Due ${due}` }
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

function renderDescription(task: Task): HTMLElement {
  const span = el('span', 'task__text')
  for (const word of task.description.split(' ')) {
    if (word.startsWith('+') && word.length > 1) {
      span.appendChild(el('span', 'tag tag--project', word))
    } else if (word.startsWith('@') && word.length > 1) {
      span.appendChild(el('span', 'tag tag--context', word))
    } else if (/^(due|rec|pri):/.test(word)) {
      continue
    } else {
      span.appendChild(document.createTextNode(word))
    }
    span.appendChild(document.createTextNode(' '))
  }
  if (span.childNodes.length === 0) span.textContent = task.description
  return span
}

function toggleIn(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
}

export function render(root: HTMLElement, app: TodoomApp, today: string): void {
  const rerender = () => render(root, app, today)
  root.textContent = ''

  const container = el('div', 'app')
  const sidebar = el('aside', 'sidebar')
  const main = el('main', 'main')
  container.append(sidebar, main)
  root.appendChild(container)

  // Sidebar header
  const topbar = el('div', 'topbar')
  topbar.appendChild(el('h1', undefined, 'Todoom'))
  const status = el(
    'span',
    app.state.saveState === 'error' ? 'status status--error' : 'status',
    app.state.saveState === 'error'
      ? (app.state.error ?? 'Save failed')
      : STATUS_TEXT[app.state.saveState],
  )
  topbar.appendChild(status)
  if (app.state.saveState === 'error') {
    const retry = el('button', 'status__retry', 'Retry')
    retry.addEventListener('click', () => {
      void app.save().then(rerender)
    })
    topbar.appendChild(retry)
  }
  sidebar.appendChild(topbar)

  // Search
  const search = el('input', 'search')
  search.placeholder = 'Search'
  search.value = app.state.filter.search
  search.addEventListener('input', () => {
    app.setFilter({ search: search.value })
    const restore = search.selectionStart
    rerender()
    const next = root.querySelector<HTMLInputElement>('.search')
    next?.focus()
    if (restore !== null) next?.setSelectionRange(restore, restore)
  })
  sidebar.appendChild(search)

  // Due views — one exclusive choice
  const views = el('nav', 'views')
  const viewLabels: Array<[DueView, string]> = [
    ['all', 'All'],
    ['overdue', 'Overdue'],
    ['today', 'Today'],
    ['upcoming', 'Upcoming'],
  ]
  for (const [view, label] of viewLabels) {
    const active = app.state.filter.dueView === view
    const button = el('button', active ? 'view-btn view-btn--active' : 'view-btn', label)
    button.addEventListener('click', () => {
      app.setFilter({ dueView: view })
      rerender()
    })
    views.appendChild(button)
  }
  sidebar.appendChild(views)

  // Completed is an independent toggle, not one of the exclusive views above,
  // so it lives in its own group where it cannot look like a sibling of "All".
  const toggles = el('div', 'toggles')
  const showDone = el(
    'button',
    app.state.filter.showCompleted ? 'toggle-btn toggle-btn--active' : 'toggle-btn',
    'Show completed',
  )
  showDone.addEventListener('click', () => {
    app.setFilter({ showCompleted: !app.state.filter.showCompleted })
    rerender()
  })
  toggles.appendChild(showDone)
  sidebar.appendChild(toggles)

  // Filter chips, grouped by kind
  const addChip = (into: HTMLElement, label: string, active: boolean, onClick: () => void) => {
    const chip = el('button', active ? 'chip chip--active' : 'chip', label)
    chip.addEventListener('click', () => {
      onClick()
      rerender()
    })
    into.appendChild(chip)
  }
  // A chip whose last task is gone must keep rendering while it is selected,
  // or the filter it holds becomes impossible to clear from the UI.
  const withSelected = (collected: string[], selected: string[]): string[] =>
    [...new Set([...collected, ...selected])].sort()

  // An empty group would leave a heading with nothing under it, so each one is
  // only added to the sidebar once it has at least one chip.
  const chipGroup = (heading: string): HTMLElement => {
    const section = el('section', 'filters')
    section.appendChild(el('h2', 'filters__heading', heading))
    return section
  }
  const commitGroup = (section: HTMLElement, values: string[]) => {
    if (values.length > 0) sidebar.appendChild(section)
  }

  const priorities = withSelected(collectPriorities(app.state.tasks), app.state.filter.priorities)
  const priorityGroup = chipGroup('Priority')
  for (const priority of priorities) {
    addChip(priorityGroup, `(${priority})`, app.state.filter.priorities.includes(priority), () =>
      app.setFilter({ priorities: toggleIn(app.state.filter.priorities, priority) }),
    )
  }
  commitGroup(priorityGroup, priorities)

  const projects = withSelected(collectProjects(app.state.tasks), app.state.filter.projects)
  const projectGroup = chipGroup('Projects')
  for (const project of projects) {
    addChip(projectGroup, `+${project}`, app.state.filter.projects.includes(project), () =>
      app.setFilter({ projects: toggleIn(app.state.filter.projects, project) }),
    )
  }
  commitGroup(projectGroup, projects)

  const contexts = withSelected(collectContexts(app.state.tasks), app.state.filter.contexts)
  const contextGroup = chipGroup('Contexts')
  for (const context of contexts) {
    addChip(contextGroup, `@${context}`, app.state.filter.contexts.includes(context), () =>
      app.setFilter({ contexts: toggleIn(app.state.filter.contexts, context) }),
    )
  }
  commitGroup(contextGroup, contexts)

  const archiveButton = el('button', 'archive-btn', 'Archive completed')
  archiveButton.addEventListener('click', () => {
    void app.archive().then(rerender)
  })
  sidebar.appendChild(archiveButton)

  // Add form
  const form = el('form', 'add-form')
  const input = el('input', 'add-input')
  input.placeholder = '(A) Call plumber +house @phone due:2026-09-12'
  form.appendChild(input)
  form.appendChild(el('button', undefined, 'Add'))
  form.addEventListener('submit', (event) => {
    event.preventDefault()
    app.addTask(input.value)
    input.value = ''
    rerender()
  })
  main.appendChild(form)

  // Task list
  const visible = app.visibleTasks()
  if (visible.length === 0) {
    main.appendChild(el('p', 'empty', 'Nothing here.'))
    return
  }

  const list = el('ul', 'task-list')
  for (const task of visible) {
    const index = app.indexOf(task)
    const { classes, dueLabel } = describeTask(task, today)
    const row = el('li', classes.join(' '))

    const check = el('input', 'task__check')
    check.type = 'checkbox'
    check.checked = task.completed
    check.addEventListener('change', () => {
      app.toggleComplete(index)
      rerender()
    })
    row.appendChild(check)

    if (task.priority) row.appendChild(el('span', 'task__pri', `(${task.priority})`))

    const text = renderDescription(task)
    text.addEventListener('click', () => {
      const editor = el('input', 'task__editor')
      editor.value = formatTask(task)
      const commit = () => {
        app.editTask(index, editor.value)
        rerender()
      }
      editor.addEventListener('blur', commit)
      editor.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') commit()
        if (event.key === 'Escape') rerender()
      })
      row.replaceChild(editor, text)
      editor.focus()
    })
    row.appendChild(text)

    if (task.pairs['rec']) row.appendChild(el('span', 'task__badge', `repeats ${task.pairs['rec']}`))
    if (dueLabel) row.appendChild(el('span', 'task__due', dueLabel))

    const remove = el('button', 'task__delete', '×')
    remove.title = 'Delete'
    remove.addEventListener('click', () => {
      app.deleteTask(index)
      rerender()
    })
    row.appendChild(remove)

    list.appendChild(row)
  }
  main.appendChild(list)
}
