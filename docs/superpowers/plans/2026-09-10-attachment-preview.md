# Attachment Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clicking an image or PDF attachment opens Drive's preview page in an in-app modal; other files keep opening in Drive.

**Architecture:** `DriveEntry` gains `mimeType`, carried by both stores. `AttachmentList` renders previewable entries as a button that sets `preview` state, and mounts `PreviewModal` — a `.modal-backdrop` with a heading, an Open-in-Drive link, a close button and an `<iframe>` at `https://drive.google.com/file/d/<id>/preview`.

**Tech Stack:** React 19, MobX 7, TypeScript strict (`noUncheckedIndexedAccess`), Vitest 5 (jsdom for UI), Playwright, Google Drive REST v3.

**Spec:** `docs/superpowers/specs/2026-09-10-attachment-preview-design.md`

## Global Constraints

- Single quotes, no semicolons, ~100 columns; comments only where the code doesn't say why.
- No try/catch; let errors bubble.
- The terminal skin block (`[data-theme='terminal']`) stays the last thing in `src/ui/styles.css`.
- Colours only from existing tokens: `--accent --bg --border --fg --muted --overdue --soon --surface --tag-context --today`.
- Previewable ⇔ `mimeType` starts with `image/` or equals `application/pdf`.
- Iframe URL exactly `https://drive.google.com/file/d/<id>/preview`.
- Nothing in `src/core` or `src/app` changes.
- Commit messages end with a blank line then `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`. Never push.

---

### Task 1: `mimeType` on `DriveEntry` through both stores

**Files:**
- Modify: `src/drive/store.ts:7-11` (`DriveEntry`)
- Modify: `src/drive/googleStore.ts` (`ENTRY_FIELDS` line 7, `DriveFile` ~line 10, `entryOf` ~line 31)
- Modify: `src/drive/fakeStore.ts` (`Entry` ~line 3, `entryOf` ~line 13, `newEntry` ~line 39, `uploadFile` ~line 120)
- Test: `src/drive/fakeStore.test.ts` (~line 115), `src/drive/googleStore.test.ts` (~lines 160-205)
- Modify: `src/ui/App.test.tsx:326-330` (the `withAttachments` fixture gains `mimeType: 'application/pdf'`)

**Interfaces:**
- Produces: `DriveEntry { id; name; webViewLink; mimeType: string }`. Google fills it from the API (`''` when absent); the fake takes `file.type` on upload (`'application/octet-stream'` when empty) and `'application/vnd.google-apps.folder'` for folders, `'text/plain'` for seeded/created text files.

- [ ] **Step 1: Write the failing tests**

`src/drive/fakeStore.test.ts`, after `stores an uploaded file with its contents and a link`:

```ts
  it('remembers the type of an uploaded file', async () => {
    const store = await signedIn()
    const folder = await store.findOrCreateFolder('Todoom')
    const png = await store.uploadFile(folder, new File(['x'], 'a.png', { type: 'image/png' }))
    expect(png.mimeType).toBe('image/png')
    const blob = await store.uploadFile(folder, new File(['x'], 'blob', { type: '' }))
    expect(blob.mimeType).toBe('application/octet-stream')
    expect((await store.listFiles(folder)).map((e) => e.mimeType)).toEqual([
      'image/png',
      'application/octet-stream',
    ])
  })
```

`src/drive/googleStore.test.ts`: in `returns the id, name and Drive link of the upload`, make the mocked body `{ id: 'up', name: 'notes.txt', webViewLink: 'https://drive/up', mimeType: 'text/plain' }` and the expected entry gain `mimeType: 'text/plain'`. In `lists what is in the folder`, add `mimeType: 'image/png'` to the mocked file and to the expected entry. Add one more test in the same describe:

```ts
  it('asks Drive for the mime type', async () => {
    const drive = driveBodies({ files: [] })
    const store = new GoogleDriveStore(tokenSource('tok'))
    await store.listFiles(folder)
    expect(urlOf(drive, 0)).toContain('mimeType')
  })

  it('falls back to an empty mime type when Drive omits it', async () => {
    driveBodies({ files: [{ id: 'a', name: 'one.txt', webViewLink: 'https://drive/a' }] })
    const store = new GoogleDriveStore(tokenSource('tok'))
    expect((await store.listFiles(folder))[0]?.mimeType).toBe('')
  })
```

`src/ui/App.test.tsx` `withAttachments` (~line 326): add `mimeType: 'application/pdf'` to the entry so the object satisfies the widened type.

- [ ] **Step 2: Run the tests and the type check to verify they fail**

Run: `npx vitest run src/drive && npx tsc --noEmit`
Expected: the new tests fail; `tsc` reports `mimeType` unknown on `DriveEntry`.

- [ ] **Step 3: Implement**

`src/drive/store.ts`:

```ts
export interface DriveEntry {
  id: string
  name: string
  webViewLink: string
  mimeType: string
}
```

`src/drive/googleStore.ts`:

```ts
const ENTRY_FIELDS = 'id,name,webViewLink,mimeType'

interface DriveFile {
  id: string
  name: string
  webViewLink?: string
  mimeType?: string
}

function entryOf(file: DriveFile): DriveEntry {
  return {
    id: file.id,
    name: file.name,
    webViewLink: file.webViewLink ?? '',
    mimeType: file.mimeType ?? '',
  }
}
```

`src/drive/fakeStore.ts`: add `mimeType: string` to `Entry`; `entryOf` returns `mimeType: entry.mimeType`; `newEntry(name, parent = 'root', isFolder = false, mimeType = isFolder ? 'application/vnd.google-apps.folder' : 'text/plain')` sets `mimeType`; `uploadFile` calls `this.newEntry(file.name, parent.id, false, file.type || 'application/octet-stream')`.

Fix any other `DriveEntry` literals `tsc` flags (`git grep -n "webViewLink:" -- src e2e`).

- [ ] **Step 4: Run the tests and type check to verify they pass**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/drive src/ui/App.test.tsx
git commit -m "feat: drive entries carry their mime type"
```

---

### Task 2: PreviewModal and the attachment button

**Files:**
- Create: `src/ui/PreviewModal.tsx`
- Modify: `src/ui/AttachmentsPopover.tsx` (`AttachmentList`)
- Modify: `src/ui/styles.css` (above the terminal block, after `.attachment__missing` ~line 700)
- Test: `src/ui/App.test.tsx` (`attachments` describe ~line 320)
- Create: `e2e/files/pixel.png` (a 1×1 PNG)
- Modify: `e2e/todoom.spec.ts:70-77` (`attaches a file to a task`)
- Modify: `docs/roadmap.md` (remove `## Attachment preview`)

**Interfaces:**
- Consumes: `DriveEntry.mimeType` from Task 1; `app.attachmentsById`; CSS `.modal-backdrop`.
- Produces: `PreviewModal({ entry, onClose })`; DOM `.preview` (on the modal box), `.preview__title`, `.preview__open`, `.preview__close`, `.preview__loading`, `.preview__frame`; `.attachment__preview` button in the list.

- [ ] **Step 1: Write the failing tests**

In `src/ui/App.test.tsx`, inside `describe('attachments')`, add:

```ts
  async function withPreviewable() {
    const mounted = await mount('Buy milk file:img file:zip\n')
    await act(async () => {
      mounted.app.attachmentsById.set('img', {
        id: 'img',
        name: 'photo.png',
        webViewLink: 'https://drive.example/img',
        mimeType: 'image/png',
      })
      mounted.app.attachmentsById.set('zip', {
        id: 'zip',
        name: 'bundle.zip',
        webViewLink: 'https://drive.example/zip',
        mimeType: 'application/zip',
      })
    })
    fireEvent.click(mounted.root.querySelector('.task__attach')!)
    return mounted
  }

  it('offers a preview button for images and a link for other files', async () => {
    const { root } = await withPreviewable()
    expect(root.querySelector('.attachment__preview')?.textContent).toBe('photo.png')
    expect(root.querySelector('.attachment__link')?.textContent).toBe('bundle.zip')
  })

  it('opens the Drive preview in a modal and closes it on Escape', async () => {
    const { root } = await withPreviewable()
    fireEvent.click(root.querySelector('.attachment__preview')!)
    const frame = root.querySelector<HTMLIFrameElement>('.preview__frame')
    expect(frame?.getAttribute('src')).toBe('https://drive.google.com/file/d/img/preview')
    expect(root.querySelector('.preview__title')?.textContent).toBe('photo.png')
    expect(root.querySelector<HTMLAnchorElement>('.preview__open')?.href).toBe(
      'https://drive.example/img',
    )
    expect(root.querySelector('.preview__loading')).not.toBeNull()
    fireEvent.load(frame!)
    expect(root.querySelector('.preview__loading')).toBeNull()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(root.querySelector('.preview')).toBeNull()
    expect(root.querySelector('.popover--attachments')).not.toBeNull()
  })

  it('closes the preview from its button and its backdrop', async () => {
    const { root } = await withPreviewable()
    fireEvent.click(root.querySelector('.attachment__preview')!)
    fireEvent.click(root.querySelector('.preview__close')!)
    expect(root.querySelector('.preview')).toBeNull()
    fireEvent.click(root.querySelector('.attachment__preview')!)
    fireEvent.click(root.querySelector('.preview')!.parentElement!)
    expect(root.querySelector('.preview')).toBeNull()
  })
```

The existing `links an attachment to its Drive page in a new tab` test uses `spec.pdf` with `mimeType: 'application/pdf'` from Task 1's fixture change, which is now previewable and would render a button. Change that fixture's `known` entry to `name: 'notes.txt', mimeType: 'text/plain'` and update the assertion at ~line 343 (`toContain('spec.pdf')`) to `'notes.txt'`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/ui/App.test.tsx`
Expected: the three new tests fail.

- [ ] **Step 3: Write `src/ui/PreviewModal.tsx`**

```tsx
import { useEffect, useState } from 'react'
import type { DriveEntry } from '../drive/store'

export function isPreviewable(entry: DriveEntry): boolean {
  return entry.mimeType.startsWith('image/') || entry.mimeType === 'application/pdf'
}

/** Drive's own viewer page, which it serves to the signed-in user for images and PDFs. */
function previewUrl(id: string): string {
  return `https://drive.google.com/file/d/${id}/preview`
}

export function PreviewModal({ entry, onClose }: { entry: DriveEntry; onClose: () => void }) {
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal preview"
        role="dialog"
        aria-modal="true"
        aria-label={entry.name}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="preview__bar">
          <h2 className="preview__title">{entry.name}</h2>
          <a
            className="preview__open"
            href={entry.webViewLink}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open in Drive
          </a>
          <button className="preview__close" type="button" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        {loading && <p className="preview__loading">Loading…</p>}
        <iframe
          className="preview__frame"
          src={previewUrl(entry.id)}
          title={entry.name}
          allow="autoplay"
          onLoad={() => setLoading(false)}
        />
      </div>
    </div>
  )
}
```

The Escape listener is on the window like `TaskModal`'s; `stopPropagation` keeps the popover's own Escape handler from closing the popover underneath. If the popover still closes in the test (`popover--attachments` should remain), the popover's `onKeyDown` fires first because React handles the event at the root before the window listener; in that case, instead of the window listener, put the `onKeyDown` on the `.preview` div and give it `tabIndex={-1}` with a `useEffect` that focuses it on mount — mirroring `AttachmentsPopover`. Update the test to `fireEvent.keyDown(root.querySelector('.preview')!, { key: 'Escape' })` if you take that route, and stop propagation there.

- [ ] **Step 4: Use it in `AttachmentList`**

In `src/ui/AttachmentsPopover.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react'
import type { DriveEntry } from '../drive/store'
import { isPreviewable, PreviewModal } from './PreviewModal'
```

Inside `AttachmentList`, add `const [preview, setPreview] = useState<DriveEntry | null>(null)` and replace the `{entry ? (<a …>) : (<span …>)}` branch with:

```tsx
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
```

and, before the closing `</>`:

```tsx
      {preview && <PreviewModal entry={preview} onClose={() => setPreview(null)} />}
```

- [ ] **Step 5: Styles**

After `.attachment__missing` (~line 700), above the terminal block:

```css
.attachment__preview {
  border: 0;
  background: none;
  padding: 0;
  font: inherit;
  color: var(--accent);
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: left;
}
.preview { width: min(960px, 100%); display: flex; flex-direction: column; gap: 8px; }
.preview__bar { display: flex; align-items: baseline; gap: 12px; }
.preview__title {
  flex: 1 1 auto;
  margin: 0;
  font-size: 15px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.preview__open { color: var(--accent); font-size: 13px; }
.preview__close {
  border: 0;
  background: none;
  font-size: 20px;
  line-height: 1;
  color: var(--muted);
  cursor: pointer;
}
.preview__loading { margin: 0; color: var(--muted); font-size: 13px; }
.preview__frame {
  width: 100%;
  aspect-ratio: 4 / 3;
  max-height: 80vh;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
}
```

- [ ] **Step 6: Run the unit tests and type check**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS.

- [ ] **Step 7: e2e**

Create `e2e/files/pixel.png` with:

```bash
printf '\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82' > e2e/files/pixel.png
```

Extend `attaches a file to a task` in `e2e/todoom.spec.ts`:

```ts
test('attaches a file to a task and previews an image', async ({ page }) => {
  await page.goto(PAGE)
  const row = page.locator('.task', { hasText: 'Buy milk' })
  await row.locator('.task__attach').click()
  await page.setInputFiles('.attachment__picker', 'e2e/files/recipe.txt')
  await expect(page.locator('.attachment')).toHaveText(/recipe.txt/)
  await expect(row.locator('.task__attach')).toHaveText('1')

  await page.setInputFiles('.attachment__picker', 'e2e/files/pixel.png')
  await page.locator('.attachment__preview', { hasText: 'pixel.png' }).click()
  await expect(page.locator('.preview__frame')).toHaveAttribute(
    'src',
    /https:\/\/drive\.google\.com\/file\/d\/.+\/preview/,
  )
  await page.locator('.preview__close').click()
  await expect(page.locator('.preview')).toHaveCount(0)
})
```

Run: `npx playwright test`
Expected: 15 pass. The iframe points at a real Drive URL; the test only asserts the attribute, so no network wait is needed. If Playwright hangs on the iframe navigation, add `await page.route('https://drive.google.com/**', (route) => route.fulfill({ body: '' }))` at the top of the test.

- [ ] **Step 8: Roadmap, full gate, commit**

Remove the `## Attachment preview` section from `docs/roadmap.md`.

Run: `npx tsc --noEmit && npx vitest run && npx playwright test && npm run build`
Expected: all green.

```bash
git add src/ui/PreviewModal.tsx src/ui/AttachmentsPopover.tsx src/ui/styles.css src/ui/App.test.tsx e2e/files/pixel.png e2e/todoom.spec.ts docs/roadmap.md
git commit -m "feat: preview image and PDF attachments in a modal"
```
