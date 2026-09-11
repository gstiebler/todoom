import { describe, it, expect } from 'vitest'
import { parseLine } from './parse'
import { ganttArrows, ganttRange, ganttRows, dayIndex } from './gantt'

const TODAY = '2026-09-10'

function rows(lines: string[]) {
  return ganttRows(lines.map(parseLine), TODAY)
}

describe('ganttRows', () => {
  it('skips tasks without a valid due or deadline', () => {
    expect(rows(['Buy milk', 'Call due:soon', 'Fix deadline:2026-13-01'])).toEqual([])
  })

  it('runs from today to the due date when there is no creation date', () => {
    const [row] = rows(['Call due:2026-09-14'])
    expect(row).toMatchObject({ start: TODAY, end: '2026-09-14', overdue: false })
    expect(row?.deadline).toBeUndefined()
  })

  it('starts at the creation date when it is before the end', () => {
    const [row] = rows(['2026-09-01 Call due:2026-09-14'])
    expect(row).toMatchObject({ start: '2026-09-01', end: '2026-09-14' })
  })

  it('ignores a creation date after the due date', () => {
    const [row] = rows(['2026-09-20 Call due:2026-09-14'])
    expect(row).toMatchObject({ start: TODAY, end: '2026-09-14', overdue: false })
  })

  it('starts at a future creation date that is not after the end', () => {
    const [row] = rows(['2026-09-12 Call due:2026-09-14'])
    expect(row).toMatchObject({ start: '2026-09-12', end: '2026-09-14' })
  })

  it('uses the deadline as the end when there is no due date', () => {
    const [row] = rows(['Call deadline:2026-09-20'])
    expect(row).toMatchObject({ start: TODAY, end: '2026-09-20' })
    expect(row?.deadline).toBeUndefined()
  })

  it('keeps the deadline as a tick when both dates are present', () => {
    const [row] = rows(['Call due:2026-09-12 deadline:2026-09-20'])
    expect(row).toMatchObject({ start: TODAY, end: '2026-09-12', deadline: '2026-09-20' })
  })

  it('drops the deadline tick when it equals the end', () => {
    const [row] = rows(['Call due:2026-09-12 deadline:2026-09-12'])
    expect(row?.deadline).toBeUndefined()
  })

  it('flags a bar whose end is before today as overdue', () => {
    const [row] = rows(['Call due:2026-09-01'])
    expect(row).toMatchObject({ start: '2026-09-01', end: '2026-09-01', overdue: true })
  })

  it('keeps the input order', () => {
    const titles = rows(['B due:2026-09-12', 'A due:2026-09-11']).map((r) => r.task.description)
    expect(titles).toEqual(['B due:2026-09-12', 'A due:2026-09-11'])
  })
})

describe('ganttRange', () => {
  it('pads three days either side and is at least 21 days wide', () => {
    const range = ganttRange(rows(['Call due:2026-09-14']), TODAY)
    expect(range.from).toBe('2026-09-07')
    expect(range.days).toBe(21)
    expect(range.to).toBe('2026-09-27')
  })

  it('spans from the earliest start to the latest end', () => {
    const range = ganttRange(rows(['2026-08-01 A due:2026-08-05', 'B due:2026-10-01']), TODAY)
    expect(range).toEqual({ from: '2026-07-29', to: '2026-10-04', days: 68 })
  })

  it('always contains today', () => {
    const range = ganttRange(rows(['2026-07-01 A due:2026-07-02']), TODAY)
    expect(range.from).toBe('2026-06-28')
    expect(range.to).toBe('2026-09-13')
  })

  it('centres on today when there are no rows', () => {
    expect(ganttRange([], TODAY)).toEqual({ from: '2026-09-07', to: '2026-09-27', days: 21 })
  })
})

describe('dayIndex', () => {
  it('counts days from the start of the range', () => {
    const range = { from: '2026-09-07', to: '2026-09-27', days: 21 }
    expect(dayIndex(range, '2026-09-07')).toBe(0)
    expect(dayIndex(range, '2026-09-10')).toBe(3)
  })
})

describe('ganttArrows', () => {
  it('links a blocked task to the charted task it waits on', () => {
    const tasks = ['A id:aaaaaa due:2026-09-12', 'B dep:aaaaaa due:2026-09-15'].map(parseLine)
    const charted = ganttRows(tasks, TODAY)
    const arrows = ganttArrows(charted, tasks)
    expect(arrows).toHaveLength(1)
    expect(arrows[0]?.from.task.description).toBe('A id:aaaaaa due:2026-09-12')
    expect(arrows[0]?.to.task.description).toBe('B dep:aaaaaa due:2026-09-15')
  })

  it('draws nothing when the blocker is not on the chart', () => {
    const tasks = ['A id:aaaaaa', 'B dep:aaaaaa due:2026-09-15'].map(parseLine)
    expect(ganttArrows(ganttRows(tasks, TODAY), tasks)).toEqual([])
  })

  it('draws nothing when the blocker is done', () => {
    const tasks = ['x 2026-09-01 A id:aaaaaa due:2026-09-12', 'B dep:aaaaaa due:2026-09-15']
      .map(parseLine)
    expect(ganttArrows(ganttRows(tasks, TODAY), tasks)).toEqual([])
  })
})
