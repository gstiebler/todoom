import { describe, it, expect } from 'vitest'
import { describeTask } from './describeTask'
import { parseLine } from '../core/parse'

const TODAY = '2026-09-10'

describe('describeTask', () => {
  it('marks an overdue task', () => {
    const d = describeTask(parseLine('Buy milk due:2026-09-01'), TODAY, 'en')
    expect(d.classes).toContain('task--overdue')
    expect(d.dueLabel).toBe('Sep 1')
  })

  it('marks a task due today', () => {
    const d = describeTask(parseLine('Buy milk due:2026-09-10'), TODAY, 'en')
    expect(d.classes).toContain('task--today')
    expect(d.dueLabel).toBe('Today')
  })

  it('labels tomorrow by name', () => {
    expect(describeTask(parseLine('Buy milk due:2026-09-11'), TODAY, 'en').dueLabel).toBe('Tomorrow')
  })

  it('names the weekday inside the coming week', () => {
    expect(describeTask(parseLine('Buy milk due:2026-09-15'), TODAY, 'en').dueLabel).toBe('Tuesday')
  })

  it('labels a further due date with a short date', () => {
    const d = describeTask(parseLine('Buy milk due:2026-09-20'), TODAY, 'en')
    expect(d.classes).not.toContain('task--overdue')
    expect(d.dueLabel).toBe('Sep 20')
  })

  it('keeps the year on a date from another year', () => {
    expect(describeTask(parseLine('Buy milk due:2025-08-26'), TODAY, 'en').dueLabel).toBe('Aug 26, 2025')
  })

  it('has no due label without a due date', () => {
    expect(describeTask(parseLine('Buy milk'), TODAY, 'en').dueLabel).toBe('')
  })

  it('ignores a malformed due date', () => {
    expect(describeTask(parseLine('Buy milk due:soon'), TODAY, 'en').dueLabel).toBe('')
  })

  it('labels and colors a deadline on its own', () => {
    const d = describeTask(parseLine('File taxes deadline:2026-09-10'), TODAY, 'en')
    expect(d.deadlineLabel).toBe('Today')
    expect(d.deadlineClass).toBe('deadline--today')
    expect(d.classes).not.toContain('task--today')
  })

  it('marks a missed deadline', () => {
    const d = describeTask(parseLine('File taxes deadline:2026-09-01'), TODAY, 'en')
    expect(d.deadlineLabel).toBe('Sep 1')
    expect(d.deadlineClass).toBe('deadline--overdue')
  })

  it('has no deadline label without one', () => {
    expect(describeTask(parseLine('Buy milk'), TODAY, 'en').deadlineLabel).toBe('')
  })

  it('marks a completed task', () => {
    const d = describeTask(parseLine('x 2026-09-09 Buy milk'), TODAY, 'en')
    expect(d.classes).toContain('task--done')
  })

  it('speaks Portuguese', () => {
    expect(describeTask(parseLine('Buy milk due:2026-09-10'), TODAY, 'pt-BR').dueLabel).toBe('Hoje')
    expect(describeTask(parseLine('Buy milk due:2026-09-11'), TODAY, 'pt-BR').dueLabel).toBe('Amanhã')
    expect(describeTask(parseLine('Buy milk due:2026-09-15'), TODAY, 'pt-BR').dueLabel).toBe(
      'terça-feira',
    )
    expect(describeTask(parseLine('Buy milk due:2026-09-01'), TODAY, 'pt-BR').dueLabel).toBe(
      '1 de set.',
    )
  })
})
