import { observer } from 'mobx-react-lite'
import { useEffect, useRef } from 'react'
import type { TodoomApp } from '../app/state'
import { taskTitle } from '../core/title'
import { describeTask } from './describeTask'

const PREVIEW_ROWS = 8

export const SearchModal = observer(function SearchModal({
  app,
  today,
  onClose,
  onPick,
}: {
  app: TodoomApp
  today: string
  onClose: () => void
  onPick: (index: number) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  // The query the modal opened with, so Escape can put it back.
  const initial = useRef(app.state.filter.search)
  const queryError = app.queryError
  const preview = app.visibleTasks().slice(0, PREVIEW_ROWS)

  useEffect(() => {
    input.current?.select()
  }, [])

  const cancel = () => {
    app.setFilter({ search: initial.current })
    onClose()
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal search-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        onClick={(event) => event.stopPropagation()}
      >
        <input
          ref={input}
          className="search-modal__input"
          placeholder="Search or filter…"
          autoFocus
          value={app.state.filter.search}
          onChange={(event) => app.setFilter({ search: event.target.value })}
          onKeyDown={(event) => {
            if (event.key === 'Enter') onClose()
            if (event.key === 'Escape') cancel()
          }}
        />
        {queryError && <p className="query-error">{queryError}</p>}
        <ul className="search-modal__results">
          {preview.map((task) => {
            const { dueLabel } = describeTask(task, today)
            return (
              <li
                key={app.indexOf(task)}
                className="search-modal__row"
                onClick={() => onPick(app.indexOf(task))}
              >
                <span className="search-modal__title">{taskTitle(task)}</span>
                {dueLabel && <span className="search-modal__due">{dueLabel}</span>}
                {task.projects.map((project) => (
                  <span key={project} className="search-modal__project">
                    +{project}
                  </span>
                ))}
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
})
