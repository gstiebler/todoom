# Smart Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Todoist-like query language in the search box, and saved filters kept in `filters.txt` on Drive and listed in the sidebar.

**Architecture:** A pure parser/evaluator in `src/core/filterQuery.ts` (tokenizer → recursive descent → `Query` AST → `matchesQuery`). `filterTasks` parses `filter.search` once and ANDs the query with the existing chips and views. `TodoomApp` keeps the last query that parsed so a half-typed query never blanks the list, and reads/writes `filters.txt` with the same store calls `done.txt` uses. The sidebar gains a "Save as filter" affordance and a Filters section.

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess`), MobX 7, React 19, Vitest (`// @vitest-environment jsdom` for UI tests), Playwright.

**Spec:** `docs/superpowers/specs/2026-09-10-smart-filters-design.md`

## Global Constraints

- House style: single quotes, no semicolons, ~100 columns, comments only where the code cannot say it.
- No migration of anything pre-existing; `filters.txt` is created on first read via `findOrCreateFileIn`.
- Errors bubble up; the only `try/catch` is the one that turns a parse error into a message for the UI.
- Terms table, operator precedence (`!` > `&` > `|`), juxtaposition = `&`, and the error rule are exactly as in the spec.
- `showCompleted` remains the master switch for completed tasks; `done` in a query only narrows.
- Sidebar chip groups already use the class `.filters`; saved filters use `.saved*` classes.
- Gate before every commit: `npx tsc --noEmit && npx vitest run`. Task 7 also runs `npx playwright test && npm run build`.

---

### Task 1: Query tokenizer and parser

**Files:**
- Create: `src/core/filterQuery.ts`
- Test: `src/core/filterQuery.test.ts`

**Interfaces:**
- Produces: `type Query`, `parseQuery(text: string): Query | null` (null for blank text; throws `Error` on syntax errors).

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, test } from 'vitest'
import { parseQuery } from './filterQuery'

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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/core/filterQuery.test.ts`
Expected: FAIL — cannot resolve `./filterQuery`.

- [ ] **Step 3: Write the tokenizer and parser**

`src/core/filterQuery.ts`:

```ts
import { isValidDate } from './dates'

export type DateField = 'due' | 'deadline'
export type DateOp = 'on' | 'before' | 'after' | 'none' | 'overdue'

export type Query =
  | { kind: 'text'; value: string }
  | { kind: 'project'; value: string }
  | { kind: 'context'; value: string }
  | { kind: 'priority'; value: string | null }
  | { kind: 'date'; field: DateField; op: DateOp; value?: string }
  | { kind: 'done' }
  | { kind: 'blocked' }
  | { kind: 'rec' }
  | { kind: 'not'; query: Query }
  | { kind: 'and'; queries: Query[] }
  | { kind: 'or'; queries: Query[] }

type Operator = '(' | ')' | '&' | '|' | '!'
type Token = Operator | { word: string }

// `(A)` is read before a bare `(` so a priority never opens a group.
const TOKEN_RE = /\([A-Za-z]\)|[()&|!]|[^\s()&|!]+/g
const OPERATORS = '()&|!'
const TWO_WORDS = new Set(['no date', 'no pri', 'no deadline'])
const DATE_WORDS = new Set(['today', 'tomorrow', 'yesterday'])

function isOperator(raw: string): raw is Operator {
  return raw.length === 1 && OPERATORS.includes(raw)
}

// Two-word terms are joined here, so `no` on its own stays a text word.
function tokenize(text: string): Token[] {
  const raw = text.match(TOKEN_RE) ?? []
  const tokens: Token[] = []
  let skip = false
  raw.forEach((current, i) => {
    if (skip) {
      skip = false
      return
    }
    if (isOperator(current)) {
      tokens.push(current)
      return
    }
    const pair = `${current} ${raw[i + 1] ?? ''}`
    if (TWO_WORDS.has(pair.toLowerCase()) || /^(due|deadline) (before|after):\S+$/i.test(pair)) {
      tokens.push({ word: pair })
      skip = true
      return
    }
    tokens.push({ word: current })
  })
  return tokens
}

function dateTerm(field: DateField, op: 'on' | 'before' | 'after', value: string): Query {
  const lower = value.toLowerCase()
  if (op === 'on' && lower === 'none') return { kind: 'date', field, op: 'none' }
  if (op === 'on' && lower === 'overdue') return { kind: 'date', field, op: 'overdue' }
  if (DATE_WORDS.has(lower)) return { kind: 'date', field, op, value: lower }
  if (!isValidDate(value)) throw new Error(`Unknown date: ${value}`)
  return { kind: 'date', field, op, value }
}

function term(word: string): Query {
  const lower = word.toLowerCase()
  const priority = /^\(([a-z])\)$|^pri:([a-z])$/.exec(lower)
  if (priority) return { kind: 'priority', value: (priority[1] ?? priority[2] ?? '').toUpperCase() }
  if (lower === 'no pri') return { kind: 'priority', value: null }
  if (lower === 'no date') return { kind: 'date', field: 'due', op: 'none' }
  if (lower === 'no deadline') return { kind: 'date', field: 'deadline', op: 'none' }
  if (lower === 'overdue') return { kind: 'date', field: 'due', op: 'overdue' }
  if (lower === 'done') return { kind: 'done' }
  if (lower === 'blocked') return { kind: 'blocked' }
  if (lower === 'rec') return { kind: 'rec' }
  const dated = /^(due|deadline)(?: (before|after))?:(.+)$/i.exec(word)
  if (dated) {
    const field = (dated[1] ?? '').toLowerCase() as DateField
    const op = ((dated[2] ?? 'on').toLowerCase()) as 'on' | 'before' | 'after'
    return dateTerm(field, op, dated[3] ?? '')
  }
  if (word.length > 1 && word.startsWith('+')) return { kind: 'project', value: word.slice(1) }
  if (word.length > 1 && word.startsWith('@')) return { kind: 'context', value: word.slice(1) }
  return { kind: 'text', value: lower }
}

function group(kind: 'and' | 'or', queries: Query[]): Query {
  const [first] = queries
  return queries.length === 1 && first ? first : { kind, queries }
}

// or := and ('|' and)* ; and := unary (['&'] unary)* ; unary := '!' unary | '(' or ')' | term
class Parser {
  private pos = 0

  constructor(private readonly tokens: Token[]) {}

  done(): boolean {
    return this.pos >= this.tokens.length
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos]
  }

  private take(): Token | undefined {
    const token = this.tokens[this.pos]
    this.pos += 1
    return token
  }

  parseOr(): Query {
    const queries = [this.parseAnd()]
    while (this.peek() === '|') {
      this.pos += 1
      queries.push(this.parseAnd())
    }
    return group('or', queries)
  }

  private parseAnd(): Query {
    const queries = [this.parseUnary()]
    for (;;) {
      const next = this.peek()
      if (next === undefined || next === ')' || next === '|') break
      if (next === '&') this.pos += 1
      queries.push(this.parseUnary())
    }
    return group('and', queries)
  }

  private parseUnary(): Query {
    const token = this.take()
    if (token === undefined) throw new Error('Missing a term at the end')
    if (token === '!') return { kind: 'not', query: this.parseUnary() }
    if (token === '(') {
      if (this.peek() === ')') throw new Error('Empty parentheses')
      const query = this.parseOr()
      if (this.take() !== ')') throw new Error('Missing a closing parenthesis')
      return query
    }
    if (typeof token === 'string') throw new Error(`Unexpected ${token}`)
    return term(token.word)
  }
}

/** Null for blank text; throws on a syntax error, never on plain words. */
export function parseQuery(text: string): Query | null {
  const tokens = tokenize(text)
  if (tokens.length === 0) return null
  const parser = new Parser(tokens)
  const query = parser.parseOr()
  // Only a stray `)` can stop parseOr before the end.
  if (!parser.done()) throw new Error('Unexpected )')
  return query
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx tsc --noEmit && npx vitest run src/core/filterQuery.test.ts`
Expected: PASS, 17 tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/filterQuery.ts src/core/filterQuery.test.ts
git commit -m "feat: parse filter queries"
```

---

### Task 2: Query evaluator

**Files:**
- Modify: `src/core/filterQuery.ts`
- Test: `src/core/filterQuery.test.ts`

**Interfaces:**
- Consumes: `Query`, `blockerOf(task, tasks)` from `src/core/deps.ts`, `addInterval`/`isValidDate` from `src/core/dates.ts`.
- Produces: `matchesQuery(query: Query, task: Task, tasks: Task[], today: string): boolean`.

- [ ] **Step 1: Write the failing tests**

Append to `src/core/filterQuery.test.ts` (add `import { parseFile } from './parse'` and `matchesQuery` to the existing import):

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/core/filterQuery.test.ts`
Expected: FAIL — `matchesQuery` is not exported.

- [ ] **Step 3: Write the evaluator**

Append to `src/core/filterQuery.ts`; add `import type { Task } from './types'`, `import { blockerOf } from './deps'`, and change the dates import to `import { addInterval, isValidDate } from './dates'`:

```ts
function resolveDate(value: string, today: string): string {
  if (value === 'today') return today
  if (value === 'tomorrow') return addInterval(today, 1, 'd')
  if (value === 'yesterday') return addInterval(today, -1, 'd')
  return value
}

function dateOf(task: Task, field: DateField): string | undefined {
  const value = task.pairs[field]
  return value && isValidDate(value) ? value : undefined
}

// Valid ISO dates sort as strings, so the comparisons need no parsing.
function matchesDate(
  query: Extract<Query, { kind: 'date' }>,
  task: Task,
  today: string,
): boolean {
  const date = dateOf(task, query.field)
  if (query.op === 'none') return date === undefined
  if (date === undefined) return false
  if (query.op === 'overdue') return date < today
  const target = resolveDate(query.value ?? today, today)
  if (query.op === 'on') return date === target
  return query.op === 'before' ? date < target : date > target
}

export function matchesQuery(query: Query, task: Task, tasks: Task[], today: string): boolean {
  switch (query.kind) {
    case 'text':
      return (
        task.raw.toLowerCase().includes(query.value) ||
        task.description.toLowerCase().includes(query.value)
      )
    case 'project':
      return task.projects.includes(query.value)
    case 'context':
      return task.contexts.includes(query.value)
    case 'priority':
      return query.value === null ? task.priority === undefined : task.priority === query.value
    case 'date':
      return matchesDate(query, task, today)
    case 'done':
      return task.completed
    case 'blocked':
      return blockerOf(task, tasks) !== undefined
    case 'rec':
      return task.pairs['rec'] !== undefined
    case 'not':
      return !matchesQuery(query.query, task, tasks, today)
    case 'and':
      return query.queries.every((q) => matchesQuery(q, task, tasks, today))
    case 'or':
      return query.queries.some((q) => matchesQuery(q, task, tasks, today))
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx tsc --noEmit && npx vitest run src/core/filterQuery.test.ts`
Expected: PASS, 23 tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/filterQuery.ts src/core/filterQuery.test.ts
git commit -m "feat: evaluate filter queries against tasks"
```

---

### Task 3: Search box drives the query

**Files:**
- Modify: `src/core/query.ts:57-76`
- Test: `src/core/query.test.ts`

**Interfaces:**
- Consumes: `parseQuery`, `matchesQuery`.
- Produces: `filterTasks(tasks, filter, today)` unchanged in signature; now throws on a query syntax error.

- [ ] **Step 1: Write the failing tests**

Append to `src/core/query.test.ts` (the `sample` fixture and `TODAY` are already defined at the top of the file):

```ts
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
      '(B) Email landlord +house @computer due:2026-09-10',
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/core/query.test.ts`
Expected: FAIL — the first and last new tests (substring search does not know operators).

- [ ] **Step 3: Replace the substring search**

In `src/core/query.ts` add `import { matchesQuery, parseQuery } from './filterQuery'` and change `filterTasks` to:

```ts
export function filterTasks(tasks: Task[], filter: Filter, today: string): Task[] {
  const query = parseQuery(filter.search)
  return tasks.filter((task) => {
    if (!filter.showCompleted && task.completed) return false
    if (filter.projects.length > 0 && !filter.projects.some((p) => task.projects.includes(p))) {
      return false
    }
    if (filter.contexts.length > 0 && !filter.contexts.some((c) => task.contexts.includes(c))) {
      return false
    }
    if (filter.priorities.length > 0) {
      if (task.priority === undefined || !filter.priorities.includes(task.priority)) return false
    }
    if (query && !matchesQuery(query, task, tasks, today)) return false
    if (!matchesDueView(task, filter.dueView, today)) return false
    return true
  })
}
```

- [ ] **Step 4: Run the whole suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS. If an existing search test typed a word the tokenizer now treats as an operator, update that test's search text — the spec makes `&`, `|`, `!`, `(`, `)` operators.

- [ ] **Step 5: Commit**

```bash
git add src/core/query.ts src/core/query.test.ts
git commit -m "feat: search box accepts filter queries"
```

---

### Task 4: filters.txt format

**Files:**
- Create: `src/core/filters.ts`
- Test: `src/core/filters.test.ts`

**Interfaces:**
- Produces: `interface SavedFilter { name: string; query: string }`, `parseFilters(text: string): SavedFilter[]`, `formatFilters(filters: SavedFilter[]): string`.

- [ ] **Step 1: Write the failing tests**

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/core/filters.test.ts`
Expected: FAIL — cannot resolve `./filters`.

- [ ] **Step 3: Write the module**

`src/core/filters.ts`:

```ts
export interface SavedFilter {
  name: string
  query: string
}

/** One `Name: query` per line; anything else is left alone and dropped. */
export function parseFilters(text: string): SavedFilter[] {
  return text.split('\n').flatMap((line) => {
    const at = line.indexOf(': ')
    if (at < 1) return []
    return [{ name: line.slice(0, at).trim(), query: line.slice(at + 2).trim() }]
  })
}

export function formatFilters(filters: SavedFilter[]): string {
  return filters.map((filter) => `${filter.name}: ${filter.query}\n`).join('')
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx tsc --noEmit && npx vitest run src/core/filters.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/filters.ts src/core/filters.test.ts
git commit -m "feat: read and write filters.txt"
```

---

### Task 5: App state — query errors and saved filters

**Files:**
- Modify: `src/app/state.ts` (imports; `AppState`; the `readonly state` initialiser; `load`; `setFilter`; `visibleTasks`; new methods after `loadHistory`)
- Test: `src/app/state.test.ts`

**Interfaces:**
- Consumes: `parseQuery`, `SavedFilter`, `parseFilters`, `formatFilters`.
- Produces: `AppState.filters: SavedFilter[] | null`; `TodoomApp.queryError: string | null` (getter); `loadFilters(): Promise<void>`; `saveFilter(name: string, query: string): Promise<void>`; `deleteFilter(name: string): Promise<void>`. `visibleTasks()` uses the last search that parsed.

- [ ] **Step 1: Write the failing tests**

Append to `src/app/state.test.ts`:

```ts
describe('query errors', () => {
  it('reports the parse error and keeps the last good result', async () => {
    const { app } = await setup('a +house\nb +work\n')
    app.setFilter({ search: '+house' })
    expect(app.queryError).toBeNull()
    expect(app.visibleTasks().map((t) => t.description)).toEqual(['a +house'])
    app.setFilter({ search: '+house | (' })
    expect(app.queryError).toBe('Missing a term at the end')
    expect(app.visibleTasks().map((t) => t.description)).toEqual(['a +house'])
    app.setFilter({ search: '' })
    expect(app.queryError).toBeNull()
    expect(app.visibleTasks()).toHaveLength(2)
  })
})

describe('saved filters', () => {
  it('loads filters.txt with the workspace', async () => {
    const store = new FakeStore({ 'todo.txt': 'a\n', 'filters.txt': 'Home: +home\n' })
    await store.signIn()
    const app = new TodoomApp(store, () => TODAY)
    await app.load(await store.workspace())
    expect(app.state.filters).toEqual([{ name: 'Home', query: '+home' }])
  })

  it('is empty when there is no filters.txt yet', async () => {
    const { app } = await setup()
    expect(app.state.filters).toEqual([])
  })

  it('saves, replaces and deletes filters in file order', async () => {
    const { app, store } = await setup()
    await app.saveFilter('Home', '+home')
    await app.saveFilter('Calls', '@phone')
    await app.saveFilter('Home', '+home & !done')
    expect(app.state.filters).toEqual([
      { name: 'Home', query: '+home & !done' },
      { name: 'Calls', query: '@phone' },
    ])
    const file = (await store.findOrCreateFileIn(app.folder, 'filters.txt'))
    expect((await store.read(file)).text).toBe('Home: +home & !done\nCalls: @phone\n')
    await app.deleteFilter('Home')
    expect(app.state.filters).toEqual([{ name: 'Calls', query: '@phone' }])
    expect((await store.read(file)).text).toBe('Calls: @phone\n')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/app/state.test.ts`
Expected: FAIL — `queryError`, `filters`, `saveFilter` missing.

- [ ] **Step 3: Extend the state**

In `src/app/state.ts`:

Add imports:

```ts
import { parseQuery } from '../core/filterQuery'
import type { SavedFilter } from '../core/filters'
import { formatFilters, parseFilters } from '../core/filters'
```

Add to `AppState` after `archived`:

```ts
  /** What filters.txt holds; null until the workspace has loaded. */
  filters: SavedFilter[] | null
```

and `filters: null,` to the `readonly state` initialiser after `archived: null,`.

Add a private field after `private revision = 0`:

```ts
  // The last search that parsed, so a half-typed query never empties the list.
  private validSearch = ''
```

In `load`, after `await this.loadAttachments()`:

```ts
    if (this.state.filters === null) await this.loadFilters()
```

Replace `setFilter` and `visibleTasks`:

```ts
  setFilter(patch: Partial<Filter>): void {
    this.state.filter = { ...this.state.filter, ...patch }
    if (this.queryError === null) this.validSearch = this.state.filter.search
  }

  /** The message for the search box, or null when the query parses. */
  get queryError(): string | null {
    try {
      parseQuery(this.state.filter.search)
      return null
    } catch (error) {
      return error instanceof Error ? error.message : String(error)
    }
  }

  visibleTasks(): Task[] {
    const filter = { ...this.state.filter, search: this.validSearch }
    return sortTasks(filterTasks(this.state.tasks, filter, this.today()))
  }
```

Add after `loadHistory`:

```ts
  async loadFilters(): Promise<void> {
    const ref = await this.store.findOrCreateFileIn(this.folder, 'filters.txt')
    const { text } = await this.store.read(ref)
    runInAction(() => {
      this.state.filters = parseFilters(text)
    })
  }

  private async writeFilters(filters: SavedFilter[]): Promise<void> {
    const ref = await this.store.findOrCreateFileIn(this.folder, 'filters.txt')
    await this.store.write(ref, formatFilters(filters))
    runInAction(() => {
      this.state.filters = filters
    })
  }

  /** Adds the filter, or replaces the one already saved under that name. */
  async saveFilter(name: string, query: string): Promise<void> {
    const current = this.state.filters ?? []
    const next = current.some((filter) => filter.name === name)
      ? current.map((filter) => (filter.name === name ? { name, query } : filter))
      : [...current, { name, query }]
    await this.writeFilters(next)
  }

  async deleteFilter(name: string): Promise<void> {
    await this.writeFilters((this.state.filters ?? []).filter((filter) => filter.name !== name))
  }
```

- [ ] **Step 4: Run the whole suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS. (`load` now reads one more file through the FakeStore; every existing test seeds only `todo.txt`, and `findOrCreateFileIn` creates the rest.)

- [ ] **Step 5: Commit**

```bash
git add src/app/state.ts src/app/state.test.ts
git commit -m "feat: saved filters and query errors in app state"
```

---

### Task 6: Sidebar — error line, Save as filter, Filters section

**Files:**
- Create: `src/ui/SaveFilter.tsx`
- Modify: `src/ui/Sidebar.tsx` (imports; the search input block at lines 89-94; after the `<nav className="views">` block)
- Modify: `src/ui/styles.css` (insert before the terminal skin block, next to `.search { width: 100%; }`)
- Test: `src/ui/App.test.tsx`

**Interfaces:**
- Consumes: `app.queryError`, `app.state.filters`, `app.saveFilter`, `app.deleteFilter`, `emptyFilter` from `src/core/query`.

- [ ] **Step 1: Write the failing tests**

Append to `src/ui/App.test.tsx`:

```ts
describe('smart filters', () => {
  it('narrows the list with a query', async () => {
    const { root } = await mount('a +house @phone\nb +house\nc @phone\n')
    fireEvent.change(root.querySelector('.search')!, { target: { value: '+house & !@phone' } })
    const rows = [...root.querySelectorAll('.task__text')].map((el) => el.textContent)
    expect(rows).toEqual(['b'])
  })

  it('shows a parse error and keeps the previous list', async () => {
    const { root } = await mount('a +house\nb +work\n')
    const search = root.querySelector('.search')!
    fireEvent.change(search, { target: { value: '+house' } })
    fireEvent.change(search, { target: { value: '+house |' } })
    expect(root.querySelector('.query-error')?.textContent).toBe('Missing a term at the end')
    expect(root.querySelectorAll('.task')).toHaveLength(1)
    expect(root.querySelector('.save-filter')).toBeNull()
  })

  it('saves the query as a filter and lists it in the sidebar', async () => {
    const { root, app } = await mount('a +house\nb +work\n')
    expect(root.querySelector('.saved')).toBeNull()
    fireEvent.change(root.querySelector('.search')!, { target: { value: '+house' } })
    fireEvent.click(root.querySelector('.save-filter')!)
    fireEvent.change(root.querySelector('.save-filter__name')!, { target: { value: 'House' } })
    fireEvent.submit(root.querySelector('.save-filter__form')!)
    await waitFor(() => expect(app.state.filters).toEqual([{ name: 'House', query: '+house' }]))
    expect(root.querySelector('.save-filter__form')).toBeNull()
    expect([...root.querySelectorAll('.saved .view-btn')].map((b) => b.textContent)).toEqual(['House'])
  })

  it('applies a saved filter and clears the chips', async () => {
    const { root, app } = await mount('a +house\nb +work\n')
    await app.saveFilter('Work', '+work')
    app.setFilter({ projects: ['house'], dueView: 'today' })
    app.showPage('stats')
    fireEvent.click([...root.querySelectorAll('.saved .view-btn')][0]!)
    expect(app.state.page).toBe('tasks')
    expect(app.state.filter).toEqual({ ...app.state.filter, projects: [], dueView: 'all', search: '+work' })
    expect(root.querySelector('.saved .view-btn--active')?.textContent).toBe('Work')
    expect([...root.querySelectorAll('.task__text')].map((el) => el.textContent)).toEqual(['b'])
  })

  it('deletes a saved filter', async () => {
    const { root, app } = await mount('a\n')
    await app.saveFilter('Work', '+work')
    fireEvent.click(root.querySelector('[aria-label="Delete Work"]')!)
    await waitFor(() => expect(app.state.filters).toEqual([]))
    expect(root.querySelector('.saved')).toBeNull()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/ui/App.test.tsx`
Expected: FAIL — `.query-error`, `.save-filter`, `.saved` do not render.

- [ ] **Step 3: Write `SaveFilter`**

`src/ui/SaveFilter.tsx`:

```tsx
import { useState } from 'react'
import type { TodoomApp } from '../app/state'

/** A button that turns into a name box; saving keeps the query in the search. */
export function SaveFilter({ app, query }: { app: TodoomApp; query: string }) {
  const [name, setName] = useState<string | null>(null)

  if (name === null) {
    return (
      <button className="save-filter" onClick={() => setName('')}>
        Save as filter
      </button>
    )
  }

  const save = () => {
    const trimmed = name.trim()
    if (trimmed.length === 0) return
    void app.saveFilter(trimmed, query.trim())
    setName(null)
  }

  return (
    <form
      className="save-filter__form"
      onSubmit={(event) => {
        event.preventDefault()
        save()
      }}
    >
      <input
        className="save-filter__name"
        autoFocus
        placeholder="Filter name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setName(null)
        }}
      />
      <button type="submit">Save</button>
      <button type="button" onClick={() => setName(null)}>
        Cancel
      </button>
    </form>
  )
}
```

- [ ] **Step 4: Wire the sidebar**

In `src/ui/Sidebar.tsx`:

Change the query import to `import { collectProjects, collectContexts, collectPriorities, emptyFilter } from '../core/query'` and add `import { SaveFilter } from './SaveFilter'`.

Inside the component, next to where `filter`, `page` and `tasks` are read from `app.state`, add `const filters = app.state.filters` and `const queryError = app.queryError`.

Replace the search input block:

```tsx
      <input
        className="search"
        placeholder="Search or filter…"
        value={filter.search}
        onChange={(event) => app.setFilter({ search: event.target.value })}
      />
      {queryError && <p className="query-error">{queryError}</p>}
      {!queryError && filter.search.trim().length > 0 && (
        <SaveFilter app={app} query={filter.search} />
      )}
```

After the closing `</nav>` of the views block, add:

```tsx
      {filters && filters.length > 0 && (
        <nav className="saved">
          <h2 className="filters__heading">Filters</h2>
          {filters.map((saved) => (
            <div className="saved__row" key={saved.name}>
              <button
                className={
                  page === 'tasks' && filter.search === saved.query
                    ? 'view-btn view-btn--active'
                    : 'view-btn'
                }
                onClick={() => {
                  app.showPage('tasks')
                  app.setFilter({ ...emptyFilter(), search: saved.query })
                }}
              >
                {saved.name}
              </button>
              <button
                className="saved__delete"
                aria-label={`Delete ${saved.name}`}
                onClick={() => void app.deleteFilter(saved.name)}
              >
                ×
              </button>
            </div>
          ))}
        </nav>
      )}
```

- [ ] **Step 5: Style it**

In `src/ui/styles.css`, replace `.search { width: 100%; }` with:

```css
.search { width: 100%; }

.query-error { margin: 4px 0 0; font-size: 12px; color: var(--overdue); }

.save-filter { margin-top: 6px; font-size: 13px; }

.save-filter__form { display: flex; gap: 4px; margin-top: 6px; }

.save-filter__name { flex: 1; min-width: 0; }

/* Saved filters sit under the views and share their look; the × only shows on hover. */
.saved { display: flex; flex-direction: column; gap: 2px; }

.saved__row { display: flex; align-items: center; }

.saved__row .view-btn { flex: 1; }

.saved__delete {
  border: none;
  background: none;
  color: var(--muted);
  padding: 0 8px;
  visibility: hidden;
}

.saved__row:hover .saved__delete { visibility: visible; }
```

- [ ] **Step 6: Run the whole suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS.

- [ ] **Step 7: Check it in the browser**

Start the dev server if it is not running and open `http://localhost:5173/e2e/fixture.html` at 1200×760. Type `+house | (B)` into the search: one row. Type `+house |`: the red message shows, the row stays. Click **Save as filter**, name it `House`, press Enter: a Filters section with **House** appears; click **All**, then **House**: the query returns and House is highlighted. Hover the row and click ×: the section disappears. Switch to the terminal skin once to confirm nothing looks off. Reset the viewport with `preset: "desktop"`.

- [ ] **Step 8: Commit**

```bash
git add src/ui/SaveFilter.tsx src/ui/Sidebar.tsx src/ui/styles.css src/ui/App.test.tsx
git commit -m "feat: save searches as sidebar filters"
```

---

### Task 7: End-to-end scenario and roadmap

**Files:**
- Modify: `e2e/todoom.spec.ts` (append)
- Modify: `docs/roadmap.md` (remove the Smart filters entry)

- [ ] **Step 1: Write the scenario**

Append to `e2e/todoom.spec.ts`:

```ts
test('saves a search as a filter and applies it', async ({ page }) => {
  await page.goto(PAGE)
  await page.fill('.search', '+house & (A)')
  await expect(page.locator('.task')).toHaveCount(1)
  await page.click('.save-filter')
  await page.fill('.save-filter__name', 'Urgent house')
  await page.keyboard.press('Enter')
  const saved = page.locator('.saved .view-btn', { hasText: 'Urgent house' })
  await expect(saved).toHaveClass(/view-btn--active/)

  await page.locator('.view-btn', { hasText: 'All' }).click()
  await page.fill('.search', '')
  await expect(page.locator('.task')).toHaveCount(2)
  await saved.click()
  await expect(page.locator('.search')).toHaveValue('+house & (A)')
  await expect(page.locator('.task')).toHaveCount(1)
})
```

- [ ] **Step 2: Run it**

Run: `npx playwright test`
Expected: PASS, 11 tests.

- [ ] **Step 3: Remove the roadmap entry**

In `docs/roadmap.md` delete the Smart filters section (the heading, its body, and the folded-in "save the search as a filter" text) leaving the remaining entries untouched.

- [ ] **Step 4: Full gate**

Run: `npx tsc --noEmit && npx vitest run && npx playwright test && npm run build`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add e2e/todoom.spec.ts docs/roadmap.md
git commit -m "test: end-to-end saved filter; drop smart filters from roadmap"
```
