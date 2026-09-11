import type { Task } from './types'
import { addInterval, daysBetween, isValidDate } from './dates'
import { blockerOf } from './deps'

export interface GanttRow {
  task: Task
  start: string
  end: string
  /** The deadline day, only when it differs from the bar's end. */
  deadline?: string
  overdue: boolean
}

export interface GanttRange {
  from: string
  to: string
  days: number
}

export interface GanttArrow {
  from: GanttRow
  to: GanttRow
}

const PAD_DAYS = 3
const MIN_DAYS = 21

function validPair(task: Task, key: string): string | undefined {
  const value = task.pairs[key]
  return value && isValidDate(value) ? value : undefined
}

function rowOf(task: Task, today: string): GanttRow | undefined {
  const due = validPair(task, 'due')
  const deadline = validPair(task, 'deadline')
  const end = due ?? deadline
  if (!end) return undefined
  const created = task.creationDate
  const from = created && isValidDate(created) && created <= end ? created : today
  // An overdue task without a creation date still gets a one-day bar on its end day.
  const start = from < end ? from : end
  return {
    task,
    start,
    end,
    deadline: due && deadline && deadline !== end ? deadline : undefined,
    overdue: end < today,
  }
}

export function ganttRows(tasks: Task[], today: string): GanttRow[] {
  return tasks.map((task) => rowOf(task, today)).filter((row): row is GanttRow => row !== undefined)
}

export function ganttRange(rows: GanttRow[], today: string): GanttRange {
  let earliest = today
  let latest = today
  for (const row of rows) {
    if (row.start < earliest) earliest = row.start
    if (row.end > latest) latest = row.end
    if (row.deadline && row.deadline > latest) latest = row.deadline
  }
  const from = addInterval(earliest, -PAD_DAYS, 'd')
  let to = addInterval(latest, PAD_DAYS, 'd')
  const days = daysBetween(from, to) + 1
  if (days < MIN_DAYS) to = addInterval(from, MIN_DAYS - 1, 'd')
  return { from, to, days: Math.max(days, MIN_DAYS) }
}

/** Column index of an ISO day inside the range. */
export function dayIndex(range: GanttRange, iso: string): number {
  return daysBetween(range.from, iso)
}

export function ganttArrows(rows: GanttRow[], tasks: Task[]): GanttArrow[] {
  const byTask = new Map(rows.map((row) => [row.task, row]))
  const arrows: GanttArrow[] = []
  for (const row of rows) {
    const blocker = blockerOf(row.task, tasks)
    const from = blocker && byTask.get(blocker)
    if (from) arrows.push({ from, to: row })
  }
  return arrows
}
