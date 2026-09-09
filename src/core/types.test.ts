import { describe, it, expect } from 'vitest'
import { emptyTask } from './types'

describe('emptyTask', () => {
  it('creates an incomplete task with no tokens', () => {
    const t = emptyTask()
    expect(t.completed).toBe(false)
    expect(t.description).toBe('')
    expect(t.projects).toEqual([])
    expect(t.contexts).toEqual([])
    expect(t.pairs).toEqual({})
  })
})
