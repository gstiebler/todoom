import { observer } from 'mobx-react-lite'
import { useRef, useState } from 'react'
import type { Task } from '../core/types'
import type { TodoomApp } from '../app/state'
import { formatTask } from '../core/format'
import { describeTask } from './describeTask'
import { CalendarIcon, RepeatIcon, TagIcon } from './icons'

// The title line is the description with the machinery taken out: the tags and
// the key:value pairs all reappear below it, in the meta row.
function title(task: Task): string {
  const words = task.description
    .split(' ')
    .filter((word) => !/^[+@]\S/.test(word) && !/^(due|rec|pri):/.test(word))
  return words.join(' ').trim() || task.description
}

function Tag({ label, kind }: { label: string; kind: 'project' | 'context' }) {
  return (
    <span className={`tag tag--${kind}`}>
      <TagIcon />
      {label}
    </span>
  )
}

const TaskRow = observer(function TaskRow({
  app,
  task,
  today,
}: {
  app: TodoomApp
  task: Task
  today: string
}) {
  const [draft, setDraft] = useState<string | null>(null)
  // Escape unmounts the editor, and an unmounted input must not commit whatever
  // it happened to be holding.
  const discarded = useRef(false)
  const index = app.indexOf(task)
  const { classes, dueLabel } = describeTask(task, today)
  const rec = task.pairs['rec']

  const commit = () => {
    if (discarded.current) {
      discarded.current = false
      return
    }
    if (draft !== null) app.editTask(index, draft)
    setDraft(null)
  }

  return (
    <li className={classes.join(' ')}>
      <input
        className={`task__check task__check--${task.priority?.toLowerCase() ?? 'none'}`}
        type="checkbox"
        checked={task.completed}
        onChange={() => app.toggleComplete(index)}
      />

      <div className="task__body">
        {draft === null ? (
          <span className="task__text" onClick={() => setDraft(formatTask(task))}>
            {title(task)}
          </span>
        ) : (
          <input
            className="task__editor"
            autoFocus
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commit()
              if (event.key === 'Escape') {
                discarded.current = true
                setDraft(null)
              }
            }}
          />
        )}

        {(dueLabel || rec || task.projects.length > 0 || task.contexts.length > 0) && (
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
            {task.projects.map((project) => (
              <Tag key={project} label={`+${project}`} kind="project" />
            ))}
            {task.contexts.map((context) => (
              <Tag key={context} label={`@${context}`} kind="context" />
            ))}
          </div>
        )}
      </div>

      <button className="task__delete" title="Delete" onClick={() => app.deleteTask(index)}>
        ×
      </button>
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
