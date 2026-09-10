import { useRef, useState } from 'react'
import type { Task } from '../core/types'
import type { TodoomApp } from '../app/state'
import { formatTask } from '../core/format'
import { describeTask } from './describeTask'

function Description({ task, onClick }: { task: Task; onClick: () => void }) {
  const words = task.description.split(' ')
  const parts = words.flatMap((word, i) => {
    const key = `${i}-${word}`
    if (word.startsWith('+') && word.length > 1) {
      return [
        <span key={key} className="tag tag--project">
          {word}
        </span>,
        ' ',
      ]
    }
    if (word.startsWith('@') && word.length > 1) {
      return [
        <span key={key} className="tag tag--context">
          {word}
        </span>,
        ' ',
      ]
    }
    if (/^(due|rec|pri):/.test(word)) return []
    return [word, ' ']
  })
  return (
    <span className="task__text" onClick={onClick}>
      {parts.length === 0 ? task.description : parts}
    </span>
  )
}

function TaskRow({ app, task, today }: { app: TodoomApp; task: Task; today: string }) {
  const [draft, setDraft] = useState<string | null>(null)
  // Escape unmounts the editor, and an unmounted input must not commit whatever
  // it happened to be holding.
  const discarded = useRef(false)
  const index = app.indexOf(task)
  const { classes, dueLabel } = describeTask(task, today)

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
        className="task__check"
        type="checkbox"
        checked={task.completed}
        onChange={() => app.toggleComplete(index)}
      />
      {task.priority && <span className="task__pri">({task.priority})</span>}

      {draft === null ? (
        <Description task={task} onClick={() => setDraft(formatTask(task))} />
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

      {task.pairs['rec'] && <span className="task__badge">repeats {task.pairs['rec']}</span>}
      {dueLabel && <span className="task__due">{dueLabel}</span>}

      <button className="task__delete" title="Delete" onClick={() => app.deleteTask(index)}>
        ×
      </button>
    </li>
  )
}

export function TaskList({ app, today }: { app: TodoomApp; today: string }) {
  const visible = app.visibleTasks()
  if (visible.length === 0) return <p className="empty">Nothing here.</p>

  return (
    <ul className="task-list">
      {visible.map((task) => (
        <TaskRow key={app.indexOf(task)} app={app} task={task} today={today} />
      ))}
    </ul>
  )
}
