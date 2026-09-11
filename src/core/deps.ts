import type { Task } from './types'
import { removePair, setPairValue } from './mutate'
import { parseLine } from './parse'
import { formatTask } from './format'

function reparse(task: Task): Task {
  const next = parseLine(formatTask(task))
  return { ...next, raw: formatTask(next) }
}

function newId(): string {
  return Math.random().toString(36).slice(2, 8).padEnd(6, '0')
}

/** A task only gets an id:xxxxxx word once something needs to point at it. */
export function ensureId(task: Task): Task {
  if (task.pairs['id']) return task
  return reparse({ ...task, description: setPairValue(task.description, 'id', newId()) })
}

export function setDependency(task: Task, id: string | null): Task {
  return reparse({
    ...task,
    description: id ? setPairValue(task.description, 'dep', id) : removePair(task.description, 'dep'),
  })
}

function findById(tasks: Task[], id: string): Task | undefined {
  return tasks.find((task) => task.pairs['id'] === id)
}

/** The open task this one waits on, if it still exists. */
export function blockerOf(task: Task, tasks: Task[]): Task | undefined {
  const id = task.pairs['dep']
  if (!id) return undefined
  const dep = findById(tasks, id)
  return dep && !dep.completed ? dep : undefined
}

export function isBlocked(task: Task, tasks: Task[]): boolean {
  return blockerOf(task, tasks) !== undefined
}

/** Whether making `task` depend on `target` would close a loop. */
export function wouldCycle(task: Task, target: Task, tasks: Task[]): boolean {
  let current: Task | undefined = target
  const seen = new Set<Task>()
  while (current) {
    if (current === task) return true
    if (seen.has(current)) return false
    seen.add(current)
    const id: string | undefined = current.pairs['dep']
    current = id ? findById(tasks, id) : undefined
  }
  return false
}
