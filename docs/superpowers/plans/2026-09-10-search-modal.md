# Search Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A command-palette search box (`Cmd/Ctrl+K`, `/`) that edits the same `filter.search` as the sidebar input and previews the first eight matching tasks.

**Architecture:** `SearchModal` is a small observer component bound to `app.state.filter.search` through `app.setFilter`; `App` owns `searchOpen` state plus one global keydown listener; the sidebar gets a 🔍 button shown only on narrow screens. No core or state changes.

**Tech Stack:** React 19, MobX 7, TypeScript strict (`noUncheckedIndexedAccess`), Vitest 5 (jsdom), Playwright.

**Spec:** `docs/superpowers/specs/2026-09-10-search-modal-design.md`

## Global Constraints

- Single quotes, no semicolons, ~100 columns; comments only where the code doesn't say why.
- try/catch only where a rejection must become text on screen; otherwise let errors bubble.
- The terminal skin block (`[data-theme='terminal']`) stays the last thing in `src/ui/styles.css`.
- Colours only from existing tokens: `--accent --bg --border --fg --muted --overdue --soon --surface --tag-context --today`.
- No new state in `TodoomApp`; the modal reads and writes `filter.search` via `app.setFilter({ search })`.
- Preview shows at most 8 rows of `app.visibleTasks()`.
- Shortcut keys: `Cmd+K` / `Ctrl+K` anywhere; `/` only when no input/textarea/contenteditable is focused; both ignored while another modal is open.
- Commit messages end with a blank line then `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`. Never push.

---

### Task 1: SearchModal component, App wiring, shortcuts, tests

**Files:**
- Create: `src/ui/SearchModal.tsx`
- Modify: `src/ui/App.tsx`
- Modify: `src/ui/Sidebar.tsx` (🔍 button beside `.search`, `src/ui/Sidebar.tsx:93-98`)
- Modify: `src/ui/styles.css` (above the terminal block)
- Test: `src/ui/App.test.tsx`

**Interfaces:**
- Consumes: `app.state.filter.search`, `app.setFilter({ search })`, `app.queryError`, `app.visibleTasks()`, `app.indexOf(task)`, `app.state.page`, `app.showPage('tasks')`; `taskTitle(task)` from `src/core/title.ts`; `describeTask(task, today)` from `src/ui/describeTask.ts` (returns `{ dueLabel, ... }`); `TaskModal({ app, task, today, onClose })`; CSS `.modal-backdrop`, `.modal`, `.query-error`.
- Produces: `SearchModal({ app, today, onClose, onPick })` where `onPick(index: number)`; DOM: `.search-modal` (on the `.modal` box), `.search-modal__input`, `.search-modal__results`, `.search-modal__row`, `.search-modal__due`, `.search-modal__project`; sidebar `.search-btn` with `aria-label="Search"`.

- [ ] **Step 1: Write the failing tests**

Append to `src/ui/App.test.tsx`:

```ts
describe('search modal', () => {
  function openSearch(root: HTMLElement) {
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    return root.querySelector<HTMLInputElement>('.search-modal__input')!
  }

  it('opens with Ctrl+K and focuses the query', async () => {
    const { root } = await mount('Buy milk\n')
    const input = openSearch(root)
    expect(input).not.toBeNull()
    expect(document.activeElement).toBe(input)
  })

  it('opens with Cmd+K', async () => {
    const { root } = await mount('Buy milk\n')
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    expect(root.querySelector('.search-modal')).not.toBeNull()
  })

  it('opens with / when nothing is focused', async () => {
    const { root } = await mount('Buy milk\n')
    fireEvent.keyDown(window, { key: '/' })
    expect(root.querySelector('.search-modal')).not.toBeNull()
  })

  it('ignores / while an input is focused', async () => {
    const { root } = await mount('Buy milk\n')
    root.querySelector<HTMLInputElement>('.search')!.focus()
    fireEvent.keyDown(window, { key: '/' })
    expect(root.querySelector('.search-modal')).toBeNull()
  })

  it('ignores the shortcut while another modal is open', async () => {
    const { root } = await mount('Buy milk\n')
    fireEvent.click(root.querySelector('.add-task')!)
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    expect(root.querySelector('.search-modal')).toBeNull()
  })

  it('narrows the preview and the list behind while typing', async () => {
    const { root, app } = await mount('Call +house\nBuy milk +groceries\nA +house\n')
    const input = openSearch(root)
    fireEvent.change(input, { target: { value: '+house' } })
    expect(app.state.filter.search).toBe('+house')
    expect(root.querySelectorAll('.search-modal__row')).toHaveLength(2)
    expect(root.querySelectorAll('.task')).toHaveLength(2)
  })

  it('shows at most eight preview rows', async () => {
    const seed = Array.from({ length: 10 }, (_, i) => `Task ${i}`).join('\n') + '\n'
    const { root } = await mount(seed)
    openSearch(root)
    expect(root.querySelectorAll('.search-modal__row')).toHaveLength(8)
  })

  it('keeps the query on Enter and restores it on Escape', async () => {
    const { root, app } = await mount('Call +house\nBuy milk\n')
    fireEvent.change(root.querySelector('.search')!, { target: { value: 'milk' } })
    let input = openSearch(root)
    fireEvent.change(input, { target: { value: '+house' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(root.querySelector('.search-modal')).toBeNull()
    expect(app.state.filter.search).toBe('+house')

    input = openSearch(root)
    fireEvent.change(input, { target: { value: 'nothing' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(root.querySelector('.search-modal')).toBeNull()
    expect(app.state.filter.search).toBe('+house')
  })

  it('closes on backdrop click keeping the query', async () => {
    const { root, app } = await mount('Buy milk\n')
    const input = openSearch(root)
    fireEvent.change(input, { target: { value: 'milk' } })
    fireEvent.click(root.querySelector('.modal-backdrop')!)
    expect(root.querySelector('.search-modal')).toBeNull()
    expect(app.state.filter.search).toBe('milk')
  })

  it('shows the query error under the input', async () => {
    const { root } = await mount('Buy milk\n')
    const input = openSearch(root)
    fireEvent.change(input, { target: { value: '+house & (' } })
    expect(root.querySelector('.search-modal .query-error')).not.toBeNull()
  })

  it('opens the picked task in its modal', async () => {
    const { root } = await mount('Buy milk due:2026-09-11 +groceries\n')
    openSearch(root)
    const row = root.querySelector('.search-modal__row')!
    expect(row.textContent).toContain('Buy milk')
    expect(row.textContent).toContain('Tomorrow')
    expect(row.textContent).toContain('+groceries')
    fireEvent.click(row)
    expect(root.querySelector('.search-modal')).toBeNull()
    expect(root.querySelector<HTMLInputElement>('.task-modal__title')?.value).toBe('Buy milk')
  })

  it('switches to the tasks page when opened elsewhere', async () => {
    const { root, app } = await mount('Buy milk\n')
    app.showPage('stats')
    openSearch(root)
    expect(app.state.page).toBe('tasks')
  })

  it('has a search button in the sidebar that opens the modal', async () => {
    const { root } = await mount('Buy milk\n')
    fireEvent.click(root.querySelector('[aria-label="Search"]')!)
    expect(root.querySelector('.search-modal')).not.toBeNull()
  })
})
```

If `'+house & ('` does not produce a query error, pick any query that makes `app.queryError` non-null — check `src/core/filterQuery.test.ts` for a known-invalid example.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/ui/App.test.tsx`
Expected: the `search modal` block fails.

- [ ] **Step 3: Write `src/ui/SearchModal.tsx`**

```tsx
import { observer } from 'mobx-react-lite'
import { useEffect, useRef } from 'react'
import type { TodoomApp } from '../app/state'
import { taskTitle } from '../core/title'
import { describeTask } from './describeTask'

const PREVIEW_ROWS = 8

export const SearchModal = observer(function SearchModal({
  app,
  today,
  onClose,
  onPick,
}: {
  app: TodoomApp
  today: string
  onClose: () => void
  onPick: (index: number) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  // The query the modal opened with, so Escape can put it back.
  const initial = useRef(app.state.filter.search)
  const queryError = app.queryError
  const preview = app.visibleTasks().slice(0, PREVIEW_ROWS)

  useEffect(() => {
    input.current?.select()
  }, [])

  const cancel = () => {
    app.setFilter({ search: initial.current })
    onClose()
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal search-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        onClick={(event) => event.stopPropagation()}
      >
        <input
          ref={input}
          className="search-modal__input"
          placeholder="Search or filter…"
          autoFocus
          value={app.state.filter.search}
          onChange={(event) => app.setFilter({ search: event.target.value })}
          onKeyDown={(event) => {
            if (event.key === 'Enter') onClose()
            if (event.key === 'Escape') cancel()
          }}
        />
        {queryError && <p className="query-error">{queryError}</p>}
        <ul className="search-modal__results">
          {preview.map((task) => {
            const { dueLabel } = describeTask(task, today)
            return (
              <li
                key={app.indexOf(task)}
                className="search-modal__row"
                onClick={() => onPick(app.indexOf(task))}
              >
                <span className="search-modal__title">{taskTitle(task)}</span>
                {dueLabel && <span className="search-modal__due">{dueLabel}</span>}
                {task.projects.map((project) => (
                  <span key={project} className="search-modal__project">
                    +{project}
                  </span>
                ))}
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
})
```

- [ ] **Step 4: Wire it into `src/ui/App.tsx`**

Replace the component with:

```tsx
import { observer } from 'mobx-react-lite'
import { useEffect, useState } from 'react'
import type { TodoomApp } from '../app/state'
import { AddTask } from './AddTask'
import { Sidebar } from './Sidebar'
import { TaskList } from './TaskList'
import { Stats } from './Stats'
import { Columns } from './Columns'
import { Gantt } from './Gantt'
import { SearchModal } from './SearchModal'
import { TaskModal } from './TaskModal'

function typing(): boolean {
  const el = document.activeElement
  if (!(el instanceof HTMLElement)) return false
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable
}

export const App = observer(function App({
  app,
  today,
}: {
  app: TodoomApp
  today: () => string
}) {
  const [searchOpen, setSearchOpen] = useState(false)
  const [picked, setPicked] = useState<number | null>(null)

  const openSearch = () => {
    if (app.state.page !== 'tasks') app.showPage('tasks')
    setSearchOpen(true)
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const palette = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k'
      const slash = event.key === '/' && !typing()
      if (!palette && !slash) return
      // Any open dialog, including this one, owns the keyboard.
      if (document.querySelector('[role="dialog"]')) return
      event.preventDefault()
      openSearch()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const pickedTask = picked !== null ? app.state.tasks[picked] : undefined

  return (
    <div className="app">
      <Sidebar app={app} onSearch={openSearch} />
      <main className="main">
        {app.state.page === 'stats' ? (
          <Stats app={app} today={today()} />
        ) : app.state.page === 'columns' ? (
          <Columns app={app} today={today()} />
        ) : app.state.page === 'gantt' ? (
          <Gantt app={app} today={today()} />
        ) : (
          <>
            <AddTask app={app} today={today()} />
            <TaskList app={app} today={today()} />
          </>
        )}
      </main>
      {searchOpen && (
        <SearchModal
          app={app}
          today={today()}
          onClose={() => setSearchOpen(false)}
          onPick={(index) => {
            setSearchOpen(false)
            setPicked(index)
          }}
        />
      )}
      {pickedTask && (
        <TaskModal app={app} task={pickedTask} today={today()} onClose={() => setPicked(null)} />
      )}
    </div>
  )
})
```

`openSearch` inside the effect closes over `app`, which never changes for a mounted `App`; the empty dependency list is deliberate (attached once). If the linter or `tsc` complains, move `openSearch` into the effect body.

Keep the existing `Gantt` route exactly as it is now in the file; only add the new imports, state, effect, `onSearch` prop and the two modals.

- [ ] **Step 5: Sidebar button**

In `src/ui/Sidebar.tsx`, change the signature to
`Sidebar({ app, onSearch }: { app: TodoomApp; onSearch: () => void })` and wrap the search input:

```tsx
      <div className="search-row">
        <input
          className="search"
          placeholder="Search or filter…"
          value={filter.search}
          onChange={(event) => app.setFilter({ search: event.target.value })}
        />
        <button className="search-btn" aria-label="Search" onClick={onSearch}>
          🔍
        </button>
      </div>
```

Check for other places that render `<Sidebar app={app} />` (`grep -rn "<Sidebar" src e2e`) and pass `onSearch` there too.

- [ ] **Step 6: Styles**

Above the terminal block in `src/ui/styles.css`:

```css
.search-row { display: flex; gap: 6px; align-items: center; }
.search-row .search { flex: 1 1 auto; }
.search-btn {
  display: none;
  border: 1px solid var(--border);
  background: var(--surface);
  border-radius: 6px;
  padding: 4px 8px;
  cursor: pointer;
}
@media (max-width: 720px) {
  .search-btn { display: inline-block; }
}
.search-modal__input {
  width: 100%;
  box-sizing: border-box;
  font: inherit;
  font-size: 16px;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg);
  color: var(--fg);
}
.search-modal__results { list-style: none; margin: 10px 0 0; padding: 0; }
.search-modal__row {
  display: flex;
  gap: 8px;
  align-items: baseline;
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
}
.search-modal__row:hover { background: var(--surface); }
.search-modal__title { flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.search-modal__due { color: var(--muted); font-size: 12px; }
.search-modal__project { color: var(--accent); font-size: 12px; }
```

Wrap the `.search-modal__title` rule across lines to stay under ~100 columns.

- [ ] **Step 7: Run the tests and the type check**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS. If the `.search` focus test (`keeps the search box focused while typing`) still passes and the earlier `'/'`-ignored test passes, the `typing()` guard works under jsdom.

- [ ] **Step 8: Commit**

```bash
git add src/ui/SearchModal.tsx src/ui/App.tsx src/ui/Sidebar.tsx src/ui/styles.css src/ui/App.test.tsx
git commit -m "feat: search modal with Cmd+K and / shortcuts"
```

---

### Task 2: End-to-end test, roadmap, full gate

**Files:**
- Modify: `e2e/todoom.spec.ts` (append one test)
- Modify: `docs/roadmap.md` (remove the `## Search as modal` section)

**Interfaces:**
- Consumes: `.search-modal__input`, sidebar `.search`, `.task` rows; fixture seeds `(A) Call plumber +house @phone` and `Buy milk +groceries`.

- [ ] **Step 1: Append the e2e test**

```ts
test('searches from the palette', async ({ page }) => {
  await page.goto(PAGE)
  await page.keyboard.press('ControlOrMeta+k')
  await page.locator('.search-modal__input').fill('+house')
  await page.keyboard.press('Enter')
  await expect(page.locator('.search-modal')).toHaveCount(0)
  await expect(page.locator('.task')).toHaveCount(1)
  await expect(page.locator('.search')).toHaveValue('+house')
})
```

- [ ] **Step 2: Run the e2e suite**

Run: `npx playwright test`
Expected: all pass (14 → 15). If the shortcut does not fire because the page body isn't focused, click `body` first with `await page.locator('body').click()`.

- [ ] **Step 3: Remove the roadmap entry**

Delete the `## Search as modal` heading and its paragraph from `docs/roadmap.md`.

- [ ] **Step 4: Full gate**

Run: `npx tsc --noEmit && npx vitest run && npx playwright test && npm run build`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add e2e/todoom.spec.ts docs/roadmap.md
git commit -m "test: end-to-end search modal; drop it from roadmap"
```
