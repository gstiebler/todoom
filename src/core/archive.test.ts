import { describe, it, expect } from 'vitest'
import { splitCompleted } from './archive'
import { parseFile } from './parse'

describe('splitCompleted', () => {
  it('separates completed from incomplete tasks', () => {
    const tasks = parseFile('a\nx 2026-09-09 b\nc\nx 2026-09-08 d')
    const { keep, archive } = splitCompleted(tasks)
    expect(keep.map((t) => t.description)).toEqual(['a', 'c'])
    expect(archive.map((t) => t.description)).toEqual(['b', 'd'])
  })

  it('returns an empty archive when nothing is complete', () => {
    const { keep, archive } = splitCompleted(parseFile('a\nb'))
    expect(keep).toHaveLength(2)
    expect(archive).toHaveLength(0)
  })

  it('does not mutate the input', () => {
    const tasks = parseFile('a\nx 2026-09-09 b')
    splitCompleted(tasks)
    expect(tasks).toHaveLength(2)
  })
})
