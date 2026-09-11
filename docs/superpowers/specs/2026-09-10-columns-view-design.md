# Columns view

A board page: one column per saved filter the user has marked as a column,
each listing the tasks that match it. Read-only in the sense that tasks are
not dragged between columns; rows still work as in the list.

## Behaviour

- A **Columns** button in the sidebar's Views group, after Stats. It sets
  `page` to `'columns'`.
- Each saved filter row in the sidebar gets a checkbox (aria-label
  `Show <name> as a column`). Checked filters are columns, in `filters.txt`
  order.
- A column shows the filter name as heading, the count of matching tasks,
  and the matching tasks rendered with `TaskRow`, so completing, opening the
  modal, attachments and dependencies work. Matching uses
  `filterTasks(tasks, { ...emptyFilter(), search: query, showCompleted },
  today)` — the sidebar's search and labels are ignored on this page, but
  **Show completed** applies. A column whose query fails to parse shows the
  error where its tasks would be.
- Columns lay out horizontally, each 300px wide, scrolling sideways inside
  `.main`; each column scrolls vertically on its own.
- With no column filters the page shows one line: "Tick a saved filter in
  the sidebar to show it here."
- `AddTask` is not shown on this page.

## Storage

`filters.txt` lines gain an optional leading `* ` marking a column:

```
* Urgent: +house & (A)
Later: due after:today
```

`SavedFilter` gains `column: boolean`; `parseFilters` reads the marker,
`formatFilters` writes it. Lines without it are unchanged, so nothing
pre-existing is migrated. `TodoomApp.setColumn(name, column: boolean)`
rewrites the file like `saveFilter`.

## UI

- `src/ui/Columns.tsx`: `Columns({ app, today })`; maps
  `app.state.filters.filter((f) => f.column)` to `<section
  className="column">`. `TaskRow` is exported from `TaskList.tsx` for it.
- `src/ui/App.tsx`: renders `Columns` for the new page.
- `src/ui/Sidebar.tsx`: the view button and the per-filter checkbox.
- `src/ui/styles.css`: `.columns` (flex, `overflow-x: auto`, gap), `.column`,
  `.column__heading`, `.column__count`.

## Testing

- `src/core/filters.test.ts`: parse/format with and without the marker.
- `src/app/state.test.ts`: `setColumn` writes the marker and keeps order.
- `src/ui/App.test.tsx`: the empty message; ticking a filter shows a column
  with the matching tasks; completing a task inside a column updates the
  file; a filter with a bad query shows the error in its column.
- `e2e/todoom.spec.ts`: save a filter, tick it, open Columns, one column
  with one task.

## Out of scope

Dragging between columns, per-column add-task, column widths or ordering
apart from file order.
