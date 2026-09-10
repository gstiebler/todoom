import type { Task } from './types'
import { NOTE_RE, parseLine, normalizeLine } from './parse'
import { formatTask } from './format'

// The machinery of a line: the tags and the key:value words. Everything else is
// the title a person reads.
function isMachinery(word: string): boolean {
  return /^[+@]\S/.test(word) || /^[A-Za-z0-9_-]+:/.test(word)
}

function split(description: string): { title: string[]; machinery: string[]; note: string } {
  const note = NOTE_RE.exec(description)?.[0]?.trim() ?? ''
  const words = normalizeLine(description.replace(NOTE_RE, ' ')).split(' ').filter(Boolean)
  return {
    title: words.filter((word) => !isMachinery(word)),
    machinery: words.filter(isMachinery),
    note,
  }
}

/** The task as the list shows it: the description with the machinery taken out. */
export function taskTitle(task: Task): string {
  return split(task.description).title.join(' ') || task.description
}

/** Rewrites the title, leaving every tag, pair and the note where they were. */
export function setTitle(task: Task, title: string): Task {
  const trimmed = title.trim()
  if (trimmed.length === 0) return task
  const { machinery, note } = split(task.description)
  const description = [trimmed, ...machinery, note].join(' ').trim()
  const next = parseLine(formatTask({ ...task, description }))
  return { ...next, raw: formatTask(next) }
}
