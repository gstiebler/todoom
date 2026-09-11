# Search modal

A command-palette style search box opened with a keyboard shortcut, in
addition to the sidebar input. It edits the same query, so applying is free:
whatever the modal holds when it closes is what the sidebar shows and the
list obeys.

## Behaviour

- `Cmd+K` (macOS) / `Ctrl+K` opens the modal on any page. `/` opens it too
  when no input, textarea or contenteditable is focused. Both are ignored
  while any other modal is open.
- On screens narrower than 720px the sidebar shows a 🔍 button (aria-label
  "Search") beside the search input that opens the same modal.
- The modal is a centred box over a backdrop, like `TaskModal`: one input
  bound to `filter.search`, focused and fully selected on open; the same
  `.query-error` line under it when `app.queryError` is set.
- Under the input, the first 8 of `app.visibleTasks()` are listed as plain
  rows: title, due label, projects. This is a preview, not a task list:
  rows have no checkbox and no popovers. Clicking a row closes the modal and
  opens that task's `TaskModal`.
- If the page is `stats`, `columns` or `gantt`, opening the modal switches to
  `tasks` first so the preview and the list behind it agree.
- Enter closes the modal; Escape closes it too, restoring the query the modal
  opened with. Clicking the backdrop is Enter.
- No new state in `TodoomApp`: the modal reads and writes `filter.search`
  through `setFilter`, and the URL follows as it does today.

## UI

- `src/ui/SearchModal.tsx`: `SearchModal({ app, today, onClose, onPick })`.
  Reuses `.modal-backdrop` and `.modal`; adds `.search-modal`,
  `.search-modal__input`, `.search-modal__results`, `.search-modal__row`.
- `src/ui/App.tsx` owns `searchOpen` state and the global `keydown` listener,
  the way `TaskModal` owns its Escape listener. The listener is attached
  once, in a `useEffect`, and checks `document.activeElement` for the `/`
  case.
- `src/ui/Sidebar.tsx` gets the 🔍 button; it is hidden above 720px by a
  media query in `styles.css`.
- Nothing changes in `core`.

## Testing

- `src/ui/App.test.tsx`: `Ctrl+K` opens the modal; typing narrows both the
  preview and the list behind; Enter closes with the query kept; Escape
  restores the previous query; `/` does not open it while the add-task input
  is focused; clicking a preview row opens that task's modal.
- `e2e/todoom.spec.ts`: one scenario, open with the shortcut, type
  `+house`, Enter, list shows one task and the sidebar input reads `+house`.

## Out of scope

Fuzzy matching, recent searches, command actions in the palette.
