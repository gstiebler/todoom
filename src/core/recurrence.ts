import type { Task } from './types'
import type { Unit } from './dates'
import { addInterval, isValidDate } from './dates'
import { setPairValue } from './mutate'
import { parseLine } from './parse'
import { formatTask } from './format'

const REC_RE = /^(\+?)(\d+)([dwmy])$/

export function nextOccurrence(task: Task, completedOn: string): Task | null {
  const rec = task.pairs['rec']
  if (!rec) return null
  const m = REC_RE.exec(rec)
  if (!m) return null

  const strict = m[1] === '+'
  const count = Number(m[2])
  const unit = m[3] as Unit
  if (count <= 0) return null

  const due = task.pairs['due']
  const anchor = strict && due && isValidDate(due) ? due : completedOn

  const nextDue = addInterval(anchor, count, unit)
  const description = setPairValue(task.description, 'due', nextDue)

  const draft: Task = {
    ...task,
    raw: '',
    completed: false,
    completionDate: undefined,
    creationDate: completedOn,
    description,
  }
  return parseLine(formatTask(draft))
}
