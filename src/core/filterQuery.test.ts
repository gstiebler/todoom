import { describe, expect, test } from 'vitest'
import { parseQuery, matchesQuery } from './filterQuery'
import { parseFile } from './parse'

describe('parseQuery terms', () => {
  test('is null for blank text', () => {
    expect(parseQuery('')).toBeNull()
    expect(parseQuery('   ')).toBeNull()
  })

  test('reads plain words as lower-cased text', () => {
    expect(parseQuery('Milk')).toEqual({ kind: 'text', value: 'milk' })
  })

  test('reads projects and contexts', () => {
    expect(parseQuery('+home')).toEqual({ kind: 'project', value: 'home' })
    expect(parseQuery('@phone')).toEqual({ kind: 'context', value: 'phone' })
  })

  test('keeps a lone + or @ as text', () => {
    expect(parseQuery('+')).toEqual({ kind: 'text', value: '+' })
  })

  test('reads priorities in both spellings', () => {
    expect(parseQuery('(A)')).toEqual({ kind: 'priority', value: 'A' })
    expect(parseQuery('pri:b')).toEqual({ kind: 'priority', value: 'B' })
    expect(parseQuery('no pri')).toEqual({ kind: 'priority', value: null })
  })

  test('reads due dates', () => {
    expect(parseQuery('due:today')).toEqual({ kind: 'date', field: 'due', op: 'on', value: 'today' })
    expect(parseQuery('due:2026-09-12')).toEqual({
      kind: 'date',
      field: 'due',
      op: 'on',
      value: '2026-09-12',
    })
    expect(parseQuery('due before:tomorrow')).toEqual({
      kind: 'date',
      field: 'due',
      op: 'before',
      value: 'tomorrow',
    })
    expect(parseQuery('due after:yesterday')).toEqual({
      kind: 'date',
      field: 'due',
      op: 'after',
      value: 'yesterday',
    })
    expect(parseQuery('due:none')).toEqual({ kind: 'date', field: 'due', op: 'none' })
    expect(parseQuery('no date')).toEqual({ kind: 'date', field: 'due', op: 'none' })
    expect(parseQuery('due:overdue')).toEqual({ kind: 'date', field: 'due', op: 'overdue' })
    expect(parseQuery('overdue')).toEqual({ kind: 'date', field: 'due', op: 'overdue' })
  })

  test('reads deadlines with the same forms', () => {
    expect(parseQuery('deadline before:today')).toEqual({
      kind: 'date',
      field: 'deadline',
      op: 'before',
      value: 'today',
    })
    expect(parseQuery('no deadline')).toEqual({ kind: 'date', field: 'deadline', op: 'none' })
    expect(parseQuery('deadline:overdue')).toEqual({
      kind: 'date',
      field: 'deadline',
      op: 'overdue',
    })
  })

  test('rejects a date it cannot read', () => {
    expect(() => parseQuery('due:soon')).toThrow('Unknown date: soon')
    expect(() => parseQuery('due:2026-13-01')).toThrow('Unknown date: 2026-13-01')
  })

  test('reads the flag terms', () => {
    expect(parseQuery('done')).toEqual({ kind: 'done' })
    expect(parseQuery('blocked')).toEqual({ kind: 'blocked' })
    expect(parseQuery('rec')).toEqual({ kind: 'rec' })
  })

  test('keeps a lone "no" as text', () => {
    expect(parseQuery('no')).toEqual({ kind: 'text', value: 'no' })
    expect(parseQuery('no milk')).toEqual({
      kind: 'and',
      queries: [
        { kind: 'text', value: 'no' },
        { kind: 'text', value: 'milk' },
      ],
    })
  })
})

describe('parseQuery operators', () => {
  test('joins neighbouring terms with and', () => {
    expect(parseQuery('+home @phone')).toEqual({
      kind: 'and',
      queries: [
        { kind: 'project', value: 'home' },
        { kind: 'context', value: 'phone' },
      ],
    })
  })

  test('binds not tighter than and, and and tighter than or', () => {
    expect(parseQuery('!done & +home | @phone')).toEqual({
      kind: 'or',
      queries: [
        {
          kind: 'and',
          queries: [{ kind: 'not', query: { kind: 'done' } }, { kind: 'project', value: 'home' }],
        },
        { kind: 'context', value: 'phone' },
      ],
    })
  })

  test('groups with parentheses and ignores spacing around operators', () => {
    expect(parseQuery('(+home|@phone)&!done')).toEqual({
      kind: 'and',
      queries: [
        {
          kind: 'or',
          queries: [
            { kind: 'project', value: 'home' },
            { kind: 'context', value: 'phone' },
          ],
        },
        { kind: 'not', query: { kind: 'done' } },
      ],
    })
  })

  test('tells a priority from a group', () => {
    expect(parseQuery('(A) (+home)')).toEqual({
      kind: 'and',
      queries: [
        { kind: 'priority', value: 'A' },
        { kind: 'project', value: 'home' },
      ],
    })
  })

  test('rejects unbalanced parentheses', () => {
    expect(() => parseQuery('(+home')).toThrow('Missing a closing parenthesis')
    expect(() => parseQuery('+home)')).toThrow('Unexpected )')
  })

  test('rejects a missing operand', () => {
    expect(() => parseQuery('+home &')).toThrow('Missing a term at the end')
    expect(() => parseQuery('& +home')).toThrow('Unexpected &')
    expect(() => parseQuery('+home | | @phone')).toThrow('Unexpected |')
  })

  test('rejects an empty group', () => {
    expect(() => parseQuery('()')).toThrow('Empty parentheses')
  })
})

const TODAY = '2026-09-10'

const tasks = parseFile(
  [
    '(A) Call plumber +house @phone due:2026-09-10 id:abc123',
    'Buy milk +groceries @store due:2026-09-01 rec:1w',
    'Read book @home deadline:2026-09-11 dep:abc123',
    'Plan trip @home due:2026-09-30',
    'x 2026-09-09 Old task +house',
  ].join('\n'),
)

function matching(text: string): string[] {
  const query = parseQuery(text)
  if (!query) throw new Error('blank query')
  return tasks.filter((task) => matchesQuery(query, task, tasks, TODAY)).map((t) => t.description)
}

describe('matchesQuery', () => {
  test('text searches the raw line case-insensitively', () => {
    expect(matching('MILK')).toEqual(['Buy milk +groceries @store due:2026-09-01 rec:1w'])
  })

  test('projects, contexts and priorities', () => {
    expect(matching('+house')).toHaveLength(2)
    expect(matching('@home')).toHaveLength(2)
    expect(matching('(A)')).toHaveLength(1)
    expect(matching('no pri')).toHaveLength(4)
  })

  test('due dates relative to today', () => {
    expect(matching('due:today').map((d) => d.split(' ')[0])).toEqual(['Call'])
    expect(matching('overdue').map((d) => d.split(' ')[0])).toEqual(['Buy'])
    expect(matching('due before:tomorrow')).toHaveLength(2)
    expect(matching('due after:today').map((d) => d.split(' ')[0])).toEqual(['Plan'])
    expect(matching('due:2026-09-30')).toHaveLength(1)
    expect(matching('no date')).toHaveLength(2)
  })

  test('deadlines', () => {
    expect(matching('deadline:tomorrow').map((d) => d.split(' ')[0])).toEqual(['Read'])
    expect(matching('deadline:overdue')).toHaveLength(0)
    expect(matching('no deadline')).toHaveLength(4)
  })

  test('done, blocked and rec', () => {
    expect(matching('done').map((d) => d.split(' ')[0])).toEqual(['Old'])
    expect(matching('blocked').map((d) => d.split(' ')[0])).toEqual(['Read'])
    expect(matching('rec').map((d) => d.split(' ')[0])).toEqual(['Buy'])
  })

  test('combines with the operators', () => {
    expect(matching('@home & !blocked').map((d) => d.split(' ')[0])).toEqual(['Plan'])
    expect(matching('(A) | rec')).toHaveLength(2)
    expect(matching('!(+house | @home)').map((d) => d.split(' ')[0])).toEqual(['Buy'])
  })
})
