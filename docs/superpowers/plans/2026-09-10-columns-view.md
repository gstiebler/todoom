# Columns View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Columns page showing one column per saved filter the user has ticked, each listing the tasks matching that filter.

**Architecture:** `filters.txt` lines gain an optional `* ` prefix that marks a filter as a column; `SavedFilter.column` carries it. `TodoomApp.setColumn` rewrites the file. `Columns.tsx` maps the marked filters to sections that reuse `TaskRow` over `filterTasks` with only the saved query and `showCompleted`.

**Tech Stack:** TypeScript (strict), MobX 7, React 19, Vitest (jsdom for UI), Playwright.

**Spec:** `docs/superpowers/specs/2026-09-10-columns-view-design.md`

## Global Constraints

- Lines in `filters.txt` without the marker are unchanged; nothing pre-existing is migrated.
- No `try/catch` except where a rejection must become text on screen (the column's parse error).
- House style: single quotes, no semicolons, ~100 columns, comments only where the code does not say why.
- The terminal skin block stays last in `src/ui/styles.css`.
- Commit messages end with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`. Never push.

---

## File structure

| File | Responsibility |
|---|---|
| `src/core/filters.ts` | `SavedFilter.column`, marker parse/format |
| `src/app/state.ts` | `page: 'columns'`, `setColumn` |
| `src/ui/Columns.tsx` (new) | the page |
| `src/ui/TaskList.tsx` | export `TaskRow` |
| `src/ui/Sidebar.tsx` | Columns view button, per-filter checkbox |
| `src/ui/App.tsx` | route the page |
| `src/ui/styles.css` | `.columns`, `.column*`, `.saved__column` |
| `e2e/todoom.spec.ts`, `docs/roadmap.md` | scenario; drop the entry |

---

### Task 1: Column marker in filters.txt

**Files:**
- Modify: `src/core/filters.ts`
- Test: `src/core/filters.test.ts`, `src/app/state.test.ts:357-395`, `src/ui/App.test.tsx:495-527`

**Interfaces:**
- Produces: `interface SavedFilter { name: string; query: string; column: boolean }`; `parseFilters` reads a leading `* `; `formatFilters` writes it.

- [ ] **Step 1: Write the failing tests**

In `src/core/filters.test.ts`, change the first `parseFilters` expectation to include `column: false` on both entries, and add:

```ts
  test('reads a leading "* " as the column marker', () => {
    expect(parseFilters('* Urgent: +house & (A)\nLater: due after:today\n')).toEqual([
      { name: 'Urgent', query: '+house & (A)', column: true },
      { name: 'Later', query: 'due after:today', column: false },
    ])
  })
```

Add `column: false` to every other expected object in the file, and in `formatFilters`:

```ts
  test('writes the column marker', () => {
    const filters = [
      { name: 'A', query: '+a', column: true },
      { name: 'B', query: '@b', column: false },
    ]
    expect(formatFilters(filters)).toBe('* A: +a\nB: @b\n')
    expect(parseFilters(formatFilters(filters))).toEqual(filters)
  })
```

In `src/app/state.test.ts` (`saved filters`) and `src/ui/App.test.tsx` (`saved filters` and the `describe a filter` block) add `column: false` to every `{ name, query }` literal inside an `expect(...).toEqual(...)`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/core/filters.test.ts`
Expected: FAIL on the new cases and the `column: false` expectations.

- [ ] **Step 3: Implement**

`src/core/filters.ts`:

```ts
export interface SavedFilter {
  name: string
  query: string
  /** Shown as a column on the Columns page; a leading "* " in the file. */
  column: boolean
}

const MARKER = '* '

/** One `Name: query` per line, `* ` in front for a column; anything else is dropped. */
export function parseFilters(text: string): SavedFilter[] {
  return text.split('\n').flatMap((raw) => {
    let line = raw.trim()
    const column = line.startsWith(MARKER)
    if (column) line = line.slice(MARKER.length).trim()
    const at = line.indexOf(': ')
    if (at < 1) return []
    return [{ name: line.slice(0, at).trim(), query: line.slice(at + 2).trim(), column }]
  })
}

export function formatFilters(filters: SavedFilter[]): string {
  return filters
    .map((filter) => `${filter.column ? MARKER : ''}${filter.name}: ${filter.query}\n`)
    .join('')
}
```

In `src/app/state.ts` `saveFilter`, keep an existing filter's marker and default a new one to `false`:

```ts
    const next = current.some((filter) => filter.name === name)
      ? current.map((filter) => (filter.name === name ? { ...filter, query } : filter))
      : [...current, { name, query, column: false }]
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all pass; tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/core/filters.ts src/core/filters.test.ts src/app/state.ts src/app/state.test.ts src/ui/App.test.tsx
git commit -m "feat: mark a saved filter as a column in filters.txt"
```

---

### Task 2: `setColumn` and the columns page in app state

**Files:**
- Modify: `src/app/state.ts`
- Test: `src/app/state.test.ts` (append to `saved filters`)

**Interfaces:**
- Produces: `AppState.page: 'tasks' | 'stats' | 'columns'`; `TodoomApp.setColumn(name: string, column: boolean): Promise<void>`; `TodoomApp.columnFilters: SavedFilter[]` (getter).

- [ ] **Step 1: Write the failing test**

```ts
  it('marks and unmarks a filter as a column', async () => {
    const { app, store } = await setup()
    await app.saveFilter('Home', '+home')
    await app.saveFilter('Calls', '@phone')
    await app.setColumn('Calls', true)
    expect(app.columnFilters).toEqual([{ name: 'Calls', query: '@phone', column: true }])
    const file = await store.findOrCreateFileIn(app.folder, 'filters.txt')
    expect((await store.read(file)).text).toBe('Home: +home\n* Calls: @phone\n')
    await app.setColumn('Calls', false)
    expect(app.columnFilters).toEqual([])
  })
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/app/state.test.ts -t "marks and unmarks"`
Expected: FAIL — `setColumn` is not a function.

- [ ] **Step 3: Implement**

In `AppState`: `page: 'tasks' | 'stats' | 'columns'`. After `deleteFilter`:

```ts
  async setColumn(name: string, column: boolean): Promise<void> {
    await this.writeFilters(
      (this.state.filters ?? []).map((filter) =>
        filter.name === name ? { ...filter, column } : filter,
      ),
    )
  }

  get columnFilters(): SavedFilter[] {
    return (this.state.filters ?? []).filter((filter) => filter.column)
  }
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/app && npx tsc --noEmit`
Expected: pass; tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/app/state.ts src/app/state.test.ts
git commit -m "feat: choose which saved filters are columns"
```

---

### Task 3: The Columns page

**Files:**
- Create: `src/ui/Columns.tsx`
- Modify: `src/ui/TaskList.tsx` (export `TaskRow`), `src/ui/App.tsx`, `src/ui/Sidebar.tsx`, `src/ui/styles.css`
- Test: `src/ui/App.test.tsx` (append)

**Interfaces:**
- Consumes: `app.columnFilters`, `app.setColumn`, `app.showPage('columns')`; `filterTasks`, `sortTasks`, `emptyFilter` from `src/core/query.ts`.

- [ ] **Step 1: Write the failing tests**

```ts
describe('columns', () => {
  it('shows a hint until a filter is ticked', async () => {
    const { root, app } = await mount('a +house\n')
    act(() => app.showPage('columns'))
    expect(root.querySelector('.columns__empty')?.textContent).toBe(
      'Tick a saved filter in the sidebar to show it here.',
    )
  })

  it('renders one column per ticked filter with its tasks', async () => {
    const { root, app } = await mount('a +house\nb +work\nx c +house\n')
    await app.saveFilter('House', '+house')
    await app.saveFilter('Work', '+work')
    fireEvent.click(root.querySelector('[aria-label="Show House as a column"]')!)
    await waitFor(() => expect(app.columnFilters).toHaveLength(1))
    fireEvent.click([...root.querySelectorAll('.view-btn')].find((b) => b.textContent === 'Columns')!)
    expect(root.querySelectorAll('.column')).toHaveLength(1)
    expect(root.querySelector('.column__heading')?.textContent).toBe('House')
    expect(root.querySelector('.column__count')?.textContent).toBe('1')
    expect([...root.querySelectorAll('.column .task__text')].map((el) => el.textContent)).toEqual(['a'])
    expect(root.querySelector('.add-task')).toBeNull()
  })

  it('completes a task from a column', async () => {
    const { root, app } = await mount('a +house\n')
    await app.saveFilter('House', '+house')
    await app.setColumn('House', true)
    act(() => app.showPage('columns'))
    fireEvent.click(root.querySelector('.column .task__check')!)
    expect(app.state.tasks[0]?.completed).toBe(true)
    expect(root.querySelector('.column__count')?.textContent).toBe('0')
  })

  it('shows the parse error in a broken column', async () => {
    const { root, app } = await mount('a\n')
    await app.saveFilter('Bad', '+house |')
    await app.setColumn('Bad', true)
    act(() => app.showPage('columns'))
    expect(root.querySelector('.column .query-error')?.textContent).toBe('Missing a term at the end')
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/ui/App.test.tsx -t columns`
Expected: FAIL — no `.columns__empty`, no checkbox.

- [ ] **Step 3: Export `TaskRow`**

In `src/ui/TaskList.tsx` change `const TaskRow = observer(` to `export const TaskRow = observer(`.

- [ ] **Step 4: Write the page**

`src/ui/Columns.tsx`:

```tsx
import { observer } from 'mobx-react-lite'
import type { TodoomApp } from '../app/state'
import type { SavedFilter } from '../core/filters'
import { emptyFilter, filterTasks, sortTasks } from '../core/query'
import { TaskRow } from './TaskList'

const Column = observer(function Column({
  app,
  filter,
  today,
}: {
  app: TodoomApp
  filter: SavedFilter
  today: string
}) {
  const { tasks, filter: current } = app.state
  let matching: ReturnType<typeof sortTasks> = []
  let error: string | null = null
  // A saved query can be edited by hand in filters.txt; a bad one is shown
  // where its tasks would be instead of taking the page down.
  try {
    const query = { ...emptyFilter(), search: filter.query, showCompleted: current.showCompleted }
    matching = sortTasks(filterTasks(tasks, query, today))
  } catch (failure) {
    error = failure instanceof Error ? failure.message : String(failure)
  }
  return (
    <section className="column">
      <h2 className="column__heading">{filter.name}</h2>
      {error ? (
        <p className="query-error">{error}</p>
      ) : (
        <>
          <span className="column__count">{matching.length}</span>
          <ul className="task-list">
            {matching.map((task) => (
              <TaskRow key={app.indexOf(task)} app={app} task={task} today={today} />
            ))}
          </ul>
        </>
      )}
    </section>
  )
})

export const Columns = observer(function Columns({ app, today }: { app: TodoomApp; today: string }) {
  const filters = app.columnFilters
  if (filters.length === 0) {
    return <p className="columns__empty">Tick a saved filter in the sidebar to show it here.</p>
  }
  return (
    <div className="columns">
      {filters.map((filter) => (
        <Column key={filter.name} app={app} filter={filter} today={today} />
      ))}
    </div>
  )
})
```

- [ ] **Step 5: Route and mount**

`src/ui/App.tsx`: import `Columns`; replace the ternary body with:

```tsx
        {app.state.page === 'stats' ? (
          <Stats app={app} today={today()} />
        ) : app.state.page === 'columns' ? (
          <Columns app={app} today={today()} />
        ) : (
          <>
            <AddTask app={app} today={today()} />
            <TaskList app={app} today={today()} />
          </>
        )}
```

`src/ui/Sidebar.tsx`: after the Stats button add

```tsx
        <button
          className={page === 'columns' ? 'view-btn view-btn--active' : 'view-btn'}
          onClick={() => app.showPage('columns')}
        >
          Columns
        </button>
```

and in the saved-filter row, before the delete button:

```tsx
              <input
                className="saved__column"
                type="checkbox"
                aria-label={`Show ${saved.name} as a column`}
                checked={saved.column}
                onChange={(event) => void app.setColumn(saved.name, event.target.checked)}
              />
```

- [ ] **Step 6: Style**

In `src/ui/styles.css`, after `.saved__row:hover .saved__delete { visibility: visible; }`:

```css
.saved__column { margin: 0 4px; }

.columns { display: flex; gap: 16px; overflow-x: auto; align-items: flex-start; }

.column { flex: 0 0 300px; max-height: calc(100vh - 40px); overflow-y: auto; }

.column__heading { margin: 0; font-size: 15px; display: inline-block; }

.column__count { margin-left: 8px; font-size: 12px; color: var(--muted); }

.columns__empty { color: var(--muted); }
```

- [ ] **Step 7: Run the tests and the type check**

Run: `npx vitest run src/ui && npx tsc --noEmit`
Expected: all pass; tsc clean.

- [ ] **Step 8: Commit**

```bash
git add src/ui/Columns.tsx src/ui/TaskList.tsx src/ui/App.tsx src/ui/Sidebar.tsx src/ui/styles.css src/ui/App.test.tsx
git commit -m "feat: columns page, one per ticked saved filter"
```

---

### Task 4: End-to-end scenario, roadmap, gate

**Files:**
- Modify: `e2e/todoom.spec.ts`, `docs/roadmap.md`

- [ ] **Step 1: Write the scenario**

```ts
test('shows a saved filter as a column', async ({ page }) => {
  await page.goto(PAGE)
  await page.fill('.search', '+house')
  await page.click('.save-filter')
  await page.fill('.save-filter__name', 'House')
  await page.keyboard.press('Enter')
  await page.click('[aria-label="Show House as a column"]')
  await page.locator('.view-btn', { hasText: 'Columns' }).click()
  await expect(page.locator('.column')).toHaveCount(1)
  await expect(page.locator('.column .task')).toHaveCount(1)
})
```

- [ ] **Step 2: Run it**

Run: `npx playwright test`
Expected: 13 passed.

- [ ] **Step 3: Remove the roadmap entry**

Delete the `## Columns view` section from `docs/roadmap.md`.

- [ ] **Step 4: Full gate**

Run: `npx tsc --noEmit && npx vitest run && npx playwright test && npm run build`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add e2e/todoom.spec.ts docs/roadmap.md
git commit -m "test: end-to-end columns page; drop it from the roadmap"
```
