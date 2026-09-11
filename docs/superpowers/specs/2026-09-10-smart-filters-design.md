# Smart filters

A Todoist-like query language typed into the search box, and the option to
save a query as a named filter that lives in the sidebar. Saved filters are
stored in `filters.txt` in the Todoom Drive folder. The two later roadmap
items build on this: the Columns view shows one column per saved filter, and
the on-device AI item emits a string in this grammar.

## Query language

The search box becomes the query box. Plain words still search the task text;
the tokens below are recognized as terms. Anything that is not a term is a
text word, so every search that works today still works.

### Terms

| Term | Matches tasks that… |
|---|---|
| `word` | contain `word` in `raw` or `description`, case-insensitively |
| `+project` | carry the project |
| `@context` | carry the context |
| `(A)` or `pri:A` | have priority A (any single letter) |
| `no pri` | have no priority |
| `due:<date>` | are due on that date |
| `due before:<date>` | are due strictly before that date |
| `due after:<date>` | are due strictly after that date |
| `due:none` / `no date` | have no valid `due:` |
| `due:overdue` / `overdue` | are due before today |
| `deadline:<date>`, `deadline before:`, `deadline after:`, `deadline:none` / `no deadline`, `deadline:overdue` | same forms, over `deadline:` |
| `done` | are completed |
| `blocked` | wait on an uncompleted task (`blockerOf` is non-null) |
| `rec` | have a `rec:` word |

`<date>` is `today`, `tomorrow`, `yesterday`, or `YYYY-MM-DD`. Dates resolve
against the `today` passed to the evaluator. `due:today` and
`due before:tomorrow` are different: the second includes overdue tasks.

Two-word terms (`due before:`, `no date`, `no pri`, `no deadline`) are
matched by the tokenizer before single words, so `no` alone stays a text word.

### Operators

`!` (not), `&` (and), `|` (or), parentheses. Precedence `!` > `&` > `|`.
Two terms side by side are joined by `&`, so `+home @phone` reads as
`+home & @phone` — the current search behaviour for two words. Whitespace
around operators is optional.

### Errors

`parseQuery(text)` throws `Error` with a short message on a real syntax
error: unbalanced parentheses, an operator with a missing operand, an empty
group. The UI shows the message under the box and keeps the previous result
list. It never throws on plain text.

## Core

`src/core/filterQuery.ts`:

```ts
export type Query =
  | { kind: 'text'; value: string }
  | { kind: 'project'; value: string }
  | { kind: 'context'; value: string }
  | { kind: 'priority'; value: string | null }   // null = no priority
  | { kind: 'date'; field: 'due' | 'deadline'; op: 'on' | 'before' | 'after' | 'none' | 'overdue'; value?: string }
  | { kind: 'done' }
  | { kind: 'blocked' }
  | { kind: 'rec' }
  | { kind: 'not'; query: Query }
  | { kind: 'and'; queries: Query[] }
  | { kind: 'or'; queries: Query[] }

export function parseQuery(text: string): Query | null   // null for blank text
export function matchesQuery(query: Query, task: Task, tasks: Task[], today: string): boolean
```

`tasks` is passed so `blocked` can call `blockerOf(task, tasks)`.

`filterTasks(tasks, filter, today)` in `query.ts` replaces its substring
search with `parseQuery(filter.search)` once, then `matchesQuery` per task.
Chips, `showCompleted` and `dueView` keep working and AND with the query.
`showCompleted` stays the master switch for completed tasks: `done` in a
query only narrows, it does not reveal completed tasks while the switch is
off. A parse error propagates out of `filterTasks`; the caller catches it.

## Saved filters

`filters.txt` in the Todoom folder, found or created with
`findOrCreateFileIn(folder, 'filters.txt')` on load, exactly like `done.txt`.
One filter per line:

```
Name: query text
```

The first `: ` splits name from query. Blank lines are ignored; a line
without `: ` is ignored. Written back whole on save or delete, in file order,
appending new filters at the end. Saving under an existing name replaces that
line in place. Nothing pre-existing is migrated.

`src/core/filters.ts`:

```ts
export interface SavedFilter { name: string; query: string }
export function parseFilters(text: string): SavedFilter[]
export function formatFilters(filters: SavedFilter[]): string
```

`AppState.filters: SavedFilter[] | null` (null until loaded).
`TodoomApp.loadFilters()`, `saveFilter(name, query)`, `deleteFilter(name)`.
`loadFilters` runs after the task file loads; failures bubble up like every
other store error.

## UI

- The search box placeholder becomes "Search or filter…". A parse error is
  shown in a `.query-error` line under the box.
- When the box holds a valid, non-blank query, a **Save as filter** button
  appears under it. Clicking it swaps in a name input with **Save** and
  **Cancel**; Enter saves, Escape cancels. Saving writes `filters.txt` and
  clears the name input; the query stays in the box.
- The sidebar gains a **Filters** section under Views listing saved filters
  by name. Clicking one calls `setFilter({ ...emptyFilter(), search: query })`
  and `showPage('tasks')`. A filter is active when the box equals its query
  and the page is `tasks`. Each entry has a × (aria-label `Delete <name>`).
  While `filters` is null the section shows nothing.
- URL state is unchanged: the query already travels as `q`.
- The terminal skin needs no new rules beyond the existing token overrides.

## Testing

- `src/core/filterQuery.test.ts`: tokenizer/parser cases for each term, the
  two-word terms, precedence, parentheses, juxtaposition, plain-text
  fallback, and each error; `matchesQuery` per term against fixture tasks
  including the `blocked` case.
- `src/core/filters.test.ts`: parse/format round-trip, ignored lines.
- `src/core/query.test.ts`: `filterTasks` with a query plus chips.
- `src/app/state.test.ts`: `loadFilters`, `saveFilter` (new and replace),
  `deleteFilter`, all through the fake store.
- `src/ui/App.test.tsx`: typing a query narrows the list; parse error shown;
  save as filter → appears in the sidebar → click applies it.
- `e2e/todoom.spec.ts`: one scenario, save a filter and apply it.
