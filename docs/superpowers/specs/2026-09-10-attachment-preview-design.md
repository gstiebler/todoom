# Attachment preview

Clicking an image or PDF attachment opens it in an overlay inside the app
instead of a new tab. Everything else keeps opening in Drive.

## Behaviour

- `DriveEntry` gains `mimeType`. The Drive list and upload calls already
  return it once `mimeType` is added to `ENTRY_FIELDS`.
- An attachment is previewable when its `mimeType` starts with `image/` or
  is `application/pdf`. Its name in the attachment list becomes a button
  (`.attachment__preview`) instead of a link; other attachments keep the
  `webViewLink` anchor.
- The preview is a modal over a backdrop: the file name as heading, an
  **Open in Drive** link (`webViewLink`, new tab), a × button, and an
  `<iframe>` pointed at `https://drive.google.com/file/d/<id>/preview`.
  Drive serves that page to the signed-in user for both images and PDFs, so
  no bytes go through the Worker and no extra scope is needed. Escape and the
  backdrop close it.
- While the iframe loads, a muted "Loading…" line shows under the heading and
  is removed on the iframe's `load` event.
- Nothing in `core` or `app` changes beyond the `DriveEntry` field.

## UI

- `src/ui/PreviewModal.tsx`: `PreviewModal({ entry, onClose })`. Reuses
  `.modal-backdrop`; adds `.preview`, `.preview__frame` (fills the modal,
  `aspect-ratio: 4 / 3`, `max-height: 80vh`).
- `src/ui/AttachmentsPopover.tsx`: `AttachmentList` gets a `preview`
  state (`DriveEntry | null`) and renders `PreviewModal` when set. Opening a
  preview does not close the popover.
- `src/drive/store.ts`, `src/drive/googleStore.ts`, `src/drive/fakeStore.ts`:
  the `mimeType` field; the fake takes it from `File.type` on upload.

## Testing

- `src/drive/fakeStore.test.ts` (or wherever the fake is covered): uploaded
  entries carry the file's type.
- `src/ui/App.test.tsx`: an image attachment renders a button, a `.zip`
  renders a link; clicking the button shows the modal with an iframe whose
  `src` holds the id; Escape closes it.
- `e2e/todoom.spec.ts`: extend the attach scenario to open the preview and
  assert the iframe `src`.

## Out of scope

Thumbnails in the list, previews of text files, navigating between
attachments inside the modal.
