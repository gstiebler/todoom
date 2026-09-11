import { addInterval } from '../core/dates'
import type { Locale } from './i18n'

// Every ISO day is formatted as a UTC instant so the browser's zone never
// shifts it to the day before.
function format(locale: Locale, iso: string, options: Intl.DateTimeFormatOptions): string {
  const date = new Date(`${iso}T00:00:00Z`)
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' }).format(date)
}

/** "May 8" while we are still in the same year, "Aug 26, 2025" once we are not. */
export function shortDate(locale: Locale, iso: string, today: string): string {
  const sameYear = iso.slice(0, 4) === today.slice(0, 4)
  const options: Intl.DateTimeFormatOptions = {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  }
  return format(locale, iso, options)
}

export function weekdayName(locale: Locale, iso: string): string {
  return format(locale, iso, { weekday: 'long' })
}

export function weekdayShort(locale: Locale, iso: string): string {
  return format(locale, iso, { weekday: 'short' })
}

export function monthShort(locale: Locale, iso: string): string {
  return format(locale, iso, { month: 'short' })
}

export function monthYear(locale: Locale, iso: string, month: 'short' | 'long'): string {
  return format(locale, iso, { month, year: 'numeric' })
}

/** Monday-first, matching weekday() in core/dates. 2024-01-01 was a Monday. */
export function weekdayInitials(locale: Locale): string[] {
  return Array.from({ length: 7 }, (_, i) =>
    format(locale, addInterval('2024-01-01', i, 'd'), { weekday: 'narrow' }),
  )
}
