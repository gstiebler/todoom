import { describe, expect, test } from 'vitest'
import { formatFilters, parseFilters } from './filters'

describe('parseFilters', () => {
  test('reads one name: query per line', () => {
    expect(parseFilters('Home calls: +home & @phone\nSoon: due before:tomorrow\n')).toEqual([
      { name: 'Home calls', query: '+home & @phone', column: false },
      { name: 'Soon', query: 'due before:tomorrow', column: false },
    ])
  })

  test('splits on the first colon-space only', () => {
    expect(parseFilters('Due: due:today\n')).toEqual([
      { name: 'Due', query: 'due:today', column: false },
    ])
  })

  test('ignores blank, nameless and malformed lines', () => {
    expect(parseFilters('\n: +home\nno separator\n  \n')).toEqual([])
  })

  test('ignores an indented nameless line', () => {
    expect(parseFilters('  : +home\n')).toEqual([])
  })

  test('reads a leading "* " as the column marker', () => {
    expect(parseFilters('* Urgent: +house & (A)\nLater: due after:today\n')).toEqual([
      { name: 'Urgent', query: '+house & (A)', column: true },
      { name: 'Later', query: 'due after:today', column: false },
    ])
  })
})

describe('formatFilters', () => {
  test('round-trips', () => {
    const filters = [
      { name: 'A', query: '+a', column: false },
      { name: 'B', query: '@b | done', column: false },
    ]
    expect(formatFilters(filters)).toBe('A: +a\nB: @b | done\n')
    expect(parseFilters(formatFilters(filters))).toEqual(filters)
  })

  test('is empty for no filters', () => {
    expect(formatFilters([])).toBe('')
  })

  test('writes the column marker', () => {
    const filters = [
      { name: 'A', query: '+a', column: true },
      { name: 'B', query: '@b', column: false },
    ]
    expect(formatFilters(filters)).toBe('* A: +a\nB: @b\n')
    expect(parseFilters(formatFilters(filters))).toEqual(filters)
  })
})
