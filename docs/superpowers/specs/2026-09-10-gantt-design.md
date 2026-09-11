# Gantt chart

A timeline page: one bar per dated task, from its creation date (or today)
to its due date, with the deadline as a tick and dependencies as arrows.
Read-only; a bar opens the task's modal.

## Behaviour

- A **Gantt** button in the sidebar's Views group, after Columns; `page`
  gains `'gantt'`.
- A task is on the chart when it has a valid `due:` or `deadline:`. Its bar
  runs from `creationDate` (when present and not after the end) or today,
  whichever is later, to `due:`, or to `deadline:` when there is no due.
  A bar is never shorter than one day.
- The deadline, when the task has both dates, is a vertical tick at that
  day on the bar's row. A due date before today draws the bar in the
  overdue colour; a deadline before today draws the tick in it.
- A task with `dep:` pointing at a task on the chart gets an arrow from the
  end of the blocker's bar to the start of its own.
- The x axis is days, from the earliest start minus 3 days to the latest
  end plus 3 days, at least 21 days wide, with month labels and a `today`
  line. Weekend columns are shaded.
- Rows follow `sortTasks(tasks, 'smart')` order; completed tasks are hidden
  unless **Show completed** is on. The sidebar's search and label filters
  apply, so the chart can be narrowed the same way as the list.
- Each row has the task title on the left in a fixed 240px gutter; the bars
  scroll horizontally in `.main`. Clicking a bar or a title opens
  `TaskModal`.
- With no dated tasks, one line: "Give a task a due date or a deadline to
  see it here."

## Core

`src/core/gantt.ts`:

```ts
export interface GanttRow {
  task: Task
  start: string       // ISO day
  end: string         // ISO day, >= start
  deadline?: string   // when different from end
  overdue: boolean    // end < today
}
export interface GanttRange { from: string; to: string; days: number }
export function ganttRows(tasks: Task[], today: string): GanttRow[]
export function ganttRange(rows: GanttRow[], today: string): GanttRange
/** Column index of an ISO day inside the range. */
export function dayIndex(range: GanttRange, iso: string): number
```

Pure; uses `isValidDate`, `daysBetween`, `addInterval` from `dates.ts` and
`blockerOf` from `deps.ts` for the arrow pairs, which the UI computes from
`rows` with a small `ganttArrows(rows, tasks)` helper in the same file.

## UI

- `src/ui/Gantt.tsx`: `Gantt({ app, today })`; renders an `<svg>` sized
  `days * 28px` by `rows * 28px` plus the header, with `<rect>` bars,
  `<line>` ticks and `<path>` arrows; the title gutter is plain HTML beside
  it so text wraps and ellipsizes normally. Colours come from the existing
  tokens (`--accent`, `--overdue`, `--muted`), so the terminal skin needs
  nothing new.
- `src/ui/App.tsx`: renders `Gantt` for the new page.
- `src/ui/Sidebar.tsx`: the view button.
- `src/ui/styles.css`: `.gantt`, `.gantt__gutter`, `.gantt__row`,
  `.gantt__today`, `.gantt__weekend`, `.gantt__bar`, `.gantt__bar--overdue`,
  `.gantt__deadline`, `.gantt__arrow`.

## Testing

- `src/core/gantt.test.ts`: start/end rules for each date combination,
  minimum one-day bar, creation after due clamps, overdue flag, range
  padding and minimum width, `dayIndex`, arrows only between charted tasks.
- `src/ui/App.test.tsx`: the empty message; a dated task renders one bar
  at the expected x; an overdue one carries the class; clicking a bar opens
  the modal; the search narrows the rows.
- `e2e/todoom.spec.ts`: set a due date on a task, open Gantt, one bar.

## Out of scope

Dragging bars, zoom levels other than days, grouping by project, printing.
