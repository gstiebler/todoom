import type { Task } from './types'
import { parseLine, normalizeLine } from './parse'
import { formatTask } from './format'

function pairPattern(key: string): RegExp {
  return new RegExp(`(?:^|\\s)${key}:[^\\s:/][^\\s:]*(?=\\s|$)`)
}

export function setPairValue(description: string, key: string, value: string): string {
  const re = pairPattern(key)
  if (re.test(description)) {
    return normalizeLine(description.replace(re, ` ${key}:${value}`))
  }
  return normalizeLine(`${description} ${key}:${value}`)
}

export function removePair(description: string, key: string): string {
  return normalizeLine(description.replace(pairPattern(key), ''))
}

function reparse(task: Task): Task {
  const next = parseLine(formatTask(task))
  return { ...next, raw: task.raw }
}

export function complete(task: Task, today: string): Task {
  if (task.completed) return task
  let description = task.description
  if (task.priority) description = setPairValue(description, 'pri', task.priority)
  return reparse({
    ...task,
    completed: true,
    completionDate: today,
    priority: undefined,
    description,
  })
}

export function uncomplete(task: Task): Task {
  if (!task.completed) return task
  const priority = task.pairs['pri']
  const description = priority ? removePair(task.description, 'pri') : task.description
  return reparse({
    ...task,
    completed: false,
    completionDate: undefined,
    priority,
    description,
  })
}

export function createTask(input: string, today: string): Task {
  const parsed = parseLine(input)
  if (parsed.creationDate) return parsed
  return reparse({ ...parsed, creationDate: today })
}
