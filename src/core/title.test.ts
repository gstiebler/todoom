import { describe, it, expect } from 'vitest'
import { taskTitle, setTitle } from './title'
import { parseLine } from './parse'

describe('taskTitle', () => {
  it('is the description without the machinery', () => {
    const task = parseLine('(A) Buy milk +groceries @shop due:2026-09-12 desc:"two words" file:aaa')
    expect(taskTitle(task)).toBe('Buy milk')
  })

  it('falls back to the description when there is nothing else', () => {
    expect(taskTitle(parseLine('+groceries'))).toBe('+groceries')
  })
})

describe('setTitle', () => {
  it('keeps the tags, pairs and note the task already had', () => {
    const task = parseLine('Buy milk +groceries due:2026-09-12 desc:"two words"')
    expect(setTitle(task, 'Buy oat milk').raw).toBe(
      'Buy oat milk +groceries due:2026-09-12 desc:"two words"',
    )
  })

  it('leaves the task alone when the new title is blank', () => {
    const task = parseLine('Buy milk +groceries')
    expect(setTitle(task, '   ')).toBe(task)
  })
})
