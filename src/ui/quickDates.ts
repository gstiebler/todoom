import { addInterval, weekday } from '../core/dates'

export interface QuickDate {
  key: string
  label: string
  date: string
}

// The four shortcuts the date popover offers, resolved against the day the
// popover is open on.
export function quickDates(today: string): QuickDate[] {
  const toSaturday = (5 - weekday(today) + 7) % 7
  const toMonday = 7 - weekday(today)
  return [
    { key: 'today', label: 'Today', date: today },
    { key: 'tomorrow', label: 'Tomorrow', date: addInterval(today, 1, 'd') },
    { key: 'weekend', label: 'This weekend', date: addInterval(today, toSaturday, 'd') },
    { key: 'next-week', label: 'Next week', date: addInterval(today, toMonday, 'd') },
  ]
}

export const WEEKDAY_INITIALS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

export interface MonthGrid {
  year: number
  month: number
  title: string
  // Leading nulls pad the first row so the 1st lands under its weekday.
  cells: Array<string | null>
}

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

export function monthGrid(year: number, month: number): MonthGrid {
  const pad = (n: number) => String(n).padStart(2, '0')
  const first = `${year}-${pad(month)}-01`
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate()

  const cells: Array<string | null> = Array<string | null>(weekday(first)).fill(null)
  for (let day = 1; day <= days; day += 1) cells.push(`${year}-${pad(month)}-${pad(day)}`)

  return { year, month, title: `${MONTH_NAMES[month - 1]} ${year}`, cells }
}

export function shiftMonth(year: number, month: number, delta: number): [number, number] {
  const total = year * 12 + (month - 1) + delta
  return [Math.floor(total / 12), (total % 12) + 1]
}
