import { observer } from 'mobx-react-lite'
import { useEffect, useRef } from 'react'
import type { TodoomApp } from '../app/state'

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

  const detach = (id: string, name: string) => {
    if (!confirm(`Move ${name} to the Drive trash?`)) return
    void app.detachFile(index, id)
  }

  return (
    <>
      {ids.length === 0 && <p className="popover__empty">No files yet.</p>}
      <ul className="attachment-list">
        {ids.map((id) => {
          const entry = app.attachmentsById.get(id)
          return (
            <li className="attachment" key={id}>
              {entry ? (
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
              <button
                className="attachment__remove"
                type="button"
                title="Remove"
                onClick={() => detach(id, entry?.name ?? id)}
              >
                ×
              </button>
            </li>
          )
        })}
      </ul>
      <div className="popover__footer">
        <button className="popover__add" type="button" onClick={() => picker.current?.click()}>
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
    </>
  )
})

/** The same list, hanging off a task row. */
export const AttachmentsPopover = observer(function AttachmentsPopover({
  app,
  index,
  ids,
  onClose,
}: {
  app: TodoomApp
  index: number
  ids: string[]
  onClose: () => void
}) {
  const panel = useRef<HTMLDivElement>(null)

  // Escape closes the popover, which means it has to hold the focus first.
  useEffect(() => panel.current?.focus(), [])

  return (
    <div
      className="popover popover--attachments"
      ref={panel}
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose()
      }}
    >
      <AttachmentList app={app} index={index} ids={ids} />
    </div>
  )
})
