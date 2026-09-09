import { describe, it, expect } from 'vitest'
import { complete, uncomplete, createTask, setPairValue, removePair } from './mutate'
import { parseLine } from './parse'
import { formatTask } from './format'

describe('setPairValue', () => {
  it('appends a pair that is not present', () => {
    expect(setPairValue('Buy milk', 'due', '2026-09-12')).toBe('Buy milk due:2026-09-12')
  })

  it('replaces a pair in place', () => {
    expect(setPairValue('Buy milk due:2026-09-01 @store', 'due', '2026-09-12')).toBe(
      'Buy milk due:2026-09-12 @store',
    )
  })
})

describe('removePair', () => {
  it('removes a pair and leaves single spacing', () => {
    expect(removePair('Buy milk pri:A @store', 'pri')).toBe('Buy milk @store')
  })

  it('leaves the description alone when the key is absent', () => {
    expect(removePair('Buy milk', 'pri')).toBe('Buy milk')
  })
})

describe('complete', () => {
  it('marks the task done and stamps the completion date', () => {
    const t = complete(parseLine('Buy milk'), '2026-09-10')
    expect(formatTask(t)).toBe('x 2026-09-10 Buy milk')
  })

  it('preserves the creation date', () => {
    const t = complete(parseLine('2026-09-09 Buy milk'), '2026-09-10')
    expect(formatTask(t)).toBe('x 2026-09-10 2026-09-09 Buy milk')
  })

  it('moves the priority into a pri pair', () => {
    const t = complete(parseLine('(A) Buy milk'), '2026-09-10')
    expect(formatTask(t)).toBe('x 2026-09-10 Buy milk pri:A')
    expect(t.priority).toBeUndefined()
  })

  it('does not change an already completed task', () => {
    const done = parseLine('x 2026-09-10 Buy milk')
    expect(formatTask(complete(done, '2026-09-11'))).toBe('x 2026-09-10 Buy milk')
  })
})

describe('uncomplete', () => {
  it('clears the marker and the completion date', () => {
    const t = uncomplete(parseLine('x 2026-09-10 2026-09-09 Buy milk'))
    expect(formatTask(t)).toBe('2026-09-09 Buy milk')
  })

  it('restores the priority from the pri pair', () => {
    const t = uncomplete(parseLine('x 2026-09-10 Buy milk pri:A'))
    expect(formatTask(t)).toBe('(A) Buy milk')
  })

  it('does not change an incomplete task', () => {
    const t = parseLine('Buy milk')
    expect(formatTask(uncomplete(t))).toBe('Buy milk')
  })
})

describe('createTask', () => {
  it('stamps a creation date', () => {
    expect(formatTask(createTask('Buy milk', '2026-09-09'))).toBe('2026-09-09 Buy milk')
  })

  it('keeps a creation date the user typed', () => {
    expect(formatTask(createTask('2026-01-01 Buy milk', '2026-09-09'))).toBe('2026-01-01 Buy milk')
  })

  it('keeps a typed priority ahead of the stamped date', () => {
    expect(formatTask(createTask('(A) Buy milk +house', '2026-09-09'))).toBe(
      '(A) 2026-09-09 Buy milk +house',
    )
  })
})

describe('raw field consistency', () => {
  it('complete updates raw to reflect the mutated task', () => {
    const t = complete(parseLine('Buy milk'), '2026-09-10')
    expect(t.raw).toBe(formatTask(t))
  })

  it('uncomplete updates raw to reflect the mutated task', () => {
    const t = uncomplete(parseLine('x 2026-09-10 2026-09-09 Buy milk'))
    expect(t.raw).toBe(formatTask(t))
  })

  it('complete with priority restores it as a pair and updates raw', () => {
    const t = complete(parseLine('(A) Buy milk'), '2026-09-10')
    expect(t.raw).toBe(formatTask(t))
    expect(t.raw).toBe('x 2026-09-10 Buy milk pri:A')
  })
})
