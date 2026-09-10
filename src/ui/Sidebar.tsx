import { observer } from 'mobx-react-lite'
import type { DueView } from '../core/query'
import type { TodoomApp } from '../app/state'
import { collectProjects, collectContexts, collectPriorities } from '../core/query'

const STATUS_TEXT: Record<string, string> = {
  idle: '',
  dirty: 'Unsaved changes',
  saving: 'Saving…',
  saved: 'Saved',
  error: '',
}

const VIEWS: Array<[DueView, string]> = [
  ['all', 'All'],
  ['overdue', 'Overdue'],
  ['today', 'Today'],
  ['upcoming', 'Upcoming'],
]

function toggleIn(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
}

// A chip whose last task is gone must keep rendering while it is selected, or
// the filter it holds becomes impossible to clear from the UI.
function withSelected(collected: string[], selected: string[]): string[] {
  return [...new Set([...collected, ...selected])].sort()
}

function Chips({
  heading,
  values,
  label,
  selected,
  onToggle,
}: {
  heading: string
  values: string[]
  label: (value: string) => string
  selected: string[]
  onToggle: (value: string) => void
}) {
  if (values.length === 0) return null
  return (
    <section className="filters">
      <h2 className="filters__heading">{heading}</h2>
      {values.map((value) => (
        <button
          key={value}
          className={selected.includes(value) ? 'chip chip--active' : 'chip'}
          onClick={() => onToggle(value)}
        >
          {label(value)}
        </button>
      ))}
    </section>
  )
}

export const Sidebar = observer(function Sidebar({ app }: { app: TodoomApp }) {
  const { tasks, filter, saveState, error } = app.state
  const failed = saveState === 'error'

  return (
    <aside className="sidebar">
      <div className="topbar">
        <h1>Todoom</h1>
        <span className={failed ? 'status status--error' : 'status'}>
          {failed ? (error ?? 'Save failed') : STATUS_TEXT[saveState]}
        </span>
        {failed && (
          <button className="status__retry" onClick={() => void app.save()}>
            Retry
          </button>
        )}
      </div>

      <input
        className="search"
        placeholder="Search"
        value={filter.search}
        onChange={(event) => app.setFilter({ search: event.target.value })}
      />

      <nav className="views">
        {VIEWS.map(([view, label]) => (
          <button
            key={view}
            className={filter.dueView === view ? 'view-btn view-btn--active' : 'view-btn'}
            onClick={() => app.setFilter({ dueView: view })}
          >
            {label}
          </button>
        ))}
      </nav>

      {/* Completed is an independent toggle, not one of the exclusive views
          above, so it lives in its own group where it cannot look like a
          sibling of "All". */}
      <div className="toggles">
        <button
          className={filter.showCompleted ? 'toggle-btn toggle-btn--active' : 'toggle-btn'}
          onClick={() => app.setFilter({ showCompleted: !filter.showCompleted })}
        >
          Show completed
        </button>
      </div>

      <Chips
        heading="Priority"
        values={withSelected(collectPriorities(tasks), filter.priorities)}
        label={(value) => `(${value})`}
        selected={filter.priorities}
        onToggle={(value) => app.setFilter({ priorities: toggleIn(filter.priorities, value) })}
      />
      <Chips
        heading="Projects"
        values={withSelected(collectProjects(tasks), filter.projects)}
        label={(value) => `+${value}`}
        selected={filter.projects}
        onToggle={(value) => app.setFilter({ projects: toggleIn(filter.projects, value) })}
      />
      <Chips
        heading="Contexts"
        values={withSelected(collectContexts(tasks), filter.contexts)}
        label={(value) => `@${value}`}
        selected={filter.contexts}
        onToggle={(value) => app.setFilter({ contexts: toggleIn(filter.contexts, value) })}
      />

      <button className="archive-btn" onClick={() => void app.archive()}>
        Archive completed
      </button>
    </aside>
  )
})
