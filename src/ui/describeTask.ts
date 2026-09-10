import type { Task } from '../core/types'
import { daysBetween, isValidDate } from '../core/dates'

export function describeTask(task: Task, today: string): { classes: string[]; dueLabel: string } {
  const classes: string[] = ['task']
  if (task.completed) classes.push('task--done')

  const due = task.pairs['due']
  if (!due || !isValidDate(due)) return { classes, dueLabel: '' }

  const delta = daysBetween(today, due)
  if (!task.completed && delta < 0) {
    classes.push('task--overdue')
    return { classes, dueLabel: `Overdue ${due}` }
  }
  if (!task.completed && delta === 0) {
    classes.push('task--today')
    return { classes, dueLabel: 'Due today' }
  }
  return { classes, dueLabel: `Due ${due}` }
}
