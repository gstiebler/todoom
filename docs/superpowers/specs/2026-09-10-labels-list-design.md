# Labels in the sidebar

The Projects and Contexts chips become collapsible sections that list each
label as a row with the number of open tasks carrying it. Collapsed by
default, so a long list of labels no longer pushes the sidebar down.

## Behaviour

- Two sections, **Projects** and **Contexts**, in the place the chips are
  today. Each heading is a button with a ▸ (collapsed) or ▾ (expanded)
  glyph; clicking toggles. Priority keeps its chips.
- Collapsed state is remembered per section in `localStorage` under
  `todoom.labels.projects` and `todoom.labels.contexts` (`'open'` or absent).
  Default: collapsed.
- A section with a selected label is always drawn expanded, so the active
  filter is visible; collapsing it while a label is selected is allowed and
  takes effect once the label is unselected.
- Each row: the label (`+work`, `@phone`) and, right-aligned and muted, the
  count of uncompleted tasks carrying it. A row is active when the label is
  in `filter.projects` / `filter.contexts`; clicking toggles it there, exactly
  as the chip does now. A label with zero open tasks still shows (count `0`)
  while some completed task carries it, so it can be selected with
  **Show completed** on.
- The heading of a collapsed section shows the number of selected labels in
  it when non-zero, e.g. `Projects (2)`.

## Core

`src/core/query.ts`:

```ts
/** Open-task counts keyed by label, for every label any task carries. */
export function countByProject(tasks: Task[]): Map<string, number>
export function countByContext(tasks: Task[]): Map<string, number>
```

Keys are every label `collectProjects` / `collectContexts` return, values
count only `!completed` tasks.

## UI

- `src/ui/LabelSection.tsx`: `LabelSection({ heading, storageKey, prefix,
  counts, selected, onToggle })`. Owns the collapsed state with a
  `useState(loadOpen)` + `useEffect(saveOpen)` pair mirroring `theme.ts`.
- `src/ui/Sidebar.tsx`: the two `Chips` uses for projects and contexts are
  replaced by `LabelSection`; `Chips` stays for Priority.
- `src/ui/styles.css`: `.labels`, `.labels__heading`, `.labels__row`,
  `.labels__row--active`, `.labels__count`. The terminal skin needs no new
  rules.

## Testing

- `src/core/query.test.ts`: counts ignore completed tasks; labels only on
  completed tasks appear with `0`.
- `src/ui/App.test.tsx`: sections start collapsed; expanding lists rows with
  counts; clicking a row filters the list; a selected label keeps its section
  expanded; the preference survives a remount (localStorage stubbed the way
  `theme.test.ts` does).

## Out of scope

Renaming or deleting labels, nested labels, drag to reorder.
