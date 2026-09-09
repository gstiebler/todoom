import { describe, it, expect } from 'vitest'
import { nextOccurrence } from './recurrence'
import { parseLine } from './parse'
import { formatTask } from './format'

describe('nextOccurrence', () => {
  it('returns null without a rec pair', () => {
    expect(nextOccurrence(parseLine('Buy milk'), '2026-09-10')).toBeNull()
  })

  it('returns null for a malformed rec value', () => {
    expect(nextOccurrence(parseLine('Buy milk rec:soon'), '2026-09-10')).toBeNull()
  })

  it('anchors a non-strict rule to the completion date', () => {
    const next = nextOccurrence(parseLine('Water plants due:2026-09-01 rec:1w'), '2026-09-10')
    expect(next).not.toBeNull()
    expect(next?.pairs['due']).toBe('2026-09-17')
  })

  it('anchors a strict rule to the previous due date', () => {
    const next = nextOccurrence(parseLine('Water plants due:2026-09-01 rec:+1w'), '2026-09-10')
    expect(next?.pairs['due']).toBe('2026-09-08')
  })

  it('falls back to the completion date when there is no due date', () => {
    const next = nextOccurrence(parseLine('Water plants rec:+1w'), '2026-09-10')
    expect(next?.pairs['due']).toBe('2026-09-17')
  })

  it('falls back to the completion date when the due date is malformed', () => {
    const next = nextOccurrence(parseLine('Water plants due:soon rec:+1w'), '2026-09-10')
    expect(next?.pairs['due']).toBe('2026-09-17')
  })

  it('produces an incomplete task stamped with today as the creation date', () => {
    const next = nextOccurrence(parseLine('(A) Water plants due:2026-09-01 rec:1m'), '2026-09-10')
    expect(next?.completed).toBe(false)
    expect(next?.creationDate).toBe('2026-09-10')
    expect(formatTask(next!)).toBe('(A) 2026-09-10 Water plants due:2026-10-10 rec:1m')
  })

  it('clamps month arithmetic to the end of the month', () => {
    const next = nextOccurrence(parseLine('Pay rent due:2026-01-31 rec:+1m'), '2026-02-02')
    expect(next?.pairs['due']).toBe('2026-02-28')
  })

  it('keeps projects and contexts', () => {
    const next = nextOccurrence(parseLine('Water plants +home @garden rec:1d'), '2026-09-10')
    expect(next?.projects).toEqual(['home'])
    expect(next?.contexts).toEqual(['garden'])
  })
})
