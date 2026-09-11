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

export const TaskRow = observer(function TaskRow({
  app,
  task,
  today,
}: {
  app: TodoomApp
  task: Task
  today: string
}) {
  const { locale } = useLocale()
  const [open, setOpen] = useState(false)
  const [attachOpen, setAttachOpen] = useState(false)
  const index = app.indexOf(task)
  const { classes, dueLabel, deadlineLabel, deadlineClass } = describeTask(task, today, locale)
  const rec = task.pairs['rec']
  const blocker = blockerOf(task, app.state.tasks)
  if (blocker) classes.push('task--blocked')

  return (
    <li className={classes.join(' ')}>
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

        {blocker && <p className="task__blocked">Waiting on {taskTitle(blocker)}</p>}

        {(dueLabel || deadlineLabel || rec || task.projects.length > 0 || task.contexts.length > 0) && (
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
        title="Attachments"
        onClick={() => setAttachOpen((open) => !open)}
      >
        <PaperclipIcon />
        {task.attachments.length > 0 && task.attachments.length}
      </button>

      <button className="task__delete" title="Delete" onClick={() => app.deleteTask(index)}>
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
  const visible = app.visibleTasks()
  if (visible.length === 0) return <p className="empty">Nothing here.</p>

  return (
    <ul className="task-list">
      {visible.map((task) => (
        <TaskRow key={app.indexOf(task)} app={app} task={task} today={today} />
      ))}
    </ul>
  )
})
