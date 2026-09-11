import { observer } from 'mobx-react-lite'
import { useEffect, useRef } from 'react'
import type { TodoomApp } from '../app/state'
import { taskTitle } from '../core/title'
import { describeTask } from './describeTask'
import { useLocale } from './locale'

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
  const { locale } = useLocale()
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

  // Escape is watched on the window: after clicking a row the input isn't
  // necessarily what holds focus, so a listener on the input alone would miss it.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      cancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

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
          }}
        />
        {queryError && <p className="query-error">{queryError}</p>}
        <ul className="search-modal__results">
          {preview.map((task) => {
            const { dueLabel } = describeTask(task, today, locale)
            return (
              <li key={app.indexOf(task)}>
                <button
                  type="button"
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
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
})
