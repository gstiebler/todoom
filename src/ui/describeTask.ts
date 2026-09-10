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

export function describeTask(task: Task, today: string): { classes: string[]; dueLabel: string } {
  const classes: string[] = ['task']
  if (task.completed) classes.push('task--done')

  const due = task.pairs['due']
  if (!due || !isValidDate(due)) return { classes, dueLabel: '' }

  const delta = daysBetween(today, due)
  if (!task.completed && delta < 0) {
    classes.push('task--overdue')
    return { classes, dueLabel: shortDate(due, today) }
  }
  if (!task.completed && delta === 0) {
    classes.push('task--today')
    return { classes, dueLabel: 'Today' }
  }
  if (!task.completed && delta === 1) {
    classes.push('task--soon')
    return { classes, dueLabel: 'Tomorrow' }
  }
  // Inside the coming week a weekday name places the task better than a date.
  if (!task.completed && delta < 7) {
    classes.push('task--soon')
    return { classes, dueLabel: WEEKDAY_NAMES[weekday(due)] ?? shortDate(due, today) }
  }
  return { classes, dueLabel: shortDate(due, today) }
}
