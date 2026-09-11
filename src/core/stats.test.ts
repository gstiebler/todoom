import { describe, expect, test } from 'vitest'
import { parseFile } from './parse'
import { completionsByDay, currentStreak, lastDays, lastWeeks, streakLevel } from './stats'

const TODAY = '2026-09-10' // a Thursday

const done = parseFile(
  [
    'x 2026-09-10 Buy milk',
    'x 2026-09-10 Call plumber',
    'x 2026-09-08 File taxes',
    'x 2026-08-31 Old one',
    'x Malformed no date',
    'Still open',
  ].join('\n'),
)

describe('completionsByDay', () => {
  test('counts completed tasks by their completion date', () => {
    const byDay = completionsByDay(done)
    expect(byDay.get('2026-09-10')).toBe(2)
    expect(byDay.get('2026-09-08')).toBe(1)
    expect(byDay.size).toBe(3)
  })
})

describe('lastDays', () => {
  test('ends today and fills gaps with zero', () => {
    const days = lastDays(completionsByDay(done), TODAY, 4)
    expect(days).toEqual([
      { date: '2026-09-07', count: 0 },
      { date: '2026-09-08', count: 1 },
      { date: '2026-09-09', count: 0 },
      { date: '2026-09-10', count: 2 },
    ])
  })
})

describe('lastWeeks', () => {
  test('buckets by Monday-start week, ending with the current week', () => {
    const weeks = lastWeeks(completionsByDay(done), TODAY, 3)
    expect(weeks).toEqual([
      { date: '2026-08-24', count: 0 },
      { date: '2026-08-31', count: 1 },
      { date: '2026-09-07', count: 3 },
    ])
  })
})

describe('streakLevel', () => {
  test('quantizes into five levels against the busiest day', () => {
    expect(streakLevel(0, 8)).toBe(0)
    expect(streakLevel(1, 8)).toBe(1)
    expect(streakLevel(4, 8)).toBe(2)
    expect(streakLevel(6, 8)).toBe(3)
    expect(streakLevel(8, 8)).toBe(4)
    expect(streakLevel(0, 0)).toBe(0)
    expect(streakLevel(1, 1)).toBe(4)
  })
})

describe('currentStreak', () => {
  test('counts consecutive days ending today', () => {
    const byDay = new Map([
      ['2026-09-10', 1],
      ['2026-09-09', 2],
      ['2026-09-08', 1],
      ['2026-09-06', 1],
    ])
    expect(currentStreak(byDay, TODAY)).toBe(3)
  })

  test('still counts a streak that ended yesterday', () => {
    const byDay = new Map([
      ['2026-09-09', 2],
      ['2026-09-08', 1],
    ])
    expect(currentStreak(byDay, TODAY)).toBe(2)
  })

  test('is zero with nothing recent', () => {
    expect(currentStreak(new Map([['2026-09-01', 1]]), TODAY)).toBe(0)
  })
})
