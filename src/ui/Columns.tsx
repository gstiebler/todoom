import { observer } from 'mobx-react-lite'
import type { TodoomApp } from '../app/state'
import type { SavedFilter } from '../core/filters'
import type { Task } from '../core/types'
import { emptyFilter, filterTasks, sortTasks } from '../core/query'
import { TaskRow } from './TaskList'
import { useLocale } from './locale'

const Column = observer(function Column({
  app,
  filter,
  today,
}: {
  app: TodoomApp
  filter: SavedFilter
  today: string
}) {
  const { tasks, filter: current } = app.state
  let matching: Task[] = []
  let error: string | null = null
  // A saved query can be edited by hand in filters.txt; a bad one is shown
  // where its tasks would be instead of taking the page down.
  try {
    const query = { ...emptyFilter(), search: filter.query, showCompleted: current.showCompleted }
    matching = sortTasks(filterTasks(tasks, query, today))
  } catch (failure) {
    error = failure instanceof Error ? failure.message : String(failure)
  }
  return (
    <section className="column">
      <h2 className="column__heading">{filter.name}</h2>
      {error ? (
        <p className="query-error">{error}</p>
      ) : (
        <>
          <span className="column__count">{matching.length}</span>
          <ul className="task-list">
            {matching.map((task) => (
              <TaskRow key={app.indexOf(task)} app={app} task={task} today={today} />
            ))}
          </ul>
        </>
      )}
    </section>
  )
})

export const Columns = observer(function Columns({
  app,
  today,
}: {
  app: TodoomApp
  today: string
}) {
  const { t } = useLocale()
  const filters = app.columnFilters
  if (filters.length === 0) {
    return <p className="columns__empty">{t('columns.empty')}</p>
  }
  return (
    <div className="columns">
      {filters.map((filter) => (
        <Column key={filter.name} app={app} filter={filter} today={today} />
      ))}
    </div>
  )
})
