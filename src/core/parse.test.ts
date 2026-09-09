import { describe, it, expect } from 'vitest'
import { parseLine, parseFile, normalizeLine } from './parse'

describe('normalizeLine', () => {
  it('trims and collapses internal whitespace', () => {
    expect(normalizeLine('  a   b \t c  ')).toBe('a b c')
  })
})

describe('parseLine', () => {
  it('parses a bare description', () => {
    const t = parseLine('Buy milk')
    expect(t.completed).toBe(false)
    expect(t.priority).toBeUndefined()
    expect(t.description).toBe('Buy milk')
  })

  it('parses a priority', () => {
    const t = parseLine('(A) Call plumber')
    expect(t.priority).toBe('A')
    expect(t.description).toBe('Call plumber')
  })

  it('ignores a priority that is not at the start', () => {
    const t = parseLine('Call (A) plumber')
    expect(t.priority).toBeUndefined()
    expect(t.description).toBe('Call (A) plumber')
  })

  it('ignores a priority with no trailing space', () => {
    const t = parseLine('(A)Call plumber')
    expect(t.priority).toBeUndefined()
    expect(t.description).toBe('(A)Call plumber')
  })

  it('ignores a lowercase priority', () => {
    const t = parseLine('(a) Call plumber')
    expect(t.priority).toBeUndefined()
  })

  it('parses a creation date', () => {
    const t = parseLine('2026-09-09 Buy milk')
    expect(t.creationDate).toBe('2026-09-09')
    expect(t.description).toBe('Buy milk')
  })

  it('parses a priority followed by a creation date', () => {
    const t = parseLine('(B) 2026-09-09 Buy milk')
    expect(t.priority).toBe('B')
    expect(t.creationDate).toBe('2026-09-09')
    expect(t.description).toBe('Buy milk')
  })

  it('treats a date that is not in the date position as description text', () => {
    const t = parseLine('Buy milk 2026-09-09')
    expect(t.creationDate).toBeUndefined()
    expect(t.description).toBe('Buy milk 2026-09-09')
  })

  it('parses a completed task with completion and creation dates', () => {
    const t = parseLine('x 2026-09-10 2026-09-09 Buy milk')
    expect(t.completed).toBe(true)
    expect(t.completionDate).toBe('2026-09-10')
    expect(t.creationDate).toBe('2026-09-09')
    expect(t.description).toBe('Buy milk')
  })

  it('reads a single date on a completed task as the completion date', () => {
    const t = parseLine('x 2026-09-10 Buy milk')
    expect(t.completionDate).toBe('2026-09-10')
    expect(t.creationDate).toBeUndefined()
  })

  it('does not treat a bare x as a completion marker', () => {
    const t = parseLine('x')
    expect(t.completed).toBe(false)
    expect(t.description).toBe('x')
  })

  it('does not treat xylophone as a completion marker', () => {
    const t = parseLine('xylophone lessons')
    expect(t.completed).toBe(false)
    expect(t.description).toBe('xylophone lessons')
  })

  it('does not treat an uppercase X as a completion marker', () => {
    const t = parseLine('X 2026-09-10 Buy milk')
    expect(t.completed).toBe(false)
  })

  it('collects projects and contexts', () => {
    const t = parseLine('Buy milk +groceries @store +errands')
    expect(t.projects).toEqual(['groceries', 'errands'])
    expect(t.contexts).toEqual(['store'])
  })

  it('ignores a plus sign in the middle of a word', () => {
    const t = parseLine('Buy C++ book')
    expect(t.projects).toEqual([])
  })

  it('collects key value pairs', () => {
    const t = parseLine('Buy milk due:2026-09-12 rec:+1w')
    expect(t.pairs).toEqual({ due: '2026-09-12', rec: '+1w' })
  })

  it('does not treat a URL as a key value pair', () => {
    const t = parseLine('Read https://example.com/x')
    expect(t.pairs).toEqual({})
  })

  it('keeps the raw line', () => {
    expect(parseLine('  (A) Buy milk  ').raw).toBe('  (A) Buy milk  ')
  })
})

describe('parseFile', () => {
  it('parses one task per non-blank line', () => {
    const tasks = parseFile('Buy milk\n\n(A) Call plumber\n')
    expect(tasks).toHaveLength(2)
    expect(tasks[0]?.description).toBe('Buy milk')
    expect(tasks[1]?.priority).toBe('A')
  })

  it('handles CRLF line endings', () => {
    const tasks = parseFile('Buy milk\r\nCall plumber\r\n')
    expect(tasks).toHaveLength(2)
    expect(tasks[1]?.description).toBe('Call plumber')
  })

  it('returns an empty array for an empty file', () => {
    expect(parseFile('')).toEqual([])
  })
})
