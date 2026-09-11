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
      sort: 'manual' as const,
    })
    const params = new URLSearchParams(query)
    expect(params.getAll('project')).toEqual(['house', 'work'])
    expect(params.getAll('context')).toEqual(['phone'])
    expect(params.getAll('pri')).toEqual(['A'])
    expect(params.get('q')).toBe('call plumber')
    expect(params.get('done')).toBe('1')
    expect(params.get('due')).toBe('overdue')
    expect(params.get('sort')).toBe('manual')
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
      sort: 'manual' as const,
    }
    expect(filterFromQuery(filterToQuery(filter))).toEqual(filter)
  })

  it('round trips values with special characters including commas', () => {
    const filter = {
      projects: ['my,project', 'work&life', 'key=value'],
      contexts: ['area+office', 'place with space', 'café'],
      priorities: ['A', 'B%'],
      search: 'find & replace % something',
      showCompleted: false,
      dueView: 'today' as const,
      sort: 'smart' as const,
    }
    expect(filterFromQuery(filterToQuery(filter))).toEqual(filter)
  })

  it('drops empty list parameters instead of filtering on an empty string', () => {
    expect(filterFromQuery('?project=&context=&pri=')).toEqual(emptyFilter())
  })

  it('defaults sort to smart, or to the given default when the URL is silent', () => {
    expect(filterFromQuery('').sort).toBe('smart')
    expect(filterFromQuery('', 'manual').sort).toBe('manual')
    expect(filterFromQuery('sort=manual').sort).toBe('manual')
    expect(filterFromQuery('sort=nonsense', 'manual').sort).toBe('manual')
  })
})
