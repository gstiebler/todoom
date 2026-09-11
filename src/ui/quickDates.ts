import { addInterval, weekday } from '../core/dates'
import { monthYear } from './formatDate'
import { t, type Locale } from './i18n'

export interface QuickDate {
  key: string
  label: string
  date: string
}

// The four shortcuts the date popover offers, resolved against the day the
// popover is open on.
export function quickDates(today: string, locale: Locale): QuickDate[] {
  const toSaturday = (5 - weekday(today) + 7) % 7
  const toMonday = 7 - weekday(today)
  return [
    { key: 'today', label: t(locale, 'date.today'), date: today },
    { key: 'tomorrow', label: t(locale, 'date.tomorrow'), date: addInterval(today, 1, 'd') },
    {
      key: 'weekend',
      label: t(locale, 'quick.weekend'),
      date: addInterval(today, toSaturday, 'd'),
    },
    {
      key: 'next-week',
      label: t(locale, 'quick.nextWeek'),
      date: addInterval(today, toMonday, 'd'),
    },
  ]
}

export interface MonthGrid {
  year: number
  month: number
  title: string
  // Leading nulls pad the first row so the 1st lands under its weekday.
  cells: Array<string | null>
}

export function monthGrid(year: number, month: number, locale: Locale): MonthGrid {
  const pad = (n: number) => String(n).padStart(2, '0')
  const first = `${year}-${pad(month)}-01`
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate()

  const cells: Array<string | null> = Array<string | null>(weekday(first)).fill(null)
  for (let day = 1; day <= days; day += 1) cells.push(`${year}-${pad(month)}-${pad(day)}`)

  return { year, month, title: monthYear(locale, first, 'long'), cells }
}

export function shiftMonth(year: number, month: number, delta: number): [number, number] {
  const total = year * 12 + (month - 1) + delta
  return [Math.floor(total / 12), (total % 12) + 1]
}
