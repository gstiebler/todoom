import { observer } from 'mobx-react-lite'
import { useEffect, useState } from 'react'
import type { Task } from '../core/types'
import type { TodoomApp } from '../app/state'
import { setDue, setNote, setPriority, setRec, toggleLabel } from '../core/mutate'
import { setTitle, taskTitle } from '../core/title'
import { collectContexts, collectProjects } from '../core/query'
import { describeTask } from './describeTask'
import { AttachmentList } from './AttachmentsPopover'
import { DatePopover } from './DatePopover'
import { LabelsPopover } from './LabelsPopover'
import { DependencyPopover } from './DependencyPopover'
import { blockerOf, wouldCycle } from '../core/deps'
import { CalendarIcon, RepeatIcon, TagIcon } from './icons'

const PRIORITIES = ['A', 'B', 'C', 'D']

type Field = 'date' | 'priority' | 'labels' | 'deps' | null

/** The task on its own: the title and description on the left, its fields on the right. */
export const TaskModal = observer(function TaskModal({
  app,
  task,
  today,
  onClose,
}: {
  app: TodoomApp
  task: Task
  today: string
  onClose: () => void
}) {
  const [field, setField] = useState<Field>(null)
  // The two text fields are edited locally and written back on blur, so a task
  // is not reparsed on every keystroke.
  const [title, setTitleDraft] = useState(() => taskTitle(task))
  const [note, setNoteDraft] = useState(() => task.note ?? '')

  // Escape is watched on the window: after a text field commits it blurs, so the
  // dialog itself is not always what holds focus.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (field) setField(null)
      else onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [field, onClose])

  const index = app.indexOf(task)
  const change = (fn: (task: Task) => Task) => app.updateTask(index, fn)
  const toggle = (next: Field) => setField((current) => (current === next ? null : next))
  const { dueLabel } = describeTask(task, today)
  const rec = task.pairs['rec']
  const labels = [...task.projects.map((p) => `+${p}`), ...task.contexts.map((c) => `@${c}`)]
  const available = [
    ...collectProjects(app.state.tasks).map((p) => `+${p}`),
    ...collectContexts(app.state.tasks).map((c) => `@${c}`),
  ]
  const blocker = blockerOf(task, app.state.tasks)
  const candidates = app.state.tasks.filter(
    (other) => !other.completed && !wouldCycle(task, other, app.state.tasks),
  )

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="task-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Task"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="task-modal__bar">
          <button className="task-modal__close" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="task-modal__body">
          <div className="task-modal__main">
            <input
              className={`task__check task__check--${task.priority?.toLowerCase() ?? 'none'}`}
              type="checkbox"
              checked={task.completed}
              onChange={() => app.toggleComplete(index)}
            />
            <div className="task-modal__text">
              <input
                className="task-modal__title"
                autoFocus
                value={title}
                onChange={(event) => setTitleDraft(event.target.value)}
                onBlur={() => change((current) => setTitle(current, title))}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') event.currentTarget.blur()
                }}
              />
              <input
                className="task-modal__note"
                placeholder="Description"
                value={note}
                onChange={(event) => setNoteDraft(event.target.value)}
                onBlur={() => change((current) => setNote(current, note))}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') event.currentTarget.blur()
                }}
              />

              <section className="task-modal__files">
                <h3 className="field__label">Attachments</h3>
                <AttachmentList app={app} index={index} ids={task.attachments} />
              </section>
            </div>
          </div>

          <aside className="task-modal__side">
            <section className="field field--date">
              <h3 className="field__label">Date</h3>
              <button className="field__value" onClick={() => toggle('date')}>
                <CalendarIcon />
                {dueLabel || 'No date'}
                {rec && <RepeatIcon />}
              </button>
              {field === 'date' && (
                <DatePopover
                  today={today}
                  due={task.pairs['due'] ?? null}
                  rec={rec ?? null}
                  onDue={(due) => change((current) => setDue(current, due))}
                  onRec={(next) => change((current) => setRec(current, next))}
                />
              )}
            </section>

            <section className="field field--priority">
              <h3 className="field__label">Priority</h3>
              <button className="field__value" onClick={() => toggle('priority')}>
                {task.priority ? `(${task.priority})` : 'None'}
              </button>
              {field === 'priority' && (
                <div className="popover popover--priority">
                  {PRIORITIES.map((priority) => (
                    <button
                      key={priority}
                      className={task.priority === priority ? 'priority priority--active' : 'priority'}
                      onClick={() =>
                        change((current) =>
                          setPriority(current, current.priority === priority ? null : priority),
                        )
                      }
                    >
                      ({priority})
                    </button>
                  ))}
                </div>
              )}
            </section>

            <section className="field field--labels">
              <div className="field__head">
                <h3 className="field__label">Labels</h3>
                <button
                  className="field__value field__add"
                  aria-label="Add label"
                  onClick={() => toggle('labels')}
                >
                  +
                </button>
              </div>
              <div className="field__labels">
                {labels.map((label) => (
                  <span className={`tag tag--${label.startsWith('+') ? 'project' : 'context'}`} key={label}>
                    <TagIcon />
                    {label}
                    <button
                      className="tag__remove"
                      aria-label={`Remove ${label}`}
                      onClick={() => change((current) => toggleLabel(current, label))}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              {field === 'labels' && (
                <LabelsPopover
                  available={available}
                  selected={labels}
                  onToggle={(label) => change((current) => toggleLabel(current, label))}
                />
              )}
            </section>

            <section className="field field--deps">
              <h3 className="field__label">Depends on</h3>
              <button className="field__value" onClick={() => toggle('deps')}>
                {blocker ? taskTitle(blocker) : 'None'}
              </button>
              {blocker && (
                <button
                  className="field__clear"
                  aria-label="Clear dependency"
                  onClick={() => app.setDependency(index, null)}
                >
                  ×
                </button>
              )}
              {field === 'deps' && (
                <DependencyPopover
                  candidates={candidates}
                  onPick={(target) => {
                    app.setDependency(index, app.indexOf(target))
                    setField(null)
                  }}
                />
              )}
            </section>
          </aside>
        </div>
      </div>
    </div>
  )
})
