import type { Task } from '../core/types'
import { daysBetween, isValidDate, weekday } from '../core/dates'
import { MONTH_NAMES, WEEKDAY_NAMES } from './quickDates'

// "8 May" while we are still in the same year, "26 Aug 2025" once we are not —
// the year is only worth the space when it differs from today's.
function shortDate(iso: string, today: string): string {
  const day = Number(iso.slice(8))
  const month = MONTH_NAMES[Number(iso.slice(5, 7)) - 1]
  const year = iso.slice(0, 4)
  return year === today.slice(0, 4) ? `${day} ${month}` : `${day} ${month} ${year}`
}

type Urgency = 'overdue' | 'today' | 'soon' | ''

/** How a date reads and how pressing it is, relative to today. */
function describeDate(iso: string, today: string): { label: string; urgency: Urgency } {
  const delta = daysBetween(today, iso)
  if (delta < 0) return { label: shortDate(iso, today), urgency: 'overdue' }
  if (delta === 0) return { label: 'Today', urgency: 'today' }
  if (delta === 1) return { label: 'Tomorrow', urgency: 'soon' }
  // Inside the coming week a weekday name places the task better than a date.
  if (delta < 7) return { label: WEEKDAY_NAMES[weekday(iso)] ?? shortDate(iso, today), urgency: 'soon' }
  return { label: shortDate(iso, today), urgency: '' }
}

export interface TaskDescription {
  classes: string[]
  dueLabel: string
  deadlineLabel: string
  /** The class carrying the deadline's own urgency color, if any. */
  deadlineClass: string
}

export function describeTask(task: Task, today: string): TaskDescription {
  const classes: string[] = ['task']
  if (task.completed) classes.push('task--done')

  let dueLabel = ''
  const due = task.pairs['due']
  if (due && isValidDate(due)) {
    const { label, urgency } = describeDate(due, today)
    dueLabel = label
    if (!task.completed && urgency) classes.push(`task--${urgency}`)
  }

  // The deadline colors only its own chip: views and sort stay on the due date.
  let deadlineLabel = ''
  let deadlineClass = ''
  const deadline = task.pairs['deadline']
  if (deadline && isValidDate(deadline)) {
    const { label, urgency } = describeDate(deadline, today)
    deadlineLabel = label
    if (!task.completed && urgency) deadlineClass = `deadline--${urgency}`
  }

  return { classes, dueLabel, deadlineLabel, deadlineClass }
}
