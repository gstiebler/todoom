import type { Task } from './types'

export function splitCompleted(tasks: Task[]): { keep: Task[]; archive: Task[] } {
  return {
    keep: tasks.filter((t) => !t.completed),
    archive: tasks.filter((t) => t.completed),
  }
}
