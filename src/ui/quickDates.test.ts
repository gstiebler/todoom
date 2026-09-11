import { describe, it, expect } from 'vitest'
import { monthGrid, quickDates, shiftMonth } from './quickDates'

// 2026-09-10 is a Thursday.
const TODAY = '2026-09-10'

describe('quickDates', () => {
  it('offers today, tomorrow, the coming weekend and next Monday', () => {
    expect(quickDates(TODAY, 'en').map((q) => [q.label, q.date])).toEqual([
      ['Today', '2026-09-10'],
      ['Tomorrow', '2026-09-11'],
      ['This weekend', '2026-09-12'],
      ['Next week', '2026-09-14'],
    ])
  })

  it('keeps this weekend on the same day when today is Saturday', () => {
    const weekend = quickDates('2026-09-12', 'en').find((q) => q.key === 'weekend')
    expect(weekend?.date).toBe('2026-09-12')
  })

  it('always moves next week forward, never to today', () => {
    const monday = quickDates('2026-09-14', 'en').find((q) => q.key === 'next-week')
    expect(monday?.date).toBe('2026-09-21')
  })

  it('labels the shortcuts in Portuguese', () => {
    expect(quickDates(TODAY, 'pt-BR').map((q) => q.label)).toEqual([
      'Hoje',
      'Amanhã',
      'Este fim de semana',
      'Semana que vem',
    ])
    expect(monthGrid(2026, 9, 'pt-BR').title).toBe('setembro de 2026')
  })
})

describe('monthGrid', () => {
  it('pads the first row so the 1st lands under its weekday', () => {
    const grid = monthGrid(2026, 9, 'en')
    expect(grid.title).toBe('September 2026')
    // 2026-09-01 is a Tuesday, so one leading blank.
    expect(grid.cells.slice(0, 3)).toEqual([null, '2026-09-01', '2026-09-02'])
    expect(grid.cells.at(-1)).toBe('2026-09-30')
  })

  it('handles a leap February', () => {
    expect(monthGrid(2028, 2, 'en').cells.at(-1)).toBe('2028-02-29')
  })
})

describe('shiftMonth', () => {
  it('rolls forward over a year boundary', () => {
    expect(shiftMonth(2026, 12, 1)).toEqual([2027, 1])
  })

  it('rolls back over a year boundary', () => {
    expect(shiftMonth(2026, 1, -1)).toEqual([2025, 12])
  })
})
