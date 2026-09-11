import { describe, expect, test } from 'vitest'
import { parseLine } from './parse'
import { blockerOf, ensureId, isBlocked, setDependency, wouldCycle } from './deps'

describe('ensureId', () => {
  test('gives a task an id word once', () => {
    const task = parseLine('Buy milk +groceries')
    const withId = ensureId(task)
    expect(withId.pairs['id']).toMatch(/^[a-z0-9]{6}$/)
    expect(withId.description).toBe(`Buy milk +groceries id:${withId.pairs['id']}`)
    expect(ensureId(withId)).toBe(withId)
  })
})

describe('setDependency', () => {
  test('adds, replaces and removes the dep word', () => {
    const task = parseLine('Bake cake')
    const dep = setDependency(task, 'abc123')
    expect(dep.description).toBe('Bake cake dep:abc123')
    expect(setDependency(dep, 'xyz789').description).toBe('Bake cake dep:xyz789')
    expect(setDependency(dep, null).description).toBe('Bake cake')
  })
})

describe('blocked', () => {
  const milk = parseLine('Buy milk id:abc123')
  const cake = parseLine('Bake cake dep:abc123')

  test('a task is blocked while its dependency is open', () => {
    expect(isBlocked(cake, [milk, cake])).toBe(true)
    expect(blockerOf(cake, [milk, cake])).toBe(milk)
  })

  test('a completed dependency does not block', () => {
    const done = parseLine('x 2026-09-10 Buy milk id:abc123')
    expect(isBlocked(cake, [done, cake])).toBe(false)
  })

  test('a dependency that is gone does not block', () => {
    expect(isBlocked(cake, [cake])).toBe(false)
    expect(blockerOf(cake, [cake])).toBeUndefined()
  })

  test('a task without a dep word is never blocked', () => {
    expect(isBlocked(milk, [milk, cake])).toBe(false)
  })
})

describe('wouldCycle', () => {
  const a = parseLine('A id:aaaaaa dep:bbbbbb')
  const b = parseLine('B id:bbbbbb dep:cccccc')
  const c = parseLine('C id:cccccc')
  const tasks = [a, b, c]

  test('depending on a task downstream of you is a cycle', () => {
    expect(wouldCycle(c, a, tasks)).toBe(true)
    expect(wouldCycle(c, b, tasks)).toBe(true)
    expect(wouldCycle(b, a, tasks)).toBe(true)
  })

  test('depending on yourself is a cycle', () => {
    expect(wouldCycle(a, a, tasks)).toBe(true)
  })

  test('otherwise it is not', () => {
    expect(wouldCycle(a, c, tasks)).toBe(false)
    expect(wouldCycle(parseLine('D'), a, tasks)).toBe(false)
  })
})
