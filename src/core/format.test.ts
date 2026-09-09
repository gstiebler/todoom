import { describe, it, expect } from 'vitest'
import { formatTask, formatFile } from './format'
import { parseLine, parseFile, normalizeLine } from './parse'

describe('formatTask', () => {
  it('formats a bare description', () => {
    expect(formatTask(parseLine('Buy milk'))).toBe('Buy milk')
  })

  it('formats priority, creation date and description in order', () => {
    expect(formatTask(parseLine('(A) 2026-09-09 Buy milk'))).toBe('(A) 2026-09-09 Buy milk')
  })

  it('formats a completed task', () => {
    expect(formatTask(parseLine('x 2026-09-10 2026-09-09 Buy milk'))).toBe(
      'x 2026-09-10 2026-09-09 Buy milk',
    )
  })

  it('formats a completed task that kept its priority', () => {
    expect(formatTask(parseLine('x (A) 2026-09-10 Buy milk'))).toBe('x (A) 2026-09-10 Buy milk')
  })
})

describe('formatFile', () => {
  it('joins tasks with newlines and appends a trailing newline', () => {
    expect(formatFile(parseFile('a\nb'))).toBe('a\nb\n')
  })

  it('returns an empty string for no tasks', () => {
    expect(formatFile([])).toBe('')
  })
})

describe('round trip', () => {
  const lines = [
    'Buy milk',
    '(A) Call plumber',
    '(A) 2026-09-09 Call plumber +house @phone',
    '2026-09-09 Buy milk due:2026-09-12',
    'x 2026-09-10 2026-09-09 Buy milk',
    'x 2026-09-10 Buy milk pri:A',
    'x',
    'xylophone lessons',
    'X 2026-09-10 not completed',
    '(A)Call plumber',
    '(a) lowercase priority',
    'Buy C++ book',
    'Read https://example.com/x',
    'Buy milk 2026-09-09',
    'Task with due:2026-09-12 rec:+1w +proj @ctx',
    '  leading and trailing  ',
    'collapse   internal    spaces',
  ]

  for (const line of lines) {
    it(`round trips ${JSON.stringify(line)}`, () => {
      expect(formatTask(parseLine(line))).toBe(normalizeLine(line))
    })
  }

  it('round trips generated lines', () => {
    const priorities = ['', '(A) ', '(Z) ']
    const marks = ['', 'x ']
    const dates = ['', '2026-09-09 ', '2026-09-10 2026-09-09 ']
    const bodies = ['Buy milk', 'Call +house @phone due:2026-09-12', 'plain']
    for (const mark of marks) {
      for (const pri of priorities) {
        for (const date of dates) {
          for (const body of bodies) {
            const line = `${mark}${pri}${date}${body}`
            expect(formatTask(parseLine(line))).toBe(normalizeLine(line))
          }
        }
      }
    }
  })
})
