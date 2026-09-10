import { describe, it, expect } from 'vitest'
import { describeTask } from './describeTask'
import { parseLine } from '../core/parse'

const TODAY = '2026-09-10'

describe('describeTask', () => {
  it('marks an overdue task', () => {
    const d = describeTask(parseLine('Buy milk due:2026-09-01'), TODAY)
    expect(d.classes).toContain('task--overdue')
    expect(d.dueLabel).toBe('1 Sep')
  })

  it('marks a task due today', () => {
    const d = describeTask(parseLine('Buy milk due:2026-09-10'), TODAY)
    expect(d.classes).toContain('task--today')
    expect(d.dueLabel).toBe('Today')
  })

  it('labels tomorrow by name', () => {
    expect(describeTask(parseLine('Buy milk due:2026-09-11'), TODAY).dueLabel).toBe('Tomorrow')
  })

  it('names the weekday inside the coming week', () => {
    expect(describeTask(parseLine('Buy milk due:2026-09-15'), TODAY).dueLabel).toBe('Tuesday')
  })

  it('labels a further due date with a short date', () => {
    const d = describeTask(parseLine('Buy milk due:2026-09-20'), TODAY)
    expect(d.classes).not.toContain('task--overdue')
    expect(d.dueLabel).toBe('20 Sep')
  })

  it('keeps the year on a date from another year', () => {
    expect(describeTask(parseLine('Buy milk due:2025-08-26'), TODAY).dueLabel).toBe('26 Aug 2025')
  })

  it('has no due label without a due date', () => {
    expect(describeTask(parseLine('Buy milk'), TODAY).dueLabel).toBe('')
  })

  it('ignores a malformed due date', () => {
    expect(describeTask(parseLine('Buy milk due:soon'), TODAY).dueLabel).toBe('')
  })

  it('marks a completed task', () => {
    const d = describeTask(parseLine('x 2026-09-09 Buy milk'), TODAY)
    expect(d.classes).toContain('task--done')
  })
})
