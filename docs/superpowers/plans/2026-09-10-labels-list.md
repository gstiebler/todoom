# Labels in the Sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Projects and Contexts chip groups with collapsible sections listing each label and its open-task count; collapsed state remembered in `localStorage`.

**Architecture:** Two pure counters in `src/core/query.ts`; a `LabelSection` component owning its collapsed flag (`useState` + `localStorage`); `Sidebar` swaps the two `Chips` uses for `LabelSection`. Priority keeps its chips.

**Tech Stack:** React 19, MobX 7, TypeScript strict (`noUncheckedIndexedAccess`), Vitest 5 (jsdom), Playwright.

**Spec:** `docs/superpowers/specs/2026-09-10-labels-list-design.md`

## Global Constraints

- Single quotes, no semicolons, ~100 columns; comments only where the code doesn't say why.
- No try/catch; let errors bubble.
- The terminal skin block (`[data-theme='terminal']`) stays the last thing in `src/ui/styles.css`.
- Colours only from existing tokens: `--accent --bg --border --fg --muted --overdue --soon --surface --tag-context --today`.
- `localStorage` keys exactly `todoom.labels.projects` and `todoom.labels.contexts`; value `'open'` when expanded, key absent otherwise. Default collapsed.
- Heading glyphs: `▸` collapsed, `▾` expanded; a heading the user collapsed while labels are selected reads `▾ Projects (2)` (selections keep it drawn open).
- A section with any selected label always renders expanded.
- Commit messages end with a blank line then `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`. Never push.

---

### Task 1: Label counters in core

**Files:**
- Modify: `src/core/query.ts` (after `collectPriorities`, ~line 41)
- Test: `src/core/query.test.ts` (`collectors` describe, ~line 26)

**Interfaces:**
- Produces:
  ```ts
  export function countByProject(tasks: Task[]): Map<string, number>
  export function countByContext(tasks: Task[]): Map<string, number>
  ```
  Keys: every label `collectProjects` / `collectContexts` return (sorted); values: number of `!completed` tasks carrying it.

- [ ] **Step 1: Write the failing tests**

Add `countByProject, countByContext` to the import from `./query` and append inside `describe('collectors')`:

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/core/query.test.ts`
Expected: FAIL — `countByProject` is not exported.

- [ ] **Step 3: Implement**

In `src/core/query.ts`, after `collectPriorities`:

```ts
function countBy(tasks: Task[], labelsOf: (task: Task) => string[]): Map<string, number> {
  const counts = new Map(unique(tasks.flatMap(labelsOf)).map((label) => [label, 0]))
  for (const task of tasks) {
    if (task.completed) continue
    for (const label of labelsOf(task)) counts.set(label, (counts.get(label) ?? 0) + 1)
  }
  return counts
}

/** Open-task counts keyed by label, for every label any task carries. */
export function countByProject(tasks: Task[]): Map<string, number> {
  return countBy(tasks, (task) => task.projects)
}

export function countByContext(tasks: Task[]): Map<string, number> {
  return countBy(tasks, (task) => task.contexts)
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/core/query.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/query.ts src/core/query.test.ts
git commit -m "feat: open-task counts per project and context"
```

---

### Task 2: LabelSection component in the sidebar

**Files:**
- Create: `src/ui/LabelSection.tsx`
- Modify: `src/ui/Sidebar.tsx` (replace the Projects and Contexts `Chips`, ~lines 207-220)
- Modify: `src/ui/styles.css` (above the terminal block; near `.filters` ~line 475)
- Modify: `src/ui/App.test.tsx` (helper + existing chip tests + new `labels` describe)
- Modify: `e2e/todoom.spec.ts:32-37` (`filters by project chip`)

**Interfaces:**
- Consumes: `countByProject`, `countByContext` from Task 1; `withSelected`, `toggleIn` already in `Sidebar.tsx`; `app.setFilter({ projects })` / `({ contexts })`; `filter.projects`, `filter.contexts`.
- Produces: `LabelSection({ heading, storageKey, prefix, counts, selected, onToggle })`; DOM: `section.labels`, `button.labels__heading` (text `▸ Projects`, `▾ Projects`, or `▸ Projects (2)`), `button.labels__row` / `.labels__row--active`, `span.labels__label` (e.g. `+house`), `span.labels__count`.

- [ ] **Step 1: Update the tests**

In `src/ui/App.test.tsx`:

1. Change the `labels()` helper (line ~31) to collect both chips and label rows:
   ```ts
   function labels(root: HTMLElement): string[] {
     return [...root.querySelectorAll('.chip, .labels__label')].map((c) => c.textContent ?? '')
   }
   ```
2. Change `filters by project when a chip is clicked` (line ~153) to expand the section first and click the row:
   ```ts
   it('filters by project when a label row is clicked', async () => {
     const { root, app } = await mount('a +house\nb +work\n')
     fireEvent.click(heading(root, 'Projects'))
     fireEvent.click(row(root, '+house'))
     expect(app.state.filter.projects).toEqual(['house'])
   })
   ```
3. Add these helpers next to `labels()`:
   ```ts
   function heading(root: HTMLElement, name: string): Element {
     return [...root.querySelectorAll('.labels__heading')].find((h) =>
       h.textContent?.includes(name),
     )!
   }

   function row(root: HTMLElement, label: string): Element {
     return [...root.querySelectorAll('.labels__row')].find(
       (r) => r.querySelector('.labels__label')?.textContent === label,
     )!
   }
   ```
4. Append a new describe:

```ts
describe('label sections', () => {
  afterEach(() => localStorage.clear())

  it('starts collapsed with a glyph and no rows', async () => {
    const { root } = await mount('a +house @phone\n')
    expect(heading(root, 'Projects').textContent).toBe('▸ Projects')
    expect(heading(root, 'Contexts').textContent).toBe('▸ Contexts')
    expect(root.querySelectorAll('.labels__row')).toHaveLength(0)
  })

  it('expands to rows with open-task counts', async () => {
    const { root } = await mount('a +house\nb +house\nx 2026-09-09 c +old\n')
    fireEvent.click(heading(root, 'Projects'))
    expect(heading(root, 'Projects').textContent).toBe('▾ Projects')
    const rows = [...root.querySelectorAll('.labels__row')].map((r) => [
      r.querySelector('.labels__label')?.textContent,
      r.querySelector('.labels__count')?.textContent,
    ])
    expect(rows).toEqual([
      ['+house', '2'],
      ['+old', '0'],
    ])
  })

  it('marks the active row and keeps the section open while selected', async () => {
    const { root, app } = await mount('a +house\nb +work\n')
    act(() => app.setFilter({ projects: ['house'] }))
    expect(row(root, '+house').classList.contains('labels__row--active')).toBe(true)
    expect(heading(root, 'Projects').textContent).toBe('▾ Projects (1)')
    fireEvent.click(heading(root, 'Projects'))
    expect(heading(root, 'Projects').textContent).toBe('▾ Projects')
    fireEvent.click(heading(root, 'Projects'))
    expect(root.querySelectorAll('.labels__row')).toHaveLength(2)
    expect(heading(root, 'Projects').textContent).toBe('▾ Projects (1)')
    fireEvent.click(row(root, '+house'))
    expect(root.querySelectorAll('.labels__row')).toHaveLength(0)
    expect(heading(root, 'Projects').textContent).toBe('▸ Projects')
  })

  it('shows how many selections hold a collapsed section open', async () => {
    const { root, app } = await mount('a +house\nb +work\n')
    act(() => app.setFilter({ projects: ['house', 'work'] }))
    fireEvent.click(heading(root, 'Projects'))
    fireEvent.click(heading(root, 'Projects'))
    act(() => app.setFilter({ projects: ['house'] }))
    expect(heading(root, 'Projects').textContent).toBe('▾ Projects (1)')
  })

  it('remembers the open state across a remount', async () => {
    const first = await mount('a @phone\n')
    fireEvent.click(heading(first.root, 'Contexts'))
    expect(localStorage.getItem('todoom.labels.contexts')).toBe('open')
    cleanup()
    const second = await mount('a @phone\n')
    expect(second.root.querySelectorAll('.labels__row')).toHaveLength(1)
    fireEvent.click(heading(second.root, 'Contexts'))
    expect(localStorage.getItem('todoom.labels.contexts')).toBeNull()
  })

  it('hides a section that has no labels', async () => {
    const { root } = await mount('a +house\n')
    expect(heading(root, 'Contexts')).toBeUndefined()
  })
})
```

The `keeps the search box focused`, `stranded filter chips` tests must keep passing through the `labels()` helper change (the selected label forces its section open, so its row is rendered).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/ui/App.test.tsx`
Expected: the `label sections` block and the renamed row test fail.

- [ ] **Step 3: Write `src/ui/LabelSection.tsx`**

```tsx
import { useEffect, useState } from 'react'

export function LabelSection({
  heading,
  storageKey,
  prefix,
  counts,
  selected,
  onToggle,
}: {
  heading: string
  storageKey: string
  prefix: string
  counts: Map<string, number>
  selected: string[]
  onToggle: (value: string) => void
}) {
  const [open, setOpen] = useState(() => localStorage.getItem(storageKey) === 'open')
  useEffect(() => {
    if (open) localStorage.setItem(storageKey, 'open')
    else localStorage.removeItem(storageKey)
  }, [open, storageKey])

  if (counts.size === 0) return null
  // A selected label must stay visible so the filter it holds can be cleared.
  const expanded = open || selected.length > 0
  // The count says how many selections are holding a section the user collapsed.
  const suffix = !open && selected.length > 0 ? ` (${selected.length})` : ''

  return (
    <section className="labels">
      <button className="labels__heading" onClick={() => setOpen(!open)}>
        {expanded ? '▾' : '▸'} {heading}
        {suffix}
      </button>
      {expanded &&
        [...counts].map(([value, count]) => (
          <button
            key={value}
            className={selected.includes(value) ? 'labels__row labels__row--active' : 'labels__row'}
            onClick={() => onToggle(value)}
          >
            <span className="labels__label">
              {prefix}
              {value}
            </span>
            <span className="labels__count">{count}</span>
          </button>
        ))}
    </section>
  )
}
```


- [ ] **Step 4: Swap the sections into `src/ui/Sidebar.tsx`**

Replace the two `Chips` uses for Projects and Contexts with:

```tsx
      <LabelSection
        heading="Projects"
        storageKey="todoom.labels.projects"
        prefix="+"
        counts={withCounts(countByProject(tasks), filter.projects)}
        selected={filter.projects}
        onToggle={(value) => app.setFilter({ projects: toggleIn(filter.projects, value) })}
      />
      <LabelSection
        heading="Contexts"
        storageKey="todoom.labels.contexts"
        prefix="@"
        counts={withCounts(countByContext(tasks), filter.contexts)}
        selected={filter.contexts}
        onToggle={(value) => app.setFilter({ contexts: toggleIn(filter.contexts, value) })}
      />
```

Add next to `withSelected`:

```ts
// Same rule as withSelected, for the counted rows: a selected label no task
// carries still gets a row (count 0) so it can be unselected.
function withCounts(counts: Map<string, number>, selected: string[]): Map<string, number> {
  const all = new Map(counts)
  for (const value of selected) if (!all.has(value)) all.set(value, 0)
  return new Map([...all].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
}
```

Import `countByProject, countByContext` from `../core/query` (drop `collectProjects, collectContexts` if no longer used) and `LabelSection` from `./LabelSection`. Keep the Priority `Chips` as is.

- [ ] **Step 5: Styles**

Above the terminal block, after the `.chip` rule (~line 493):

```css
.labels { display: flex; flex-direction: column; gap: 2px; }
.labels__heading {
  border: 0;
  background: none;
  padding: 0;
  margin: 0;
  text-align: left;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--muted);
  cursor: pointer;
}
.labels__row {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  border: 0;
  background: none;
  padding: 3px 6px;
  border-radius: 6px;
  font: inherit;
  font-size: 13px;
  color: var(--fg);
  text-align: left;
  cursor: pointer;
}
.labels__row:hover { background: var(--surface); }
.labels__row--active { background: var(--accent); color: #fff; }
.labels__row--active .labels__count { color: inherit; }
.labels__count { color: var(--muted); font-size: 12px; }
```

- [ ] **Step 6: Update the e2e test**

`e2e/todoom.spec.ts` `filters by project chip` becomes:

```ts
test('filters by project row', async ({ page }) => {
  await page.goto(PAGE)
  await page.locator('.labels__heading', { hasText: 'Projects' }).click()
  await page.locator('.labels__row', { hasText: '+house' }).click()
  await expect(page.locator('.task')).toHaveCount(1)
  await expect(page.locator('.task').first()).toContainText('Call plumber')
})
```

The `(B)` chip assertion at line 22 stays (Priority keeps chips).

- [ ] **Step 7: Gate**

Run: `npx tsc --noEmit && npx vitest run && npx playwright test && npm run build`
Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add src/ui/LabelSection.tsx src/ui/Sidebar.tsx src/ui/styles.css src/ui/App.test.tsx e2e/todoom.spec.ts
git commit -m "feat: collapsible label sections in the sidebar"
```

---

### Task 3: Roadmap

**Files:**
- Modify: `docs/roadmap.md` (remove the `## Labels in the sidebar` section)

- [ ] **Step 1: Remove the entry and commit**

Delete the `## Labels in the sidebar` heading and its paragraph, then:

```bash
git add docs/roadmap.md
git commit -m "docs: drop labels list from roadmap"
```
