# Custom Sort Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Manual sort mode that shows tasks in `todo.txt` line order and lets the user drag rows up and down, persisting the order as the file's line order.

**Architecture:** `Filter` gains `sort: 'smart' | 'manual'`; `sortTasks` takes the mode. `TodoomApp.moveTask(from, to)` reorders `state.tasks` and marks dirty so the existing debounced save writes the new order. `TaskList` owns the drag state and wires native HTML5 drag events onto `TaskRow` only when `app.canReorder` says the list is the whole unfiltered file. The sidebar toggle stores the choice in the URL (`sort=manual`) and `localStorage['todoom.sort']`.

**Tech Stack:** React 19, MobX 7, TypeScript strict (`noUncheckedIndexedAccess`), Vitest (jsdom for UI tests), Playwright.

**Spec:** `docs/superpowers/specs/2026-09-10-custom-sort-design.md`

## Global Constraints

- Single quotes, no semicolons, ~100 columns, comments only where the code does not say why.
- No `try/catch` except where a rejection must become on-screen text; bubble errors up.
- CSS uses the theme tokens only (`--accent --bg --border --fg --muted --overdue --soon --surface --tag-context --today`); the `[data-theme='terminal']` block stays last in `src/ui/styles.css`.
- Every user-visible string goes through `t()` with keys in both `en` and `ptBR` tables in `src/ui/i18n.ts`.
- Vitest test files that touch the DOM need `// @vitest-environment jsdom` in their docblock if they are not already in one (`App.test.tsx` already is).
- Commit each task with a trailer: blank line then `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`. Never push.
- The full gate is `npx tsc --noEmit && npx vitest run && npx playwright test && npm run build`; run at least `npx tsc --noEmit && npx vitest run` before each commit.

---

### Task 1: Sort mode in the filter, the sorter, the URL and the stored preference

**Files:**
- Modify: `src/core/query.ts` (Filter, emptyFilter, sortTasks)
- Modify: `src/app/urlState.ts`, `src/app/urlHistory.ts`
- Create: `src/app/sortPref.ts`
- Modify: `src/app/state.ts:383` (call site of sortTasks), `src/ui/Columns.tsx:24-25`, `src/main.tsx:34,55`
- Test: `src/core/query.test.ts`, `src/app/urlState.test.ts`, `src/app/sortPref.test.ts`

**Interfaces:**
- Produces: `export type SortMode = 'smart' | 'manual'` in `src/core/query.ts`; `Filter.sort: SortMode`; `sortTasks(tasks: Task[], sort: SortMode): Task[]`; `filterFromQuery(query: string, defaultSort: SortMode = 'smart'): Filter`; `loadSort(): SortMode` and `saveSort(sort: SortMode): void` in `src/app/sortPref.ts`.

- [ ] **Step 1: Failing tests for the sorter**

Append to the `describe('sortTasks', …)` block in `src/core/query.test.ts` and change its two existing calls `sortTasks(tasks)` to `sortTasks(tasks, 'smart')`:

```ts
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
```

- [ ] **Step 2: Failing tests for the URL and the preference**

In `src/app/urlState.test.ts`, add `sort: 'manual' as const` to the object literal in `'encodes each populated field'` and assert `expect(params.get('sort')).toBe('manual')`; add `sort: 'manual' as const` to the literal in `'round trips a populated filter'`; add `sort: 'smart' as const` to the literal in `'round trips values with special characters including commas'`. Then add inside `describe('filterFromQuery', …)`:

```ts
  it('defaults sort to smart, or to the given default when the URL is silent', () => {
    expect(filterFromQuery('').sort).toBe('smart')
    expect(filterFromQuery('', 'manual').sort).toBe('manual')
    expect(filterFromQuery('sort=manual').sort).toBe('manual')
    expect(filterFromQuery('sort=nonsense', 'manual').sort).toBe('manual')
  })
```

Create `src/app/sortPref.test.ts`:

```ts
// @vitest-environment jsdom
import { afterEach, describe, it, expect } from 'vitest'
import { loadSort, saveSort } from './sortPref'

describe('sort preference', () => {
  afterEach(() => localStorage.clear())

  it('is smart until something is stored', () => {
    expect(loadSort()).toBe('smart')
  })

  it('round trips manual and ignores junk', () => {
    saveSort('manual')
    expect(loadSort()).toBe('manual')
    localStorage.setItem('todoom.sort', 'nonsense')
    expect(loadSort()).toBe('smart')
  })
})
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `npx vitest run src/core/query.test.ts src/app/urlState.test.ts src/app/sortPref.test.ts`
Expected: FAIL (type errors on the `sort` argument, missing module `./sortPref`).

- [ ] **Step 4: Implement**

`src/core/query.ts`: add after `DueView`:

```ts
export type SortMode = 'smart' | 'manual'
```

Add `sort: SortMode` as the last field of `Filter` and `sort: 'smart',` as the last entry of `emptyFilter()`. Replace `sortTasks`:

```ts
export function sortTasks(tasks: Task[], sort: SortMode): Task[] {
  return tasks
    .map((task, index) => ({ task, index }))
    .sort((a, b) => {
      const byDone = Number(a.task.completed) - Number(b.task.completed)
      if (byDone !== 0 || sort === 'manual') return byDone

      const pa = a.task.priority ?? '~'
      const pb = b.task.priority ?? '~'
      if (pa !== pb) return pa < pb ? -1 : 1

      const da = dueOf(a.task) ?? '9999-99-99'
      const db = dueOf(b.task) ?? '9999-99-99'
      if (da !== db) return da < db ? -1 : 1

      return a.index - b.index
    })
    .map((entry) => entry.task)
}
```

(`Array.prototype.sort` is stable, so returning 0 for two open tasks in manual mode keeps file order.)

`src/app/urlState.ts`: import `SortMode` from `'../core/query'`; in `filterToQuery` add `if (filter.sort === 'manual') params.set('sort', 'manual')` after the `due` line; change the signature to `filterFromQuery(query: string, defaultSort: SortMode = 'smart'): Filter` and add to the returned object:

```ts
    sort: params.get('sort') === 'manual' ? 'manual' : defaultSort,
```

`src/app/urlHistory.ts`: add `a.sort === b.sort` to `filtersEqual` and `previous.sort === next.sort` to `isSearchOnlyChange`.

Create `src/app/sortPref.ts`:

```ts
import type { SortMode } from '../core/query'

const KEY = 'todoom.sort'

/** The sort the URL falls back to; manual is the only value worth remembering. */
export function loadSort(): SortMode {
  return localStorage.getItem(KEY) === 'manual' ? 'manual' : 'smart'
}

export function saveSort(sort: SortMode): void {
  localStorage.setItem(KEY, sort)
}
```

Call sites: `src/app/state.ts` `visibleTasks()` → `sortTasks(filterTasks(this.state.tasks, filter, this.today()), filter.sort)`. `src/ui/Columns.tsx` → `sortTasks(filterTasks(tasks, query, today), current.sort)`. `src/main.tsx`: import `loadSort` from `'./app/sortPref'` and change both `filterFromQuery(window.location.search)` calls to `filterFromQuery(window.location.search, loadSort())`.

- [ ] **Step 5: Run the tests and the type check**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS. If `tsc` reports other object literals typed as `Filter` missing `sort` (search with `grep -rn "dueView:" src e2e`), add `sort: 'smart'` to them.

- [ ] **Step 6: Commit**

```bash
git add src/core/query.ts src/core/query.test.ts src/app/urlState.ts src/app/urlState.test.ts src/app/urlHistory.ts src/app/sortPref.ts src/app/sortPref.test.ts src/app/state.ts src/ui/Columns.tsx src/main.tsx
git commit -m "feat: sort mode in the filter, URL and stored preference"
```

---

### Task 2: `moveTask` and `canReorder` on the app

**Files:**
- Modify: `src/app/state.ts` (next to `indexOf`, around line 420)
- Test: `src/app/state.test.ts`

**Interfaces:**
- Consumes: `Filter.sort` from Task 1.
- Produces: `TodoomApp.moveTask(from: number, to: number): void`; `get canReorder(): boolean`.

- [ ] **Step 1: Failing tests**

Append to `src/app/state.test.ts`:

```ts
describe('moveTask', () => {
  const names = (app: TodoomApp) => app.state.tasks.map((t) => t.description)

  it('moves a task down and marks dirty', async () => {
    const { app } = await setup('a\nb\nc\n')
    app.moveTask(0, 2)
    expect(names(app)).toEqual(['b', 'c', 'a'])
    expect(app.state.saveState).toBe('dirty')
  })

  it('moves a task up', async () => {
    const { app } = await setup('a\nb\nc\n')
    app.moveTask(2, 0)
    expect(names(app)).toEqual(['c', 'a', 'b'])
  })

  it('ignores a no-op or an out-of-range move', async () => {
    const { app } = await setup('a\nb\n')
    app.moveTask(1, 1)
    app.moveTask(0, 5)
    app.moveTask(-1, 0)
    expect(names(app)).toEqual(['a', 'b'])
    expect(app.state.saveState).toBe('saved')
  })

  it('writes the new line order', async () => {
    const { app, store, workspace } = await setup('a\nb\n')
    app.moveTask(1, 0)
    await app.save()
    expect((await store.read(workspace.todo)).text).toBe('b\na\n')
  })
})

describe('canReorder', () => {
  it('needs manual sort and an otherwise empty filter', async () => {
    const { app } = await setup()
    expect(app.canReorder).toBe(false)
    app.setFilter({ sort: 'manual' })
    expect(app.canReorder).toBe(true)
    app.setFilter({ showCompleted: true, dueView: 'all' })
    expect(app.canReorder).toBe(true)
    app.setFilter({ search: 'milk' })
    expect(app.canReorder).toBe(false)
    app.setFilter({ search: '', projects: ['house'] })
    expect(app.canReorder).toBe(false)
    app.setFilter({ projects: [], dueView: 'today' })
    expect(app.canReorder).toBe(false)
  })
})
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run src/app/state.test.ts`
Expected: FAIL — `moveTask is not a function`, `canReorder` undefined.

- [ ] **Step 3: Implement**

In `src/app/state.ts`, right after `indexOf(task)`:

```ts
  /** Reorders the file: the task at `from` ends up at `to`. */
  moveTask(from: number, to: number): void {
    const tasks = this.state.tasks
    const task = tasks[from]
    if (!task || from === to || to < 0 || to >= tasks.length) return
    tasks.splice(from, 1)
    tasks.splice(to, 0, task)
    this.markDirty()
  }

  /** Dragging only makes sense when the list is the whole file in file order. */
  get canReorder(): boolean {
    const { sort, search, projects, contexts, priorities, dueView } = this.state.filter
    return (
      sort === 'manual' &&
      search === '' &&
      projects.length === 0 &&
      contexts.length === 0 &&
      priorities.length === 0 &&
      dueView === 'all'
    )
  }
```

- [ ] **Step 4: Run the tests**

Run: `npx tsc --noEmit && npx vitest run src/app/state.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/state.ts src/app/state.test.ts
git commit -m "feat: moveTask and canReorder on the app"
```

---

### Task 3: Sidebar toggle, draggable rows and styles

**Files:**
- Modify: `src/ui/i18n.ts` (both tables), `src/ui/Sidebar.tsx:211-218`, `src/ui/TaskList.tsx`, `src/ui/styles.css` (before the terminal block)
- Test: `src/ui/App.test.tsx`

**Interfaces:**
- Consumes: `app.moveTask`, `app.canReorder` (Task 2), `Filter.sort`, `saveSort` (Task 1).

- [ ] **Step 1: Failing UI tests**

Append to `src/ui/App.test.tsx`:

```ts
describe('manual sort', () => {
  afterEach(() => localStorage.clear())

  const titles = (root: HTMLElement) =>
    [...root.querySelectorAll('.task__text')].map((el) => el.textContent)

  const dataTransfer = { setData: () => {}, effectAllowed: 'move' }

  it('shows file order when toggled and remembers the choice', async () => {
    const { root } = await mount('(B) second\n(A) first\n')
    expect(titles(root)).toEqual(['first', 'second'])
    fireEvent.click(root.querySelector('.sort-btn')!)
    expect(root.querySelector('.sort-btn')?.textContent).toBe('Sort: Manual')
    expect(titles(root)).toEqual(['second', 'first'])
    expect(localStorage.getItem('todoom.sort')).toBe('manual')
  })

  it('reorders by dragging a row above another', async () => {
    const { app, root } = await mount('a\nb\nc\n')
    app.setFilter({ sort: 'manual' })
    const rows = () => [...root.querySelectorAll('.task')]
    expect(rows().every((row) => row.getAttribute('draggable') === 'true')).toBe(true)
    fireEvent.dragStart(rows()[2]!, { dataTransfer })
    // jsdom rects are all zero, so a negative clientY lands in the top half.
    fireEvent.dragOver(rows()[0]!, { clientY: -1, dataTransfer })
    expect(rows()[0]?.classList.contains('task--drop-before')).toBe(true)
    fireEvent.drop(rows()[0]!, { dataTransfer })
    expect(titles(root)).toEqual(['c', 'a', 'b'])
    expect(app.state.tasks.map((t) => t.description)).toEqual(['c', 'a', 'b'])
    expect(root.querySelector('.task--drop-before')).toBeNull()
  })

  it('reorders by dragging a row below another', async () => {
    const { app, root } = await mount('a\nb\nc\n')
    app.setFilter({ sort: 'manual' })
    const rows = () => [...root.querySelectorAll('.task')]
    fireEvent.dragStart(rows()[0]!, { dataTransfer })
    fireEvent.dragOver(rows()[2]!, { clientY: 1, dataTransfer })
    expect(rows()[2]?.classList.contains('task--drop-after')).toBe(true)
    fireEvent.drop(rows()[2]!, { dataTransfer })
    expect(titles(root)).toEqual(['b', 'c', 'a'])
  })

  it('is not draggable with a search, and says why', async () => {
    const { app, root } = await mount('a\nb\n')
    app.setFilter({ sort: 'manual', search: 'a' })
    expect(root.querySelector('.task')?.getAttribute('draggable')).toBe('false')
    expect(root.querySelector('.toggles__note')?.textContent).toBe('Clear the filter to reorder.')
    app.setFilter({ search: '' })
    expect(root.querySelector('.toggles__note')).toBeNull()
  })

  it('leaves completed rows out of dragging', async () => {
    const { app, root } = await mount('a\nx 2026-09-09 done\n')
    app.setFilter({ sort: 'manual', showCompleted: true })
    const done = root.querySelector('.task--done')!
    expect(done.getAttribute('draggable')).toBe('false')
    fireEvent.dragStart(root.querySelector('.task')!, { dataTransfer })
    fireEvent.dragOver(done, { clientY: 1, dataTransfer })
    expect(done.classList.contains('task--drop-after')).toBe(false)
  })
})
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run src/ui/App.test.tsx -t "manual sort"`
Expected: FAIL — no `.sort-btn`, rows not draggable.

- [ ] **Step 3: Strings**

In `src/ui/i18n.ts`, after `'sidebar.showCompleted'` in each table:

```ts
  'sidebar.sortSmart': 'Sort: Smart',
  'sidebar.sortManual': 'Sort: Manual',
  'sidebar.reorderHint': 'Clear the filter to reorder.',
```

```ts
  'sidebar.sortSmart': 'Ordem: Automática',
  'sidebar.sortManual': 'Ordem: Manual',
  'sidebar.reorderHint': 'Limpe o filtro para reordenar.',
```

- [ ] **Step 4: Sidebar toggle**

In `src/ui/Sidebar.tsx`, import `saveSort` from `'../app/sortPref'` and replace the `.toggles` div with:

```tsx
      <div className="toggles">
        <button
          className={filter.showCompleted ? 'toggle-btn toggle-btn--active' : 'toggle-btn'}
          onClick={() => app.setFilter({ showCompleted: !filter.showCompleted })}
        >
          {t('sidebar.showCompleted')}
        </button>
        <button
          className={
            filter.sort === 'manual'
              ? 'toggle-btn sort-btn toggle-btn--active'
              : 'toggle-btn sort-btn'
          }
          onClick={() => {
            const sort = filter.sort === 'manual' ? 'smart' : 'manual'
            saveSort(sort)
            app.setFilter({ sort })
          }}
        >
          {t(filter.sort === 'manual' ? 'sidebar.sortManual' : 'sidebar.sortSmart')}
        </button>
        {filter.sort === 'manual' && !app.canReorder && (
          <p className="toggles__note">{t('sidebar.reorderHint')}</p>
        )}
      </div>
```

- [ ] **Step 5: Draggable rows**

In `src/ui/TaskList.tsx`, add above `TaskRow`:

```ts
type Half = 'before' | 'after'

/** What a row needs to take part in a drag; absent when the row cannot move. */
export interface DragProps {
  dragging: boolean
  drop: Half | null
  onStart: () => void
  onOver: (half: Half) => void
  onDrop: () => void
  onEnd: () => void
}
```

Give `TaskRow` an optional `drag?: DragProps` prop and replace its `<li className={classes.join(' ')}>` opening tag with:

```tsx
    <li
      className={classes.join(' ')}
      draggable={drag !== undefined}
      onDragStart={(event) => {
        if (!drag) return
        // Firefox needs data on the transfer before it starts a drag at all.
        event.dataTransfer.setData('text/plain', String(index))
        event.dataTransfer.effectAllowed = 'move'
        drag.onStart()
      }}
      onDragOver={(event) => {
        if (!drag) return
        event.preventDefault()
        const rect = event.currentTarget.getBoundingClientRect()
        drag.onOver(event.clientY < rect.top + rect.height / 2 ? 'before' : 'after')
      }}
      onDrop={(event) => {
        if (!drag) return
        event.preventDefault()
        drag.onDrop()
      }}
      onDragEnd={drag?.onEnd}
    >
```

Before the `return`, extend the classes: `if (drag?.dragging) classes.push('task--dragging')` and `if (drag?.drop) classes.push(\`task--drop-${drag.drop}\`)`.

Replace `TaskList`:

```tsx
export const TaskList = observer(function TaskList({
  app,
  today,
}: {
  app: TodoomApp
  today: string
}) {
  const { t } = useLocale()
  // Both are indexes into app.state.tasks, which is what moveTask speaks.
  const [dragging, setDragging] = useState<number | null>(null)
  const [target, setTarget] = useState<{ index: number; half: Half } | null>(null)
  const visible = app.visibleTasks()
  if (visible.length === 0) return <p className="empty">{t('task.empty')}</p>

  const clear = () => {
    setDragging(null)
    setTarget(null)
  }
  const dragFor = (index: number): DragProps => ({
    dragging: dragging === index,
    drop: target?.index === index ? target.half : null,
    onStart: () => setDragging(index),
    onOver: (half) => setTarget({ index, half }),
    onDrop: () => {
      if (dragging !== null && target !== null) {
        // Removing `from` first shifts everything below it up by one.
        const slot = target.half === 'before' ? target.index : target.index + 1
        app.moveTask(dragging, dragging < slot ? slot - 1 : slot)
      }
      clear()
    },
    onEnd: clear,
  })

  return (
    <ul className="task-list">
      {visible.map((task) => {
        const index = app.indexOf(task)
        const drag = app.canReorder && !task.completed ? dragFor(index) : undefined
        return <TaskRow key={index} app={app} task={task} today={today} drag={drag} />
      })}
    </ul>
  )
})
```

- [ ] **Step 6: Styles**

In `src/ui/styles.css`, after `.toggle-btn--active { … }`:

```css
.toggles__note { margin: 6px 0 0; font-size: 12px; color: var(--muted); }
```

After `.task--blocked .task__meta { … }` (still well before the terminal block):

```css
/* Drag feedback: the moving row fades, the drop slot is a 2px accent line. */
.task--dragging { opacity: 0.4; }
.task--drop-before { box-shadow: inset 0 2px 0 var(--accent); }
.task--drop-after { box-shadow: 0 2px 0 var(--accent); }
```

- [ ] **Step 7: Run the tests and the type check**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/ui/i18n.ts src/ui/Sidebar.tsx src/ui/TaskList.tsx src/ui/styles.css src/ui/App.test.tsx
git commit -m "feat: manual sort toggle and drag-to-reorder rows"
```

---

### Task 4: End-to-end test, roadmap, full gate

**Files:**
- Modify: `e2e/todoom.spec.ts`, `docs/roadmap.md`

- [ ] **Step 1: End-to-end test**

Append to `e2e/todoom.spec.ts`:

```ts
test('reorders tasks by dragging in manual sort', async ({ page }) => {
  await page.goto(PAGE)
  await page.locator('.sort-btn').click()
  await expect(page).toHaveURL(/sort=manual/)
  const rows = page.locator('.task')
  await expect(rows.first()).toContainText('Call plumber')
  // Drop in the top half of the first row so the dragged task lands before it.
  await rows.nth(1).dragTo(rows.first(), { targetPosition: { x: 40, y: 4 } })
  await expect(rows.first()).toContainText('Buy milk')
  await expect(page.locator('.task--drop-before')).toHaveCount(0)
})
```

- [ ] **Step 2: Run it**

Run: `npx playwright test -g "reorders tasks"`
Expected: PASS. If the drop lands in the wrong half, lower `y` (the row is ~50px tall; the top half is anything under 25).

- [ ] **Step 3: Roadmap**

Remove the `## Custom sort` section (heading and its paragraph) from `docs/roadmap.md`, leaving the intro text.

- [ ] **Step 4: Full gate**

Run: `npx tsc --noEmit && npx vitest run && npx playwright test && npm run build`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add e2e/todoom.spec.ts docs/roadmap.md
git commit -m "test: end-to-end drag reorder; drop custom sort from roadmap"
```
