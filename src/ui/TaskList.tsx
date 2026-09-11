import { observer } from 'mobx-react-lite'
import { useState } from 'react'
import type { Task } from '../core/types'
import type { TodoomApp } from '../app/state'
import { describeTask } from './describeTask'
import { AttachmentsPopover } from './AttachmentsPopover'
import { TaskModal } from './TaskModal'
import { taskTitle } from '../core/title'
import { blockerOf } from '../core/deps'
import { useLocale } from './locale'
import { CalendarIcon, FlagIcon, PaperclipIcon, RepeatIcon, TagIcon } from './icons'

function Tag({ label, kind }: { label: string; kind: 'project' | 'context' }) {
  return (
    <span className={`tag tag--${kind}`}>
      <TagIcon />
      {label}
    </span>
  )
}

type Half = 'before' | 'after'

/** What a row needs to take part in a drag; absent when the row cannot move. */
export interface DragProps {
  dragging: boolean
  drop: Half | null
  onStart: () => void
  onOver: (half: Half) => void
  onDrop: () => void
  onEnd: () => void
}

export const TaskRow = observer(function TaskRow({
  app,
  task,
  today,
  drag,
}: {
  app: TodoomApp
  task: Task
  today: string
  drag?: DragProps
}) {
  const { locale, t } = useLocale()
  const [open, setOpen] = useState(false)
  const [attachOpen, setAttachOpen] = useState(false)
  const index = app.indexOf(task)
  const { classes, dueLabel, deadlineLabel, deadlineClass } = describeTask(task, today, locale)
  const rec = task.pairs['rec']
  const blocker = blockerOf(task, app.state.tasks)
  if (blocker) classes.push('task--blocked')
  if (drag?.dragging) classes.push('task--dragging')
  if (drag?.drop) classes.push(`task--drop-${drag.drop}`)

  return (
    <li
      className={classes.join(' ')}
      draggable={drag !== undefined}
      onDragStart={(event) => {
        if (!drag) return
        // Firefox needs data on the transfer before it starts a drag at all.
        event.dataTransfer.setData('text/plain', String(index))
        event.dataTransfer.effectAllowed = 'move'
        drag.onStart()
      }}
      onDragOver={(event) => {
        if (!drag) return
        event.preventDefault()
        const rect = event.currentTarget.getBoundingClientRect()
        drag.onOver(event.clientY < rect.top + rect.height / 2 ? 'before' : 'after')
      }}
      onDrop={(event) => {
        if (!drag) return
        event.preventDefault()
        drag.onDrop()
      }}
      onDragEnd={drag?.onEnd}
    >
      <input
        className={`task__check task__check--${task.priority?.toLowerCase() ?? 'none'}`}
        type="checkbox"
        checked={task.completed}
        onChange={() => app.toggleComplete(index)}
      />

      <div className="task__body">
        <span className="task__text" onClick={() => setOpen(true)}>
          {taskTitle(task)}
        </span>

        {task.note && <p className="task__note">{task.note}</p>}

        {blocker && (
          <p className="task__blocked">
            {t('task.waitingOn', { title: taskTitle(blocker) })}
          </p>
        )}

        {(dueLabel ||
          deadlineLabel ||
          rec ||
          task.projects.length > 0 ||
          task.contexts.length > 0) && (
          <div className="task__meta">
            {dueLabel && (
              <span className="task__due">
                <CalendarIcon />
                {dueLabel}
                {rec && <RepeatIcon />}
              </span>
            )}
            {!dueLabel && rec && (
              <span className="task__due">
                <RepeatIcon />
                {rec}
              </span>
            )}
            {deadlineLabel && (
              <span className={`task__deadline ${deadlineClass}`.trim()}>
                <FlagIcon />
                {deadlineLabel}
              </span>
            )}
            {task.projects.map((project) => (
              <Tag key={project} label={`+${project}`} kind="project" />
            ))}
            {task.contexts.map((context) => (
              <Tag key={context} label={`@${context}`} kind="context" />
            ))}
          </div>
        )}
      </div>

      <button
        className="task__attach"
        title={t('common.attachments')}
        onClick={() => setAttachOpen((open) => !open)}
      >
        <PaperclipIcon />
        {task.attachments.length > 0 && task.attachments.length}
      </button>

      <button
        className="task__delete"
        title={t('common.delete')}
        onClick={() => app.deleteTask(index)}
      >
        ×
      </button>

      {open && <TaskModal app={app} task={task} today={today} onClose={() => setOpen(false)} />}

      {attachOpen && (
        <AttachmentsPopover
          app={app}
          index={index}
          ids={task.attachments}
          onClose={() => setAttachOpen(false)}
        />
      )}
    </li>
  )
})

export const TaskList = observer(function TaskList({
  app,
  today,
}: {
  app: TodoomApp
  today: string
}) {
  const { t } = useLocale()
  // Both are indexes into app.state.tasks, which is what moveTask speaks.
  const [dragging, setDragging] = useState<number | null>(null)
  const [target, setTarget] = useState<{ index: number; half: Half } | null>(null)
  const visible = app.visibleTasks()
  if (visible.length === 0) return <p className="empty">{t('task.empty')}</p>

  const clear = () => {
    setDragging(null)
    setTarget(null)
  }
  const dragFor = (index: number): DragProps => ({
    dragging: dragging === index,
    drop: target?.index === index ? target.half : null,
    onStart: () => setDragging(index),
    onOver: (half) => setTarget({ index, half }),
    onDrop: () => {
      if (dragging !== null && target !== null) {
        // Removing `from` first shifts everything below it up by one.
        const slot = target.half === 'before' ? target.index : target.index + 1
        app.moveTask(dragging, dragging < slot ? slot - 1 : slot)
      }
      clear()
    },
    onEnd: clear,
  })

  return (
    <ul className="task-list">
      {visible.map((task) => {
        const index = app.indexOf(task)
        const drag = app.canReorder && !task.completed ? dragFor(index) : undefined
        return <TaskRow key={index} app={app} task={task} today={today} drag={drag} />
      })}
    </ul>
  )
})
