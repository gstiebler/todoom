import { useState } from 'react'
import type { Task } from '../core/types'
import { taskTitle } from '../core/title'
import { useLocale } from './locale'

/** Picks the task this one waits on, from the open tasks that would not form a loop. */
export function DependencyPopover({
  candidates,
  onPick,
}: {
  candidates: Task[]
  onPick: (task: Task) => void
}) {
  const { t } = useLocale()
  const [query, setQuery] = useState('')
  const matches = candidates.filter((task) =>
    taskTitle(task).toLowerCase().includes(query.toLowerCase()),
  )

  return (
    <div className="popover popover--deps">
      <input
        className="popover__search"
        placeholder={t('deps.searchPlaceholder')}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.preventDefault()
        }}
      />
      {matches.length === 0 ? (
        <p className="popover__empty">{t('deps.empty')}</p>
      ) : (
        <ul className="label-list">
          {matches.map((task) => (
            <li key={task.raw + taskTitle(task)}>
              <button className="dep-option" onClick={() => onPick(task)}>
                {taskTitle(task)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
