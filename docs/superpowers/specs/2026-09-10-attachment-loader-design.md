# Attachment loader

Progress and errors for attachment uploads and removals, shown on the row
they concern, with a retry. Today an upload gives no feedback until the
name appears, and a failure lands in the global status line.

## Behaviour

- While a file uploads, the attachment list shows a greyed row with the
  file name, a spinner and no × button. While a file is being trashed, its
  row is greyed with a spinner and its × is disabled.
- A failed upload or removal keeps its row, replaces the spinner with the
  error message and a **Retry** button. Retry runs the same operation again
  with the same `File` (uploads) or id (removals). A failed row also gets a
  × that just drops the row.
- **Add file** is disabled while any upload for that task is in flight.
- The global `state.error` is no longer touched by attachment operations;
  the save that follows a successful operation reports as it does today.

## App

```ts
export type PendingKind = 'upload' | 'remove'
export interface PendingAttachment {
  key: string                   // upload: `${name}#${n}`, remove: the file id
  kind: PendingKind
  name: string
  error: string | null
  file?: File                   // uploads only; kept for retry
  id?: string                   // removals only
}
```

`AppState.pending: Map<string, PendingAttachment[]>` keyed by the task's
`id:` word. `attachFiles` calls `ensureId` on the task first (it already
happens for dependencies), pushes one pending entry per file, uploads them
one at a time, and removes each entry when its id has landed on the line.
On failure the entry stays with `error` set and the remaining files are not
started. `detachFile` adds a `remove` entry before calling `trashFile` and
removes it after; on failure the entry keeps the error and the line keeps
the `file:` word.

`retryAttachment(taskId, key)` re-runs the operation for that entry;
`dismissAttachment(taskId, key)` drops it. `pendingFor(index)` returns the
entries for a task (empty when it has no id).

The `try/catch` in `attachFiles` and `detachFile` stays: it is the place a
rejection becomes a row on screen.

## UI

- `src/ui/AttachmentsPopover.tsx`: rows for `pendingFor(index)` are rendered
  after the real ones, with `.attachment--pending` / `.attachment--failed`,
  a `.spinner` span, and the Retry / × buttons.
- `src/ui/styles.css`: `.attachment--pending { opacity: .6 }`,
  `.attachment--failed .attachment__error { color: var(--overdue) }`,
  a `.spinner` keyframe (an existing `--muted` border that rotates).

## Testing

- `src/drive/fakeStore.ts`: an optional `failNext(op)` hook so a test can make
  one `uploadFile` or `trashFile` reject.
- `src/app/state.test.ts`: a pending entry exists during the upload and is
  gone after; a failed upload leaves the entry with the message and the
  line unchanged; retry succeeds and clears it; a failed removal keeps the
  `file:` word; dismiss drops the entry.
- `src/ui/App.test.tsx`: the spinner row shows while an upload is held
  (fake store resolves on demand); a failed row shows the message and Retry.

## Out of scope

Byte-level progress bars (Drive's simple upload gives none), cancelling an
upload in flight, queueing across tasks.
