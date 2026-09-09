import type { Task } from './types'

export function formatTask(task: Task): string {
  const parts: string[] = []
  if (task.completed) parts.push('x')
  if (task.priority) parts.push(`(${task.priority})`)
  if (task.completionDate) parts.push(task.completionDate)
  if (task.creationDate) parts.push(task.creationDate)
  if (task.description) parts.push(task.description)
  return parts.join(' ')
}

export function formatFile(tasks: Task[]): string {
  if (tasks.length === 0) return ''
  return tasks.map(formatTask).join('\n') + '\n'
}
