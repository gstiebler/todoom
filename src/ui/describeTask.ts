import type { Task } from '../core/types'
import { daysBetween, isValidDate } from '../core/dates'
import { shortDate, weekdayName } from './formatDate'
import { t, type Locale } from './i18n'

type Urgency = 'overdue' | 'today' | 'soon' | ''

/** How a date reads and how pressing it is, relative to today. */
function describeDate(iso: string, today: string, locale: Locale): { label: string; urgency: Urgency } {
  const delta = daysBetween(today, iso)
  if (delta < 0) return { label: shortDate(locale, iso, today), urgency: 'overdue' }
  if (delta === 0) return { label: t(locale, 'date.today'), urgency: 'today' }
  if (delta === 1) return { label: t(locale, 'date.tomorrow'), urgency: 'soon' }
  // Inside the coming week a weekday name places the task better than a date.
  if (delta < 7) return { label: weekdayName(locale, iso), urgency: 'soon' }
  return { label: shortDate(locale, iso, today), urgency: '' }
}

export interface TaskDescription {
  classes: string[]
  dueLabel: string
  deadlineLabel: string
  /** The class carrying the deadline's own urgency color, if any. */
  deadlineClass: string
}

export function describeTask(task: Task, today: string, locale: Locale): TaskDescription {
  const classes: string[] = ['task']
  if (task.completed) classes.push('task--done')

  let dueLabel = ''
  const due = task.pairs['due']
  if (due && isValidDate(due)) {
    const { label, urgency } = describeDate(due, today, locale)
    dueLabel = label
    if (!task.completed && urgency) classes.push(`task--${urgency}`)
  }

  // The deadline colors only its own chip: views and sort stay on the due date.
  let deadlineLabel = ''
  let deadlineClass = ''
  const deadline = task.pairs['deadline']
  if (deadline && isValidDate(deadline)) {
    const { label, urgency } = describeDate(deadline, today, locale)
    deadlineLabel = label
    if (!task.completed && urgency) deadlineClass = `deadline--${urgency}`
  }

  return { classes, dueLabel, deadlineLabel, deadlineClass }
}
