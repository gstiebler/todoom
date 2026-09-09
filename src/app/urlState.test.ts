import { describe, it, expect } from 'vitest'
import { filterToQuery, filterFromQuery } from './urlState'
import { emptyFilter } from '../core/query'

describe('filterToQuery', () => {
  it('returns an empty string for the default filter', () => {
    expect(filterToQuery(emptyFilter())).toBe('')
  })

  it('encodes each populated field', () => {
    const query = filterToQuery({
      projects: ['house', 'work'],
      contexts: ['phone'],
      priorities: ['A'],
      search: 'call plumber',
      showCompleted: true,
      dueView: 'overdue',
    })
    const params = new URLSearchParams(query)
    expect(params.get('project')).toBe('house,work')
    expect(params.get('context')).toBe('phone')
    expect(params.get('pri')).toBe('A')
    expect(params.get('q')).toBe('call plumber')
    expect(params.get('done')).toBe('1')
    expect(params.get('due')).toBe('overdue')
  })
})

describe('filterFromQuery', () => {
  it('returns the default filter for an empty query', () => {
    expect(filterFromQuery('')).toEqual(emptyFilter())
  })

  it('tolerates a leading question mark', () => {
    expect(filterFromQuery('?project=house').projects).toEqual(['house'])
  })

  it('ignores an unknown due view', () => {
    expect(filterFromQuery('due=nonsense').dueView).toBe('all')
  })

  it('round trips a populated filter', () => {
    const filter = {
      projects: ['house'],
      contexts: ['phone', 'home'],
      priorities: ['A', 'B'],
      search: 'milk',
      showCompleted: true,
      dueView: 'upcoming' as const,
    }
    expect(filterFromQuery(filterToQuery(filter))).toEqual(filter)
  })
})
