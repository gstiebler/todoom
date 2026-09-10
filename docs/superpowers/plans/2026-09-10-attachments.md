# Attachments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a task carry files, stored in Google Drive next to the todo file, in a `Todoom` folder that also holds `todo.txt` and `done.txt`.

**Architecture:** An attachment is a Drive file id written into the task's line as a repeatable `file:<id>` word. The line never carries the filename; names are resolved once per load by listing the `Todoom` folder. The Drive adapter grows folder and upload operations behind the existing `TodoStore` interface, so the fake store keeps every test offline.

**Tech Stack:** Unchanged — Vite 8, TypeScript, Vitest 5, React 19, MobX 7, Playwright, Drive REST v3.

**Spec:** none; agreed in conversation on 2026-09-10. The decisions that shaped it are recorded under Decisions below.

## Global Constraints

- Google OAuth scope stays exactly `https://www.googleapis.com/auth/drive.file`. It covers folders and files the app creates, including uploads. Never request another scope.
- The Cloudflare Worker is not touched. Uploads go browser → Drive with the access token, like every other Drive call.
- The access token stays in a module-level variable. Never `localStorage`, `sessionStorage`, a cookie, `window`, or a log.
- The core (`src/core/`) imports nothing from `src/drive/` or `src/ui/` and touches no browser global.
- Writes to observable state after an `await` go inside `runInAction`. A `reaction` effect may write state; an `autorun` body may not.
- Strict TypeScript, `noUncheckedIndexedAccess`. Commit after every task, conventional prefixes.
- Every task ends green: `npx tsc --noEmit`, `npx vitest run`, and — from Task 2 on — `npx playwright test`.

## Decisions

- **No migration.** Any previously created root-level `todo.txt` is ignored. The localStorage key changes from `todoom.rootFileRef` to `todoom.workspace`, so a stale ref is never read, and the app creates the folder and files fresh.
- **Attachments sit directly in `/Todoom`**, not in a nested subfolder. Duplicate filenames are fine; Drive keys on id.
- **Opening an attachment** links to its Drive `webViewLink` in a new tab. No in-app download, no inline preview.
- **Detaching trashes the Drive file** (recoverable for 30 days) behind a `confirm()`, so detached files do not pile up invisibly in the user's Drive.
- **Composer uploads on submit**, not on file selection, so cancelling the modal cannot strand orphan files.

---

### Task 1: Folder, upload, list and trash in the Drive layer

**Files:**
- Modify: `src/drive/store.ts`
- Modify: `src/drive/googleStore.ts`
- Modify: `src/drive/fakeStore.ts`
- Test: `src/drive/googleStore.test.ts`, `src/drive/fakeStore.test.ts`

**Interfaces:**
- Produces:
```ts
export interface DriveEntry {
  id: string
  name: string
  webViewLink: string
}

export interface TodoStore {
  // ...unchanged: isSignedIn, signIn, signOut, read, write, getModifiedTime
  findOrCreateFolder(name: string): Promise<FileRef>
  findOrCreateFileIn(parent: FileRef, name: string): Promise<FileRef>
  uploadFile(parent: FileRef, file: File): Promise<DriveEntry>
  listFiles(parent: FileRef): Promise<DriveEntry[]>
  trashFile(id: string): Promise<void>
}
```
- `findOrCreateRootFile` and `findOrCreateSibling` are removed; `createFile` becomes private to the Google store.

- [ ] **Step 1: Write the failing store tests**

In `googleStore.test.ts`, against the existing fetch stub:

```ts
it('creates the folder with the Drive folder mime type', async () => { /* asserts POST body mimeType application/vnd.google-apps.folder and parents ['root'] */ })
it('reuses an existing folder', async () => { /* list returns one file; no POST */ })
it('scopes findOrCreateFileIn to the parent', async () => { /* q contains "'<parent>' in parents" */ })
it('uploads in two steps: metadata then media', async () => { /* POST /files then PATCH /upload/.../{id}?uploadType=media with the file's type */ })
it('returns the webViewLink of an upload', async () => { ... })
it('lists the files in a folder', async () => { ... })
it('trashes a file with a PATCH', async () => { /* body { trashed: true } */ })
```

- [ ] **Step 2: Run them and watch them fail**

`npx vitest run src/drive` — fails on missing methods.

- [ ] **Step 3: Implement in `googleStore.ts`**

Upload is the existing two-step shape — `createFile(name, parent, mimeType)` then a media `PATCH` — rather than a hand-rolled `multipart/related` body. One extra round trip, far less code. Request `fields=id,name,webViewLink` wherever an entry is returned. Reuse `quoteForQuery` for every name and parent interpolated into a `q`.

- [ ] **Step 4: Mirror it in `fakeStore.ts`**

Entries gain `parent?: string` and `webViewLink` (`https://drive.fake/<id>`). `refFor` and the seed keep working unchanged. Add `seedIn(parent, name, text)` for tests that need a file already inside a folder.

- [ ] **Step 5: Green, then commit**

```bash
npx tsc --noEmit && npx vitest run
git commit -am "feat: fold folders, uploads and trashing into the Drive store"
```

---

### Task 2: Put the workspace in a Todoom folder

**Files:**
- Modify: `src/app/session.ts`
- Modify: `src/app/state.ts` (the `done.txt` lookup in `archive()`)
- Modify: `src/main.tsx`, `e2e/fixture.tsx`
- Test: `src/app/session.test.ts`

**Interfaces:**
- Produces: `export interface Workspace { folder: FileRef; todo: FileRef }` and
  `export async function openWorkspace(store: TodoStore): Promise<Workspace>`.
  `loadOrCreateTodoFile` is removed. The localStorage key becomes `todoom.workspace`, holding `{ folder, todo }`.

- [ ] **Step 1: Write the failing session tests**

```ts
it('creates the Todoom folder and the todo file inside it', async () => { ... })
it('remembers the workspace across loads', async () => { /* second call makes no Drive calls */ })
it('ignores a legacy todoom.rootFileRef', async () => { /* old key present, still creates the folder */ })
it('discards a malformed saved workspace', async () => { ... })
```

- [ ] **Step 2: Run them and watch them fail**

- [ ] **Step 3: Implement `openWorkspace`**

Folder first (`findOrCreateFolder('Todoom')`), then `findOrCreateFileIn(folder, 'todo.txt')`, then save both under the new key. `TodoomApp` takes the folder so `archive()` can resolve `done.txt` with `findOrCreateFileIn(folder, 'done.txt')`.

- [ ] **Step 4: Green — including e2e, which proves the fixture still boots**

```bash
npx tsc --noEmit && npx vitest run && npx playwright test
git commit -am "feat: keep todo.txt and done.txt in a Todoom folder"
```

---

### Task 3: `file:` words in the core

**Files:**
- Modify: `src/core/types.ts`, `src/core/parse.ts`, `src/core/mutate.ts`
- Test: `src/core/parse.test.ts`, `src/core/mutate.test.ts`

**Interfaces:**
- Produces: `Task.attachments: string[]`; `addAttachment(task: Task, id: string): Task`;
  `removeAttachment(task: Task, id: string): Task`.

- [ ] **Step 1: Write the failing core tests**

```ts
it('collects a file id', () => { expect(parseLine('Buy milk file:1AbC_dEf23').attachments).toEqual(['1AbC_dEf23']) })
it('collects several file ids', () => { ... })
it('has no attachments without a file word', () => { ... })
it('ignores a file word with an empty id', () => { /* 'file:' alone */ })
it('appends a file id once', () => { /* addAttachment twice adds one word */ })
it('removes only the named file id', () => { ... })
```

`Task.attachments` is collected the way `projects` and `contexts` are — a regex over the description — because `pairs` is a `Record` and collapses repeated keys.

- [ ] **Step 2: Run them and watch them fail**

- [ ] **Step 3: Implement**

```ts
const ATTACHMENT_RE = /(?:^|\s)file:([A-Za-z0-9_-]+)(?=\s|$)/g
```

Drive ids satisfy the existing `PAIR_RE` value grammar (no `:`, no leading `/`), so `file:` also lands in `pairs` — harmless, and nothing reads `pairs['file']`.

- [ ] **Step 4: Green, then commit**

```bash
npx tsc --noEmit && npx vitest run
git commit -am "feat: read and write file: attachment ids in a task line"
```

---

### Task 4: Attachments on the app state

**Files:**
- Modify: `src/app/state.ts`
- Test: `src/app/state.test.ts`

**Interfaces:**
- Produces, on `TodoomApp`:
```ts
attachmentsById: Map<string, DriveEntry>   // observable, filled at load
loadAttachments(): Promise<void>           // one listFiles of the folder
attachFiles(index: number, files: File[]): Promise<void>
detachFile(index: number, id: string): Promise<void>
uploadFiles(files: File[]): Promise<string[]>   // ids, for the composer
```

- [ ] **Step 1: Write the failing state tests**

```ts
it('uploads a file and appends its id to the line', async () => { ... })
it('lists the folder once at load and knows the names', async () => { ... })
it('detaching removes the id and trashes the Drive file', async () => { ... })
it('an upload failure lands in state.error and leaves the line alone', async () => { ... })
it('uploadFiles returns one id per file', async () => { ... })
```

- [ ] **Step 2: Run them and watch them fail**

- [ ] **Step 3: Implement**

Every write after an `await` goes in `runInAction`. Failures follow the shape `save()` already uses: caught, put in `state.error`, not thrown at the UI. `attachFiles` uploads first and only edits the line once every upload has an id, so a half-failed batch leaves no dangling reference.

- [ ] **Step 4: Green, then commit**

```bash
npx tsc --noEmit && npx vitest run
git commit -am "feat: attach, list and detach files from the app state"
```

---

### Task 5: The paperclip on a task row

**Files:**
- Modify: `src/ui/icons.tsx` (add `PaperclipIcon`), `src/ui/TaskList.tsx`, `src/ui/styles.css`
- Create: `src/ui/AttachmentsPopover.tsx`
- Test: `src/ui/App.test.tsx`

**Interfaces:**
- Consumes: `app.attachmentsById`, `app.attachFiles`, `app.detachFile` (Task 4); `task.attachments` (Task 3).
- Produces: `AttachmentsPopover({ app, index, ids, onClose })`.

- [ ] **Step 1: Write the failing UI tests**

```ts
it('shows the attachment count on the row', async () => { /* .task__attach reads "2" */ })
it('opens the popover with the file names', async () => { ... })
it('links an attachment to its Drive page in a new tab', async () => { /* target=_blank rel="noopener noreferrer" */ })
it('shows a missing file as removable', async () => { /* id with no entry in attachmentsById */ })
it('closes the popover on Escape', async () => { ... })
```

- [ ] **Step 2: Run them and watch them fail**

- [ ] **Step 3: Implement**

The paperclip button lives in the row's action area beside the delete `×` and is always present — one consistent affordance rather than a hover-only control, which is unusable on touch. It carries a count only when there is something attached. The popover reuses the existing `.popover` styling from the date and labels popovers; "Add file" is a `<button>` over a hidden `<input type="file" multiple>`. Detach calls `confirm()` before `app.detachFile`.

- [ ] **Step 4: Green, then commit**

```bash
npx tsc --noEmit && npx vitest run
git commit -am "feat: attach files to a task from its row"
```

---

### Task 6: The Attach chip in the composer

**Files:**
- Modify: `src/ui/AddTask.tsx`, `src/ui/composeLine.ts`, `src/ui/styles.css`
- Test: `src/ui/composeLine.test.ts`, `src/ui/App.test.tsx`

**Interfaces:**
- Consumes: `app.uploadFiles` (Task 4).
- Produces: `Draft.attachments: string[]` (ids), appended by `composeLine` as `file:<id>` words.

- [ ] **Step 1: Write the failing tests**

```ts
it('appends each attachment id', () => { ... })                     // composeLine
it('does not duplicate an id the text already carries', () => { ... })
it('uploads the chosen files on submit and links them', async () => { ... })  // App
it('uploads nothing when the modal is cancelled', async () => { ... })
```

- [ ] **Step 2: Run them and watch them fail**

- [ ] **Step 3: Implement**

A fourth chip, "Attach", showing the chosen filenames. `submit` becomes async: `uploadFiles` → ids → `composeLine` → `addTask`. The submit button disables and reads as uploading while it runs.

- [ ] **Step 4: Green, then commit**

```bash
npx tsc --noEmit && npx vitest run
git commit -am "feat: attach files while composing a task"
```

---

### Task 7: End-to-end and a look at it

**Files:**
- Modify: `e2e/todoom.spec.ts`, `e2e/fixture.tsx`

- [ ] **Step 1: Write the failing e2e case**

```ts
test('attaches a file to a task', async ({ page }) => {
  await page.goto(PAGE)
  await page.locator('.task', { hasText: 'Buy milk' }).locator('.task__attach').click()
  await page.setInputFiles('.attachments__input', { name: 'recipe.txt', mimeType: 'text/plain', buffer: Buffer.from('eggs') })
  await expect(page.locator('.attachment')).toHaveText(/recipe.txt/)
})
```

- [ ] **Step 2: Run it and watch it fail**

- [ ] **Step 3: Make it pass**

The fake store already backs the fixture, so an upload is in-memory.

- [ ] **Step 4: Full sweep, screenshot, commit**

```bash
npx tsc --noEmit && npx vitest run && npx playwright test && npm run build
git commit -am "test: cover attaching a file end to end"
```

Screenshot the row popover and the composer chip in the browser before the final commit.
