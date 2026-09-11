import { describe, expect, test } from 'vitest'
import { formatFilters, parseFilters } from './filters'

describe('parseFilters', () => {
  test('reads one name: query per line', () => {
    expect(parseFilters('Home calls: +home & @phone\nSoon: due before:tomorrow\n')).toEqual([
      { name: 'Home calls', query: '+home & @phone' },
      { name: 'Soon', query: 'due before:tomorrow' },
    ])
  })

  test('splits on the first colon-space only', () => {
    expect(parseFilters('Due: due:today\n')).toEqual([{ name: 'Due', query: 'due:today' }])
  })

  test('ignores blank, nameless and malformed lines', () => {
    expect(parseFilters('\n: +home\nno separator\n  \n')).toEqual([])
  })

  test('ignores an indented nameless line', () => {
    expect(parseFilters('  : +home\n')).toEqual([])
  })
})

describe('formatFilters', () => {
  test('round-trips', () => {
    const filters = [{ name: 'A', query: '+a' }, { name: 'B', query: '@b | done' }]
    expect(formatFilters(filters)).toBe('A: +a\nB: @b | done\n')
    expect(parseFilters(formatFilters(filters))).toEqual(filters)
  })

  test('is empty for no filters', () => {
    expect(formatFilters([])).toBe('')
  })
})
