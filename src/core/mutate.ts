import type { Task } from './types'
import { parseLine, normalizeLine, NOTE_RE } from './parse'
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
  return { ...next, raw: formatTask(next) }
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

export function addAttachment(task: Task, id: string): Task {
  if (task.attachments.includes(id)) return task
  return reparse({ ...task, description: normalizeLine(`${task.description} file:${id}`) })
}

export function removeAttachment(task: Task, id: string): Task {
  const re = new RegExp(`(?:^|\\s)file:${id}(?=\\s|$)`)
  return reparse({ ...task, description: normalizeLine(task.description.replace(re, '')) })
}

export function setNote(task: Task, note: string): Task {
  const without = normalizeLine(task.description.replace(NOTE_RE, ''))
  // A quote would end the word early, and no note is worth breaking the line for.
  const text = note.trim().replace(/"/g, "'")
  const description = text.length > 0 ? `${without} desc:"${text}"`.trim() : without
  return reparse({ ...task, description })
}

export function setDue(task: Task, due: string | null): Task {
  return reparse({
    ...task,
    description: due ? setPairValue(task.description, 'due', due) : removePair(task.description, 'due'),
  })
}

export function setDeadline(task: Task, deadline: string | null): Task {
  return reparse({
    ...task,
    description: deadline
      ? setPairValue(task.description, 'deadline', deadline)
      : removePair(task.description, 'deadline'),
  })
}

export function setRec(task: Task, rec: string | null): Task {
  return reparse({
    ...task,
    description: rec ? setPairValue(task.description, 'rec', rec) : removePair(task.description, 'rec'),
  })
}

export function setPriority(task: Task, priority: string | null): Task {
  return reparse({ ...task, priority: priority ?? undefined })
}

/** Adds or drops a +project or @context word. */
export function toggleLabel(task: Task, label: string): Task {
  const words = task.description.split(' ')
  const description = words.includes(label)
    ? normalizeLine(words.filter((word) => word !== label).join(' '))
    : normalizeLine(`${task.description} ${label}`)
  return reparse({ ...task, description })
}
