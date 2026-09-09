import { describe, it, expect } from 'vitest'
import { addInterval, isValidDate, daysBetween } from './dates'

describe('isValidDate', () => {
  it('accepts a real date', () => {
    expect(isValidDate('2026-09-09')).toBe(true)
  })

  it('rejects a malformed string', () => {
    expect(isValidDate('tomorrow')).toBe(false)
  })

  it('rejects an impossible date', () => {
    expect(isValidDate('2026-02-30')).toBe(false)
  })
})

describe('addInterval', () => {
  it('adds days', () => {
    expect(addInterval('2026-09-09', 3, 'd')).toBe('2026-09-12')
  })

  it('adds weeks', () => {
    expect(addInterval('2026-09-09', 1, 'w')).toBe('2026-09-16')
  })

  it('crosses a month boundary', () => {
    expect(addInterval('2026-09-30', 1, 'd')).toBe('2026-10-01')
  })

  it('adds months', () => {
    expect(addInterval('2026-09-09', 2, 'm')).toBe('2026-11-09')
  })

  it('clamps to the end of a short month', () => {
    expect(addInterval('2026-01-31', 1, 'm')).toBe('2026-02-28')
  })

  it('clamps to a leap day', () => {
    expect(addInterval('2028-01-31', 1, 'm')).toBe('2028-02-29')
  })

  it('adds years', () => {
    expect(addInterval('2026-09-09', 1, 'y')).toBe('2027-09-09')
  })

  it('clamps a leap day across a year', () => {
    expect(addInterval('2028-02-29', 1, 'y')).toBe('2029-02-28')
  })
})

describe('daysBetween', () => {
  it('counts forward days', () => {
    expect(daysBetween('2026-09-09', '2026-09-12')).toBe(3)
  })

  it('counts backward days as negative', () => {
    expect(daysBetween('2026-09-12', '2026-09-09')).toBe(-3)
  })

  it('returns zero for the same day', () => {
    expect(daysBetween('2026-09-09', '2026-09-09')).toBe(0)
  })
})
