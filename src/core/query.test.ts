import { describe, it, expect } from 'vitest'
import {
  emptyFilter,
  filterTasks,
  sortTasks,
  collectProjects,
  collectContexts,
  collectPriorities,
  countByProject,
  countByContext,
} from './query'
import { parseFile } from './parse'
import { formatTask } from './format'

const TODAY = '2026-09-10'

const sample = parseFile(
  [
    '(A) Call plumber +house @phone',
    '(B) Email landlord +house @computer due:2026-09-10',
    'Buy milk +groceries @store due:2026-09-01',
    'Read book @home due:2026-09-14',
    'Plan trip @home due:2026-09-30',
    'x 2026-09-09 Old task +house',
  ].join('\n'),
)

describe('collectors', () => {
  it('collects sorted unique projects', () => {
    expect(collectProjects(sample)).toEqual(['groceries', 'house'])
  })

  it('collects sorted unique contexts', () => {
    expect(collectContexts(sample)).toEqual(['computer', 'home', 'phone', 'store'])
  })

  it('collects sorted unique priorities', () => {
    expect(collectPriorities(sample)).toEqual(['A', 'B'])
  })

  it('counts open tasks per project, keeping labels only completed tasks carry', () => {
    const tasks = parseFile('a +house\nb +house\nx 2026-09-09 c +house\nx 2026-09-09 d +old\n')
    expect([...countByProject(tasks)]).toEqual([
      ['house', 2],
      ['old', 0],
    ])
  })

  it('counts open tasks per context', () => {
    const tasks = parseFile('a @phone @home\nx 2026-09-09 b @phone\n')
    expect([...countByContext(tasks)]).toEqual([
      ['home', 1],
      ['phone', 1],
    ])
  })
})

describe('filterTasks', () => {
  it('hides completed tasks by default', () => {
    const out = filterTasks(sample, emptyFilter(), TODAY)
    expect(out.every((t) => !t.completed)).toBe(true)
    expect(out).toHaveLength(5)
  })

  it('shows completed tasks when asked', () => {
    const out = filterTasks(sample, { ...emptyFilter(), showCompleted: true }, TODAY)
    expect(out).toHaveLength(6)
  })

  it('filters by project', () => {
    const out = filterTasks(sample, { ...emptyFilter(), projects: ['house'] }, TODAY)
    expect(out).toHaveLength(2)
  })

  it('ORs within a category', () => {
    const out = filterTasks(sample, { ...emptyFilter(), contexts: ['phone', 'store'] }, TODAY)
    expect(out).toHaveLength(2)
  })

  it('ANDs across categories', () => {
    const out = filterTasks(
      sample,
      { ...emptyFilter(), projects: ['house'], contexts: ['phone'] },
      TODAY,
    )
    expect(out).toHaveLength(1)
    expect(out[0]?.description).toContain('plumber')
  })

  it('filters by priority', () => {
    const out = filterTasks(sample, { ...emptyFilter(), priorities: ['A'] }, TODAY)
    expect(out).toHaveLength(1)
  })

  it('searches case-insensitively across the line', () => {
    const out = filterTasks(sample, { ...emptyFilter(), search: 'PLUMBER' }, TODAY)
    expect(out).toHaveLength(1)
  })

  it('selects overdue tasks', () => {
    const out = filterTasks(sample, { ...emptyFilter(), dueView: 'overdue' }, TODAY)
    expect(out).toHaveLength(1)
    expect(out[0]?.description).toContain('milk')
  })

  it('selects tasks due today', () => {
    const out = filterTasks(sample, { ...emptyFilter(), dueView: 'today' }, TODAY)
    expect(out).toHaveLength(1)
    expect(out[0]?.description).toContain('landlord')
  })

  it('selects tasks due in the next seven days including today', () => {
    const out = filterTasks(sample, { ...emptyFilter(), dueView: 'upcoming' }, TODAY)
    expect(out).toHaveLength(2)
  })

  it('excludes undated tasks from due views', () => {
    const out = filterTasks(sample, { ...emptyFilter(), dueView: 'upcoming' }, TODAY)
    expect(out.every((t) => t.pairs['due'] !== undefined)).toBe(true)
  })
})

describe('filterTasks with a query', () => {
  it('reads operators in the search text', () => {
    const filter = { ...emptyFilter(), search: '@home & !due:2026-09-14' }
    expect(filterTasks(sample, filter, TODAY).map((t) => t.description)).toEqual([
      'Plan trip @home due:2026-09-30',
    ])
  })

  it('ands the query with the chips', () => {
    const filter = { ...emptyFilter(), search: 'due:today | overdue', projects: ['house'] }
    expect(filterTasks(sample, filter, TODAY).map((t) => t.description)).toEqual([
      'Email landlord +house @computer due:2026-09-10',
    ])
  })

  it('keeps completed tasks hidden even when the query asks for done', () => {
    expect(filterTasks(sample, { ...emptyFilter(), search: 'done' }, TODAY)).toEqual([])
    const shown = { ...emptyFilter(), search: 'done', showCompleted: true }
    expect(filterTasks(sample, shown, TODAY).map((t) => t.description)).toEqual(['Old task +house'])
  })

  it('throws on a syntax error', () => {
    expect(() => filterTasks(sample, { ...emptyFilter(), search: '(+house' }, TODAY)).toThrow(
      'Missing a closing parenthesis',
    )
  })
})

describe('sortTasks', () => {
  it('orders incomplete before complete, then priority, then due date', () => {
    const tasks = parseFile(
      [
        'x 2026-09-09 Done thing',
        'No priority no due',
        '(B) Second',
        'Undated but named due:2026-09-11',
        '(A) First',
      ].join('\n'),
    )
    const out = sortTasks(tasks, 'smart').map((t) => formatTask(t))
    expect(out).toEqual([
      '(A) First',
      '(B) Second',
      'Undated but named due:2026-09-11',
      'No priority no due',
      'x 2026-09-09 Done thing',
    ])
  })

  it('does not mutate the input array', () => {
    const tasks = parseFile('(B) b\n(A) a')
    const before = tasks.map((t) => t.description)
    sortTasks(tasks, 'smart')
    expect(tasks.map((t) => t.description)).toEqual(before)
  })

  it('keeps file order in manual mode with completed tasks last', () => {
    const tasks = parseFile(
      ['x 2026-09-09 Done thing', '(B) Second', '(A) First', 'x 2026-09-08 Other done'].join('\n'),
    )
    const out = sortTasks(tasks, 'manual').map((t) => formatTask(t))
    expect(out).toEqual([
      '(B) Second',
      '(A) First',
      'x 2026-09-09 Done thing',
      'x 2026-09-08 Other done',
    ])
  })
})
