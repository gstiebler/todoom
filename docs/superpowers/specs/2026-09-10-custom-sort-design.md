# Custom sort

A Manual sort mode in which tasks appear in file order and can be dragged up
and down. The order is the line order of `todo.txt`, so it is what every
other todo.txt tool shows and needs no extra storage.

## Behaviour

- `Filter` gains `sort: 'smart' | 'manual'`. Smart is today's order
  (completed last, then priority, then due date, then file order). Manual is
  file order with completed tasks still last.
- A **Sort: Smart / Manual** toggle in the sidebar's toggles group, under
  **Show completed**. The choice travels in the URL as `sort=manual` and is
  also stored in `localStorage['todoom.sort']`, which is the default when the
  URL says nothing.
- Dragging is enabled only when `sort` is manual and the filter is otherwise
  empty except for `dueView: 'all'` and `showCompleted`. With a search or a
  label selected, rows are not draggable and a muted note under the toggle
  says "Clear the filter to reorder." Dropping between filtered rows would
  have no clear meaning in the file.
- A row is dragged by its whole body with native HTML5 drag events; while
  dragging, the row gets `.task--dragging` and the row under the pointer
  gets `.task--drop-before` or `.task--drop-after` from the pointer's
  vertical half. Dropping calls `moveTask(from, to)`.
- Completed tasks cannot be dragged and nothing can be dropped among them.

## Core

`src/core/query.ts`: `sortTasks(tasks, sort: SortMode)`. Manual keeps the
input order with `completed` tasks moved to the end, stable.

## App

`TodoomApp.moveTask(from: number, to: number)`: indexes into `state.tasks`;
removes the task at `from` and inserts it so that it ends up at `to`;
no-op when equal or out of range; marks dirty, so the debounced save writes
the new line order.

`src/app/urlState.ts`: `sort` round-trips as `sort=manual`; absent means
smart.

## UI

- `src/ui/TaskList.tsx`: `TaskRow` gets `draggable` and the drag handlers
  when `app.canReorder` is true; the list keeps a `dropTarget` state for the
  indicator classes. `app.canReorder` is a getter on `TodoomApp` with the
  rule above.
- `src/ui/Sidebar.tsx`: the toggle and the note.
- `src/ui/styles.css`: the three drag classes; a 2px `--accent` line drawn
  with `box-shadow` for the drop indicator.

## Testing

- `src/core/query.test.ts`: manual keeps order and moves completed last.
- `src/app/state.test.ts`: `moveTask` up, down, no-op cases, and that it
  marks dirty and the saved text has the new order; `canReorder` per filter.
- `src/app/urlState.test.ts`: `sort` round-trip.
- `src/ui/App.test.tsx`: toggling shows file order; drag events on rows
  reorder and the list re-renders; rows are not draggable with a search.
- `e2e/todoom.spec.ts`: switch to manual, drag the second task above the
  first with `dragTo`, reload the fixture, order persists.

## Out of scope

Reordering inside a filtered view, touch drag (native drag events do not
fire on touch; a later item), keyboard reordering.
