import { describe, it, expect } from 'vitest'
import { describeTask } from './describeTask'
import { parseLine } from '../core/parse'

const TODAY = '2026-09-10'

describe('describeTask', () => {
  it('marks an overdue task', () => {
    const d = describeTask(parseLine('Buy milk due:2026-09-01'), TODAY)
    expect(d.classes).toContain('task--overdue')
    expect(d.dueLabel).toBe('Overdue 2026-09-01')
  })

  it('marks a task due today', () => {
    const d = describeTask(parseLine('Buy milk due:2026-09-10'), TODAY)
    expect(d.classes).toContain('task--today')
    expect(d.dueLabel).toBe('Due today')
  })

  it('labels a future due date plainly', () => {
    const d = describeTask(parseLine('Buy milk due:2026-09-20'), TODAY)
    expect(d.classes).not.toContain('task--overdue')
    expect(d.dueLabel).toBe('Due 2026-09-20')
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
