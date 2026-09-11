import type { Task } from './types'
import { addInterval, isValidDate, weekday } from './dates'

export interface Bucket {
  /** The day, or the Monday of the week. */
  date: string
  count: number
}

export function completionsByDay(tasks: Task[]): Map<string, number> {
  const byDay = new Map<string, number>()
  for (const task of tasks) {
    const date = task.completionDate
    if (!task.completed || !date || !isValidDate(date)) continue
    byDay.set(date, (byDay.get(date) ?? 0) + 1)
  }
  return byDay
}

export function lastDays(byDay: Map<string, number>, today: string, days: number): Bucket[] {
  const out: Bucket[] = []
  for (let i = days - 1; i >= 0; i--) {
    const date = addInterval(today, -i, 'd')
    out.push({ date, count: byDay.get(date) ?? 0 })
  }
  return out
}

export function mondayOf(iso: string): string {
  return addInterval(iso, -weekday(iso), 'd')
}

export function lastWeeks(byDay: Map<string, number>, today: string, weeks: number): Bucket[] {
  const thisMonday = mondayOf(today)
  const out: Bucket[] = []
  for (let i = weeks - 1; i >= 0; i--) {
    const monday = addInterval(thisMonday, -i, 'w')
    let count = 0
    for (let d = 0; d < 7; d++) count += byDay.get(addInterval(monday, d, 'd')) ?? 0
    out.push({ date: monday, count })
  }
  return out
}

/** 0 for nothing, then four shades up to the busiest day. */
export function streakLevel(count: number, max: number): number {
  if (count === 0 || max === 0) return 0
  return Math.max(1, Math.ceil((count / max) * 4))
}

/** Consecutive days with a completion, ending today or yesterday. */
export function currentStreak(byDay: Map<string, number>, today: string): number {
  let date = byDay.has(today) ? today : addInterval(today, -1, 'd')
  let streak = 0
  while (byDay.has(date)) {
    streak += 1
    date = addInterval(date, -1, 'd')
  }
  return streak
}
