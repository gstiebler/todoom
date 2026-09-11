# Attachment Loader Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show each attachment upload or removal as a row with a spinner, and turn a failure into an inline error with Retry, instead of silence and the global status line.

**Architecture:** `TodoomApp` keeps `state.pending`, a map from a task's `id:` word to the attachment operations in flight or failed for it. `attachFiles` and `detachFile` become thin drivers over two private operations (`upload`, `remove`) run through one `attempt` that is the only place a rejection becomes an on-screen row. `AttachmentList` renders the pending entries: extra rows for uploads, decoration on the existing row for removals.

**Tech Stack:** TypeScript strict, MobX 7 (`makeAutoObservable` makes the map and its entries observable), React 19, Vitest (jsdom), Playwright untouched.

**Spec:** `docs/superpowers/specs/2026-09-10-attachment-loader-design.md`

## Global Constraints

- Single quotes, no semicolons, ~100 columns, comments only where the code doesn't say why.
- No new `try/catch` beyond the one in `attempt`; it replaces the two existing ones in `attachFiles` / `detachFile`.
- `state.error` is never touched by attachment operations.
- CSS uses only the tokens `--accent --bg --border --fg --muted --overdue --soon --surface --tag-context --today`; new rules go before the `[data-theme='terminal']` block, which stays last in `src/ui/styles.css`.
- Commits end with a blank line then `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`. Never push.
- Gate after each task: `npx tsc --noEmit && npx vitest run`. The final task also runs `npx playwright test && npm run build`.

Rulings taken from the spec's gaps (binding):

- The fake store keeps its existing `failNextUploads(n)` and gains `failNextTrash()` and `holdNextUpload()` in the same style, instead of a generic `failNext(op)`.
- When one upload in a batch fails, the files after it are dropped from the pending list (they never started; the user picks them again). Only the failed entry remains.
- `detachFile` trashes first and edits the line only after the trash succeeded, so a failure leaves the `file:` word in place with nothing to undo.
- `ensureId` may add an `id:` word to the line even when the upload later fails; "line unchanged" in the spec means the attachments list is unchanged.

---

### Task 1: Pending attachment state

**Files:**
- Modify: `src/app/state.ts` (types near `SaveState`, `AppState`, `TodoomApp` constructor initialiser, `uploadFiles`…`detachFile` block)
- Modify: `src/drive/fakeStore.ts` (`uploadFile`, `trashFile`, hooks)
- Test: `src/app/state.test.ts` (`describe('attachments')`)

**Interfaces:**
- Consumes: `ensureId(task)` from `src/core/deps.ts`; `addAttachment(task, id)` / `removeAttachment(task, id)` from `src/core/mutate.ts`; `TodoStore.uploadFile(folder, file)` / `trashFile(id)`.
- Produces (Task 2 relies on these exact names):
  - `export type PendingKind = 'upload' | 'remove'`
  - `export interface PendingAttachment { key: string; kind: PendingKind; name: string; error: string | null; file?: File; id?: string }`
  - `AppState.pending: Map<string, PendingAttachment[]>`
  - `TodoomApp.pendingFor(index: number): PendingAttachment[]`
  - `TodoomApp.retryAttachment(taskId: string, key: string): Promise<void>`
  - `TodoomApp.dismissAttachment(taskId: string, key: string): void`
  - `FakeStore.failNextTrash(): void`, `FakeStore.holdNextUpload(): () => void` (returns the release function)

- [ ] **Step 1: Add the fake store hooks**

In `src/drive/fakeStore.ts`, add two fields next to `failingUploads`:

```ts
  private failingTrash = false
  private uploadGate: Promise<void> | null = null
```

Change `uploadFile` so the gate is awaited after the failure check and before the entry is created:

```ts
  async uploadFile(parent: FileRef, file: File): Promise<DriveEntry> {
    if (!this.signedIn) throw new Error('not signed in')
    if (this.failingUploads > 0) {
      this.failingUploads -= 1
      throw new Error(`simulated upload failure for ${file.name}`)
    }
    if (this.uploadGate) {
      const gate = this.uploadGate
      this.uploadGate = null
      await gate
    }
    const mimeType = file.type || 'application/octet-stream'
    const created = this.newEntry(file.name, parent.id, false, mimeType)
    // jsdom's File has no text(), and no attachment test needs the bytes.
    if (typeof file.text === 'function') created.text = await file.text()
    this.files.set(created.id, created)
    return entryOf(created)
  }

  /** Makes the next n uploads throw. */
  failNextUploads(n = 1): void {
    this.failingUploads = n
  }

  /** Holds the next upload open until the returned function is called. */
  holdNextUpload(): () => void {
    let release!: () => void
    this.uploadGate = new Promise<void>((resolve) => {
      release = resolve
    })
    return release
  }
```

Change `trashFile` and add its hook:

```ts
  async trashFile(id: string): Promise<void> {
    if (this.failingTrash) {
      this.failingTrash = false
      throw new Error(`simulated trash failure for ${id}`)
    }
    const entry = this.files.get(id)
    if (entry) entry.trashed = true
  }

  /** Makes the next trashFile throw. */
  failNextTrash(): void {
    this.failingTrash = true
  }
```

- [ ] **Step 2: Write the failing state tests**

In `src/app/state.test.ts`, replace the whole `describe('attachments', …)` block with:

```ts
describe('attachments', () => {
  it('uploads a file and appends its id to the line', async () => {
    const { app } = await setup()
    await app.attachFiles(0, [upload('spec.pdf')])
    const ids = app.state.tasks[0]?.attachments ?? []
    expect(ids).toHaveLength(1)
    expect(app.attachmentsById.get(ids[0] as string)?.name).toBe('spec.pdf')
  })

  it('lists the folder once at load and knows the names', async () => {
    const { app, store, workspace } = await setup()
    await store.uploadFile(workspace.attachments, upload('notes.txt'))
    await app.loadAttachments()
    const names = [...app.attachmentsById.values()].map((entry) => entry.name)
    expect(names).toContain('notes.txt')
  })

  it('detaching removes the id and trashes the Drive file', async () => {
    const { app, store } = await setup()
    await app.attachFiles(0, [upload('spec.pdf')])
    const id = app.state.tasks[0]?.attachments[0] as string
    await app.detachFile(0, id)
    expect(app.state.tasks[0]?.attachments).toEqual([])
    expect(store.isTrashed(id)).toBe(true)
    expect(app.pendingFor(0)).toEqual([])
  })

  it('uploadFiles returns one id per file', async () => {
    const { app } = await setup()
    const ids = await app.uploadFiles([upload('a.txt'), upload('b.txt')])
    expect(ids).toHaveLength(2)
  })

  it('shows a pending entry while the upload runs and drops it after', async () => {
    const { app, store } = await setup()
    const release = store.holdNextUpload()
    const done = app.attachFiles(0, [upload('spec.pdf')])
    await waitFor(() => expect(app.pendingFor(0)).toHaveLength(1))
    expect(app.pendingFor(0)[0]).toMatchObject({ kind: 'upload', name: 'spec.pdf', error: null })
    release()
    await done
    expect(app.pendingFor(0)).toEqual([])
    expect(app.state.tasks[0]?.attachments).toHaveLength(1)
  })

  it('a failed upload keeps its entry with the message and leaves the line alone', async () => {
    const { app, store } = await setup()
    store.failNextUploads(1)
    await app.attachFiles(0, [upload('spec.pdf'), upload('more.pdf')])
    const pending = app.pendingFor(0)
    expect(pending).toHaveLength(1)
    expect(pending[0]?.error).toContain('spec.pdf')
    expect(app.state.tasks[0]?.attachments).toEqual([])
    expect(app.state.error).toBeNull()
  })

  it('retrying a failed upload succeeds and clears the entry', async () => {
    const { app, store } = await setup()
    store.failNextUploads(1)
    await app.attachFiles(0, [upload('spec.pdf')])
    const taskId = app.state.tasks[0]?.pairs['id'] as string
    const key = app.pendingFor(0)[0]?.key as string
    await app.retryAttachment(taskId, key)
    expect(app.pendingFor(0)).toEqual([])
    expect(app.state.tasks[0]?.attachments).toHaveLength(1)
  })

  it('a failed removal keeps the file word and reports on the entry', async () => {
    const { app, store } = await setup()
    await app.attachFiles(0, [upload('spec.pdf')])
    const id = app.state.tasks[0]?.attachments[0] as string
    store.failNextTrash()
    await app.detachFile(0, id)
    expect(app.state.tasks[0]?.attachments).toEqual([id])
    expect(app.pendingFor(0)[0]).toMatchObject({ kind: 'remove', key: id, id })
    expect(app.pendingFor(0)[0]?.error).toContain(id)
    expect(app.state.error).toBeNull()
  })

  it('dismissing drops the entry', async () => {
    const { app, store } = await setup()
    store.failNextUploads(1)
    await app.attachFiles(0, [upload('spec.pdf')])
    const taskId = app.state.tasks[0]?.pairs['id'] as string
    app.dismissAttachment(taskId, app.pendingFor(0)[0]?.key as string)
    expect(app.pendingFor(0)).toEqual([])
  })

  it('has nothing pending for a task without an id', async () => {
    const { app } = await setup()
    expect(app.pendingFor(0)).toEqual([])
  })
})
```

`waitFor` and `upload` already exist in this file.

- [ ] **Step 3: Run the tests to see them fail**

Run: `npx vitest run src/app/state.test.ts`
Expected: the new tests fail (`pendingFor is not a function`, `holdNextUpload is not a function`, etc.); the first four still pass.

- [ ] **Step 4: Implement the pending state**

In `src/app/state.ts`, after the `SaveState` type add:

```ts
export type PendingKind = 'upload' | 'remove'

/** One attachment operation that is running or has failed, shown on its task's row. */
export interface PendingAttachment {
  key: string
  kind: PendingKind
  name: string
  error: string | null
  file?: File
  id?: string
}
```

Add to `AppState` (after `error`) and to the initialiser in `TodoomApp`:

```ts
  /** Attachment operations in flight or failed, keyed by the task's `id:` word. */
  pending: Map<string, PendingAttachment[]>
```

```ts
    pending: new Map(),
```

Add a counter field next to `revision`:

```ts
  private pendingCount = 0
```

Replace `attachFiles` and `detachFile` (keep `uploadFiles`, `AddTask.tsx` still uses it) with:

```ts
  /** Uploads the files one at a time, each landing on the line as soon as it has an id. */
  async attachFiles(index: number, files: File[]): Promise<void> {
    const task = this.state.tasks[index]
    if (!task) return
    const taskId = this.identify(index)
    const entries = files.map((file): PendingAttachment => {
      this.pendingCount += 1
      return { key: `${file.name}#${this.pendingCount}`, kind: 'upload', name: file.name, error: null, file }
    })
    runInAction(() => {
      this.state.pending.set(taskId, [...this.pendingFor(index), ...entries])
    })
    for (const [i, entry] of entries.entries()) {
      if (await this.attempt(taskId, entry.key, () => this.upload(taskId, entry.key))) continue
      // The rest never started; they come back only if the user picks them again.
      runInAction(() => {
        for (const rest of entries.slice(i + 1)) this.dismissAttachment(taskId, rest.key)
      })
      break
    }
    await this.save()
  }

  /** Trashes the Drive file and drops its id from the line once that worked. */
  async detachFile(index: number, id: string): Promise<void> {
    if (!this.state.tasks[index]) return
    const taskId = this.identify(index)
    const name = this.attachmentsById.get(id)?.name ?? id
    runInAction(() => {
      const entry: PendingAttachment = { key: id, kind: 'remove', name, error: null, id }
      this.state.pending.set(taskId, [...this.pendingFor(index), entry])
    })
    await this.attempt(taskId, id, () => this.remove(taskId, id))
    await this.save()
  }

  /** Runs the failed operation again with the same file or id. */
  async retryAttachment(taskId: string, key: string): Promise<void> {
    const entry = this.findPending(taskId, key)
    if (!entry) return
    runInAction(() => {
      entry.error = null
    })
    const run = entry.file
      ? () => this.upload(taskId, key)
      : entry.id
        ? () => this.remove(taskId, key)
        : null
    if (!run) return
    await this.attempt(taskId, key, run)
    await this.save()
  }

  dismissAttachment(taskId: string, key: string): void {
    const rest = (this.state.pending.get(taskId) ?? []).filter((entry) => entry.key !== key)
    if (rest.length === 0) this.state.pending.delete(taskId)
    else this.state.pending.set(taskId, rest)
  }

  pendingFor(index: number): PendingAttachment[] {
    const id = this.state.tasks[index]?.pairs['id']
    return id ? (this.state.pending.get(id) ?? []) : []
  }

  /** Gives the task an id: word so its pending operations have something to hang off. */
  private identify(index: number): string {
    const task = this.state.tasks[index]!
    const withId = ensureId(task)
    if (withId !== task) {
      this.state.tasks[index] = withId
      this.markDirty()
    }
    return withId.pairs['id']!
  }

  private findPending(taskId: string, key: string): PendingAttachment | undefined {
    return this.state.pending.get(taskId)?.find((entry) => entry.key === key)
  }

  private indexById(taskId: string): number {
    return this.state.tasks.findIndex((task) => task.pairs['id'] === taskId)
  }

  /** The one place an attachment rejection becomes a row on screen. */
  private async attempt(taskId: string, key: string, run: () => Promise<void>): Promise<boolean> {
    try {
      await run()
      return true
    } catch (error) {
      runInAction(() => {
        const entry = this.findPending(taskId, key)
        if (entry) entry.error = error instanceof Error ? error.message : String(error)
      })
      return false
    }
  }

  private async upload(taskId: string, key: string): Promise<void> {
    const file = this.findPending(taskId, key)?.file
    if (!file) return
    const uploaded = await this.store.uploadFile(this.attachmentsFolder, file)
    runInAction(() => {
      this.attachmentsById.set(uploaded.id, uploaded)
      const index = this.indexById(taskId)
      const task = this.state.tasks[index]
      if (task) {
        this.state.tasks[index] = addAttachment(task, uploaded.id)
        this.markDirty()
      }
      this.dismissAttachment(taskId, key)
    })
  }

  private async remove(taskId: string, id: string): Promise<void> {
    await this.store.trashFile(id)
    runInAction(() => {
      this.attachmentsById.delete(id)
      const index = this.indexById(taskId)
      const task = this.state.tasks[index]
      if (task) {
        this.state.tasks[index] = removeAttachment(task, id)
        this.markDirty()
      }
      this.dismissAttachment(taskId, id)
    })
  }
```

Notes for the implementer:
- `identify` runs synchronously inside an action-bound method (`attachFiles` is called from outside; MobX auto-actions cover synchronous mutation before the first `await`). If `tsc`/MobX warns about a mutation outside an action, wrap the `identify` call in `runInAction`.
- The two non-null assertions in `identify` are guarded by the callers' `if (!task) return` and by `ensureId` always yielding an id.
- `save()` returns early when nothing is dirty, so calling it after a failed batch is harmless.
- Delete the old `try/catch` blocks; `state.error` must no longer appear in this block.

- [ ] **Step 5: Run the tests to see them pass**

Run: `npx tsc --noEmit && npx vitest run`
Expected: all green (the old "lands in state.error" test was replaced in Step 2).

- [ ] **Step 6: Commit**

```bash
git add src/app/state.ts src/app/state.test.ts src/drive/fakeStore.ts
git commit -m "feat: track attachment uploads and removals as pending rows"
```

---

### Task 2: Pending rows in the attachment list

**Files:**
- Modify: `src/ui/AttachmentsPopover.tsx` (`AttachmentList`)
- Modify: `src/ui/styles.css` (after `.attachment__remove:hover`, before the terminal block)
- Modify: `docs/roadmap.md` (remove the `## Attachment loader` section)
- Test: `src/ui/App.test.tsx` (`describe('attachments')`)

**Interfaces:**
- Consumes from Task 1: `app.pendingFor(index)`, `app.retryAttachment(taskId, key)`, `app.dismissAttachment(taskId, key)`, `PendingAttachment`, `store.holdNextUpload()`, `store.failNextUploads(1)`, `store.failNextTrash()`.

- [ ] **Step 1: Write the failing UI tests**

In `src/ui/App.test.tsx`, inside `describe('attachments', …)` after the `withAttachments` helper, add:

```ts
  function pickFile(root: HTMLElement, name: string): void {
    const picker = root.querySelector('.attachment__picker') as HTMLInputElement
    fireEvent.change(picker, { target: { files: [new File(['x'], name, { type: 'text/plain' })] } })
  }

  it('shows a spinner row and disables Add file while an upload runs', async () => {
    const { root, store } = await mount('Buy milk\n')
    fireEvent.click(root.querySelector('.task__attach')!)
    const release = store.holdNextUpload()
    pickFile(root, 'spec.pdf')
    await waitFor(() => expect(root.querySelector('.attachment--pending')).not.toBeNull())
    expect(root.querySelector('.attachment--pending')?.textContent).toContain('spec.pdf')
    expect(root.querySelector('.attachment--pending .spinner')).not.toBeNull()
    expect(root.querySelector('.attachment--pending .attachment__remove')).toBeNull()
    expect((root.querySelector('.popover__add') as HTMLButtonElement).disabled).toBe(true)
    release()
    await waitFor(() => expect(root.querySelector('.attachment--pending')).toBeNull())
    expect(root.querySelector('.attachment__link')?.textContent).toBe('spec.pdf')
    expect((root.querySelector('.popover__add') as HTMLButtonElement).disabled).toBe(false)
  })

  it('shows the error and a Retry on a failed upload', async () => {
    const { root, store, app } = await mount('Buy milk\n')
    fireEvent.click(root.querySelector('.task__attach')!)
    store.failNextUploads(1)
    pickFile(root, 'spec.pdf')
    await waitFor(() => expect(root.querySelector('.attachment--failed')).not.toBeNull())
    expect(root.querySelector('.attachment__error')?.textContent).toContain('spec.pdf')
    expect(app.state.error).toBeNull()
    fireEvent.click(root.querySelector('.attachment__retry')!)
    await waitFor(() => expect(root.querySelector('.attachment--failed')).toBeNull())
    expect(app.state.tasks[0]?.attachments).toHaveLength(1)
  })

  it('a failed removal greys the row and its × drops the error', async () => {
    const { root, store } = await mount('Buy milk\n')
    fireEvent.click(root.querySelector('.task__attach')!)
    pickFile(root, 'spec.pdf')
    await waitFor(() => expect(root.querySelector('.attachment__link')).not.toBeNull())
    store.failNextTrash()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    fireEvent.click(root.querySelector('.attachment__remove')!)
    await waitFor(() => expect(root.querySelector('.attachment--failed')).not.toBeNull())
    expect(root.querySelector('.attachment__link')?.textContent).toBe('spec.pdf')
    fireEvent.click(root.querySelector('.attachment--failed .attachment__remove')!)
    expect(root.querySelector('.attachment--failed')).toBeNull()
    expect(root.querySelector('.attachment__link')?.textContent).toBe('spec.pdf')
  })
```

Add `vi` to the vitest import at the top of the file if it isn't there: `import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'`. Check how existing tests stub `confirm` (search `confirm` in the file) and reuse that pattern if one exists.

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run src/ui/App.test.tsx`
Expected: the three new tests fail on missing `.attachment--pending` / `.attachment--failed`.

- [ ] **Step 3: Render the pending rows**

Replace `AttachmentList` in `src/ui/AttachmentsPopover.tsx` with:

```tsx
/**
 * The files hanging off one task. A file the folder no longer holds still
 * shows up — by its id — so a stale `file:` word can be taken off the line.
 */
export const AttachmentList = observer(function AttachmentList({
  app,
  index,
  ids,
}: {
  app: TodoomApp
  index: number
  ids: string[]
}) {
  const picker = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<DriveEntry | null>(null)
  const closePreview = useCallback(() => setPreview(null), [])
  const taskId = app.state.tasks[index]?.pairs['id'] ?? ''
  const pending = app.pendingFor(index)
  const uploads = pending.filter((entry) => entry.kind === 'upload')
  const removing = (id: string) => pending.find((entry) => entry.kind === 'remove' && entry.key === id)
  const uploading = uploads.some((entry) => entry.error === null)

  const detach = (id: string, name: string) => {
    if (!confirm(`Move ${name} to the Drive trash?`)) return
    void app.detachFile(index, id)
  }

  return (
    <>
      {ids.length === 0 && uploads.length === 0 && <p className="popover__empty">No files yet.</p>}
      <ul className="attachment-list">
        {ids.map((id) => {
          const entry = app.attachmentsById.get(id)
          const state = removing(id)
          return (
            <li className={rowClass(state)} key={id}>
              {entry && isPreviewable(entry) ? (
                <button
                  className="attachment__preview"
                  type="button"
                  onClick={() => setPreview(entry)}
                >
                  {entry.name}
                </button>
              ) : entry ? (
                <a
                  className="attachment__link"
                  href={entry.webViewLink}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {entry.name}
                </a>
              ) : (
                <span className="attachment__missing">{id} (missing)</span>
              )}
              {state && <PendingMark app={app} taskId={taskId} entry={state} />}
              <button
                className="attachment__remove"
                type="button"
                title={state?.error ? 'Dismiss' : 'Remove'}
                disabled={state !== undefined && state.error === null}
                onClick={() =>
                  state?.error ? app.dismissAttachment(taskId, id) : detach(id, entry?.name ?? id)
                }
              >
                ×
              </button>
            </li>
          )
        })}
        {uploads.map((entry) => (
          <li className={rowClass(entry)} key={entry.key}>
            <span className="attachment__name">{entry.name}</span>
            <PendingMark app={app} taskId={taskId} entry={entry} />
            {entry.error && (
              <button
                className="attachment__remove"
                type="button"
                title="Dismiss"
                onClick={() => app.dismissAttachment(taskId, entry.key)}
              >
                ×
              </button>
            )}
          </li>
        ))}
      </ul>
      <div className="popover__footer">
        <button
          className="popover__add"
          type="button"
          disabled={uploading}
          onClick={() => picker.current?.click()}
        >
          Add file
        </button>
      </div>
      <input
        className="attachment__picker"
        ref={picker}
        type="file"
        multiple
        hidden
        onChange={(event) => {
          const files = [...(event.target.files ?? [])]
          if (files.length > 0) void app.attachFiles(index, files)
          event.target.value = ''
        }}
      />
      {preview && <PreviewModal entry={preview} onClose={closePreview} />}
    </>
  )
})

function rowClass(entry: PendingAttachment | undefined): string {
  if (!entry) return 'attachment'
  return entry.error ? 'attachment attachment--failed' : 'attachment attachment--pending'
}

/** A spinner while the operation runs, its error and a Retry once it failed. */
const PendingMark = observer(function PendingMark({
  app,
  taskId,
  entry,
}: {
  app: TodoomApp
  taskId: string
  entry: PendingAttachment
}) {
  if (entry.error === null) return <span className="spinner" aria-label="Working" />
  return (
    <>
      <span className="attachment__error">{entry.error}</span>
      <button
        className="attachment__retry"
        type="button"
        onClick={() => void app.retryAttachment(taskId, entry.key)}
      >
        Retry
      </button>
    </>
  )
})
```

Update the import: `import type { PendingAttachment, TodoomApp } from '../app/state'`.

- [ ] **Step 4: Style the rows**

In `src/ui/styles.css`, right after `.attachment__remove:hover { color: var(--overdue); }` add:

```css
.attachment__name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.attachment--pending { opacity: 0.6; }
.attachment--failed { flex-wrap: wrap; }
.attachment--failed .attachment__error { flex-basis: 100%; color: var(--overdue); font-size: 12px; }
.attachment__retry { padding: 2px 8px; font-size: 12px; }

.spinner {
  width: 12px;
  height: 12px;
  border: 2px solid var(--muted);
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
```

If the file already has a `@keyframes spin` (search first), reuse it and don't add a second.

- [ ] **Step 5: Run the tests to see them pass**

Run: `npx tsc --noEmit && npx vitest run`
Expected: all green. If the "failed removal" test can't find `.attachment--failed`, check that `detachFile` in `state.ts` adds the pending entry before awaiting `trashFile` (Task 1).

- [ ] **Step 6: Drop the roadmap entry**

In `docs/roadmap.md`, delete the `## Attachment loader` heading and its paragraph (up to the blank line before `## Localization`).

- [ ] **Step 7: Full gate and commit**

Run: `npx tsc --noEmit && npx vitest run && npx playwright test && npm run build`
Expected: all green.

```bash
git add src/ui/AttachmentsPopover.tsx src/ui/styles.css src/ui/App.test.tsx docs/roadmap.md
git commit -m "feat: show attachment progress and errors on the row"
```
