import type { Task } from './types'
import { daysBetween, isValidDate } from './dates'
import { matchesQuery, parseQuery } from './filterQuery'

export type DueView = 'all' | 'overdue' | 'today' | 'upcoming'

export interface Filter {
  projects: string[]
  contexts: string[]
  priorities: string[]
  search: string
  showCompleted: boolean
  dueView: DueView
}

export function emptyFilter(): Filter {
  return {
    projects: [],
    contexts: [],
    priorities: [],
    search: '',
    showCompleted: false,
    dueView: 'all',
  }
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort()
}

export function collectProjects(tasks: Task[]): string[] {
  return unique(tasks.flatMap((t) => t.projects))
}

export function collectContexts(tasks: Task[]): string[] {
  return unique(tasks.flatMap((t) => t.contexts))
}

export function collectPriorities(tasks: Task[]): string[] {
  return unique(tasks.map((t) => t.priority).filter((p): p is string => p !== undefined))
}

function countBy(tasks: Task[], labelsOf: (task: Task) => string[]): Map<string, number> {
  const counts = new Map(unique(tasks.flatMap(labelsOf)).map((label) => [label, 0]))
  for (const task of tasks) {
    if (task.completed) continue
    for (const label of labelsOf(task)) counts.set(label, (counts.get(label) ?? 0) + 1)
  }
  return counts
}

/** Open-task counts keyed by label, for every label any task carries. */
export function countByProject(tasks: Task[]): Map<string, number> {
  return countBy(tasks, (task) => task.projects)
}

export function countByContext(tasks: Task[]): Map<string, number> {
  return countBy(tasks, (task) => task.contexts)
}

function dueOf(task: Task): string | undefined {
  const due = task.pairs['due']
  return due && isValidDate(due) ? due : undefined
}

function matchesDueView(task: Task, view: DueView, today: string): boolean {
  if (view === 'all') return true
  const due = dueOf(task)
  if (!due) return false
  const delta = daysBetween(today, due)
  if (view === 'overdue') return delta < 0
  if (view === 'today') return delta === 0
  return delta >= 0 && delta <= 7
}

export function filterTasks(tasks: Task[], filter: Filter, today: string): Task[] {
  const query = parseQuery(filter.search)
  return tasks.filter((task) => {
    if (!filter.showCompleted && task.completed) return false
    if (filter.projects.length > 0 && !filter.projects.some((p) => task.projects.includes(p))) {
      return false
    }
    if (filter.contexts.length > 0 && !filter.contexts.some((c) => task.contexts.includes(c))) {
      return false
    }
    if (filter.priorities.length > 0) {
      if (task.priority === undefined || !filter.priorities.includes(task.priority)) return false
    }
    if (query && !matchesQuery(query, task, tasks, today)) return false
    if (!matchesDueView(task, filter.dueView, today)) return false
    return true
  })
}

export function sortTasks(tasks: Task[]): Task[] {
  return tasks
    .map((task, index) => ({ task, index }))
    .sort((a, b) => {
      const byDone = Number(a.task.completed) - Number(b.task.completed)
      if (byDone !== 0) return byDone

      const pa = a.task.priority ?? '~'
      const pb = b.task.priority ?? '~'
      if (pa !== pb) return pa < pb ? -1 : 1

      const da = dueOf(a.task) ?? '9999-99-99'
      const db = dueOf(b.task) ?? '9999-99-99'
      if (da !== db) return da < db ? -1 : 1

      return a.index - b.index
    })
    .map((entry) => entry.task)
}
