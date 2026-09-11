import { observer } from 'mobx-react-lite'
import { useRef, useState } from 'react'
import type { TodoomApp } from '../app/state'
import { collectContexts, collectProjects } from '../core/query'
import { composeLine, emptyDraft } from './composeLine'
import { DatePopover } from './DatePopover'
import { LabelsPopover } from './LabelsPopover'
import { useLocale } from './locale'

const PRIORITIES = ['A', 'B', 'C', 'D']

type Popover = 'date' | 'priority' | 'labels' | null

const AddTaskModal = observer(function AddTaskModal({
  app,
  today,
  onClose,
}: {
  app: TodoomApp
  today: string
  onClose: () => void
}) {
  const { t } = useLocale()
  // The draft lives here and the modal is unmounted when closed, so every open
  // starts clean without an explicit reset.
  const [draft, setDraft] = useState(emptyDraft())
  const [popover, setPopover] = useState<Popover>(null)
  // The files are held locally and only uploaded on submit, so a cancelled
  // modal leaves nothing behind in Drive.
  const [files, setFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const picker = useRef<HTMLInputElement>(null)

  const labels = [
    ...collectProjects(app.state.tasks).map((p) => `+${p}`),
    ...collectContexts(app.state.tasks).map((c) => `@${c}`),
  ]

  const toggle = (next: Popover) => setPopover((current) => (current === next ? null : next))
  const submit = async () => {
    if (composeLine(draft).length === 0) return
    setUploading(true)
    const attachments = files.length > 0 ? await app.uploadFiles(files) : []
    setUploading(false)
    app.addTask(composeLine({ ...draft, attachments }))
    onClose()
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={t('addTask.aria')}
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Escape') return
          // Escape peels one layer at a time: the open popover first, the
          // modal only once nothing is covering it.
          if (popover) setPopover(null)
          else onClose()
        }}
      >
        <input
          className="add-input"
          autoFocus
          placeholder={t('addTask.textPlaceholder')}
          value={draft.text}
          onChange={(event) => setDraft({ ...draft, text: event.target.value })}
        />

        <input
          className="add-description"
          placeholder={t('common.description')}
          value={draft.note}
          onChange={(event) => setDraft({ ...draft, note: event.target.value })}
        />

        <div className="chip-row">
          <button
            type="button"
            className={draft.due ? 'modal-chip modal-chip--set' : 'modal-chip'}
            onClick={() => toggle('date')}
          >
            {draft.due ?? t('date.fieldLabel')}
            {draft.rec && ` · ${draft.rec}`}
          </button>
          <button
            type="button"
            className={draft.priority ? 'modal-chip modal-chip--set' : 'modal-chip'}
            onClick={() => toggle('priority')}
          >
            {draft.priority ? `(${draft.priority})` : t('common.priority')}
          </button>
          <button
            type="button"
            className={draft.labels.length > 0 ? 'modal-chip modal-chip--set' : 'modal-chip'}
            onClick={() => toggle('labels')}
          >
            {draft.labels.length > 0 ? draft.labels.join(' ') : t('common.labels')}
          </button>

          <button
            type="button"
            className={files.length > 0 ? 'modal-chip modal-chip--set' : 'modal-chip'}
            onClick={() => picker.current?.click()}
          >
            {files.length > 0 ? files.map((file) => file.name).join(' ') : t('addTask.attachChip')}
          </button>
          <input
            className="attach-picker"
            ref={picker}
            type="file"
            multiple
            hidden
            onChange={(event) => {
              setFiles([...(event.target.files ?? [])])
              event.target.value = ''
            }}
          />

          <div className="modal-actions">
            <button
              type="button"
              className="modal-cancel"
              aria-label={t('common.cancel')}
              onClick={onClose}
            >
              ×
            </button>
            <button
              className="modal-submit"
              aria-label={t('addTask.aria')}
              disabled={uploading || draft.text.trim() === ''}
            >
              {uploading ? '…' : '↑'}
            </button>
          </div>
        </div>

        {popover === 'date' && (
          <DatePopover
            today={today}
            due={draft.due}
            rec={draft.rec}
            onDue={(due) => setDraft((current) => ({ ...current, due }))}
            onRec={(rec) => setDraft((current) => ({ ...current, rec }))}
          />
        )}

        {popover === 'priority' && (
          <div className="popover popover--priority">
            {PRIORITIES.map((priority) => (
              <button
                key={priority}
                type="button"
                className={draft.priority === priority ? 'priority priority--active' : 'priority'}
                onClick={() =>
                  setDraft((current) => ({
                    ...current,
                    priority: current.priority === priority ? null : priority,
                  }))
                }
              >
                ({priority})
              </button>
            ))}
          </div>
        )}

        {popover === 'labels' && (
          <LabelsPopover
            available={labels}
            selected={draft.labels}
            onToggle={(label) =>
              setDraft((current) => ({
                ...current,
                labels: current.labels.includes(label)
                  ? current.labels.filter((l) => l !== label)
                  : [...current.labels, label],
              }))
            }
          />
        )}
      </form>
    </div>
  )
})

export const AddTask = observer(function AddTask({
  app,
  today,
}: {
  app: TodoomApp
  today: string
}) {
  const { t } = useLocale()
  const [open, setOpen] = useState(false)

  return (
    <>
      <button className="add-task" onClick={() => setOpen(true)}>
        {t('addTask.openButton')}
      </button>
      {open && <AddTaskModal app={app} today={today} onClose={() => setOpen(false)} />}
    </>
  )
})
