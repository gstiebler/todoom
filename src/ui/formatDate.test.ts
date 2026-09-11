import { describe, it, expect } from 'vitest'
import {
  monthShort,
  monthYear,
  shortDate,
  weekdayInitials,
  weekdayName,
  weekdayShort,
} from './formatDate'

const TODAY = '2026-09-10'

describe('shortDate', () => {
  it('omits the year inside the current year', () => {
    expect(shortDate('en', '2026-05-08', TODAY)).toBe('May 8')
    expect(shortDate('pt-BR', '2026-05-08', TODAY)).toBe('8 de mai.')
  })

  it('adds the year once it differs', () => {
    expect(shortDate('en', '2025-08-26', TODAY)).toBe('Aug 26, 2025')
    expect(shortDate('pt-BR', '2025-08-26', TODAY)).toBe('26 de ago. de 2025')
  })
})

describe('weekday and month names', () => {
  it('names a weekday', () => {
    expect(weekdayName('en', '2026-09-14')).toBe('Monday')
    expect(weekdayName('pt-BR', '2026-09-14')).toBe('segunda-feira')
    expect(weekdayShort('en', '2026-09-14')).toBe('Mon')
    expect(weekdayShort('pt-BR', '2026-09-14')).toBe('seg.')
  })

  it('names a month', () => {
    expect(monthShort('en', '2026-05-01')).toBe('May')
    expect(monthShort('pt-BR', '2026-05-01')).toBe('mai.')
    expect(monthYear('en', '2026-05-01', 'long')).toBe('May 2026')
    expect(monthYear('pt-BR', '2026-05-01', 'long')).toBe('maio de 2026')
    expect(monthYear('pt-BR', '2026-05-01', 'short')).toBe('mai. de 2026')
  })

  it('lists Monday-first weekday initials', () => {
    expect(weekdayInitials('en').join('')).toBe('MTWTFSS')
    expect(weekdayInitials('pt-BR').join('')).toBe('STQQSSD')
  })
})
