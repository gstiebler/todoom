import { observer } from 'mobx-react-lite'
import { useEffect, useState } from 'react'
import type { DueView } from '../core/query'
import type { TodoomApp, SaveState } from '../app/state'
import type { Key } from './i18n'
import { applyTheme, loadTheme } from './theme'
import { collectPriorities, countByProject, countByContext, emptyFilter } from '../core/query'
import { SaveFilter } from './SaveFilter'
import { AskFilter } from './AskFilter'
import { LabelSection } from './LabelSection'
import { useLocale } from './locale'
import { saveSort } from '../app/sortPref'

const STATUS_TEXT: Record<SaveState, Key | ''> = {
  idle: '',
  dirty: 'sidebar.unsavedChanges',
  saving: 'sidebar.saving',
  saved: 'sidebar.saved',
  error: '',
}

const VIEWS: Array<[DueView, Key]> = [
  ['all', 'view.all'],
  ['overdue', 'view.overdue'],
  ['today', 'view.today'],
  ['upcoming', 'view.upcoming'],
]

function toggleIn(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
}

// A chip whose last task is gone must keep rendering while it is selected, or
// the filter it holds becomes impossible to clear from the UI.
function withSelected(collected: string[], selected: string[]): string[] {
  return [...new Set([...collected, ...selected])].sort()
}

// Same rule as withSelected, for the counted rows: a selected label no task
// carries still gets a row (count 0) so it can be unselected.
function withCounts(counts: Map<string, number>, selected: string[]): Map<string, number> {
  const all = new Map(counts)
  for (const value of selected) if (!all.has(value)) all.set(value, 0)
  return new Map([...all].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
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

export const Sidebar = observer(function Sidebar({
  app,
  onSearch,
}: {
  app: TodoomApp
  onSearch: () => void
}) {
  const { tasks, filter, saveState, error, page } = app.state
  const filters = app.state.filters
  const queryError = app.queryError
  const failed = saveState === 'error'
  const [theme, setTheme] = useState(loadTheme)
  useEffect(() => applyTheme(theme), [theme])
  const { locale, t, setLocale } = useLocale()
  const statusKey = STATUS_TEXT[saveState]

  return (
    <aside className="sidebar">
      <div className="topbar">
        <h1>Todoom</h1>
        <span className={failed ? 'status status--error' : 'status'}>
          {failed ? (error ?? t('sidebar.saveFailed')) : statusKey ? t(statusKey) : ''}
        </span>
        {failed && (
          <button className="status__retry" onClick={() => void app.save()}>
            {t('common.retry')}
          </button>
        )}
        <button
          className="theme-btn"
          onClick={() => setTheme(theme === 'terminal' ? 'auto' : 'terminal')}
        >
          {theme === 'terminal' ? 'auto' : 'terminal'}
        </button>
        <button
          className="locale-btn"
          title={t('sidebar.switchLocale')}
          onClick={() => setLocale(locale === 'en' ? 'pt-BR' : 'en')}
        >
          {locale === 'en' ? 'pt' : 'en'}
        </button>
      </div>

      <div className="search-row">
        <input
          className="search"
          placeholder={t('common.searchPlaceholder')}
          value={filter.search}
          onChange={(event) => app.setFilter({ search: event.target.value })}
        />
        <button className="search-btn" aria-label={t('common.search')} onClick={onSearch}>
          🔍
        </button>
      </div>
      <AskFilter app={app} />
      {queryError && <p className="query-error">{queryError}</p>}
      {!queryError && filter.search.trim().length > 0 && (
        <SaveFilter app={app} query={filter.search} />
      )}

      <nav className="views">
        {VIEWS.map(([view, label]) => (
          <button
            key={view}
            className={
              page === 'tasks' && filter.dueView === view ? 'view-btn view-btn--active' : 'view-btn'
            }
            onClick={() => {
              app.showPage('tasks')
              app.setFilter({ dueView: view })
            }}
          >
            {t(label)}
          </button>
        ))}
        <button
          className={page === 'stats' ? 'view-btn view-btn--active' : 'view-btn'}
          onClick={() => app.showPage('stats')}
        >
          {t('sidebar.stats')}
        </button>
        <button
          className={page === 'columns' ? 'view-btn view-btn--active' : 'view-btn'}
          onClick={() => app.showPage('columns')}
        >
          {t('sidebar.columns')}
        </button>
        <button
          className={page === 'gantt' ? 'view-btn view-btn--active' : 'view-btn'}
          onClick={() => app.showPage('gantt')}
        >
          {t('sidebar.gantt')}
        </button>
      </nav>

      {filters && filters.length > 0 && (
        <nav className="saved">
          <h2 className="filters__heading">{t('sidebar.filtersHeading')}</h2>
          {filters.map((saved) => (
            <div className="saved__row" key={saved.name}>
              <button
                className={
                  page === 'tasks' && filter.search.trim() === saved.query
                    ? 'view-btn view-btn--active'
                    : 'view-btn'
                }
                onClick={() => {
                  app.showPage('tasks')
                  app.setFilter({ ...emptyFilter(), search: saved.query })
                }}
              >
                {saved.name}
              </button>
              <input
                className="saved__column"
                type="checkbox"
                aria-label={t('sidebar.showAsColumn', { name: saved.name })}
                checked={saved.column}
                onChange={(event) => void app.setColumn(saved.name, event.target.checked)}
              />
              <button
                className="saved__delete"
                aria-label={t('sidebar.deleteFilter', { name: saved.name })}
                onClick={() => void app.deleteFilter(saved.name)}
              >
                ×
              </button>
            </div>
          ))}
        </nav>
      )}

      {/* Completed is an independent toggle, not one of the exclusive views
          above, so it lives in its own group where it cannot look like a
          sibling of "All". */}
      <div className="toggles">
        <button
          className={filter.showCompleted ? 'toggle-btn toggle-btn--active' : 'toggle-btn'}
          onClick={() => app.setFilter({ showCompleted: !filter.showCompleted })}
        >
          {t('sidebar.showCompleted')}
        </button>
        <button
          className={
            filter.sort === 'manual'
              ? 'toggle-btn sort-btn toggle-btn--active'
              : 'toggle-btn sort-btn'
          }
          onClick={() => {
            const sort = filter.sort === 'manual' ? 'smart' : 'manual'
            saveSort(sort)
            app.setFilter({ sort })
          }}
        >
          {t(filter.sort === 'manual' ? 'sidebar.sortManual' : 'sidebar.sortSmart')}
        </button>
        {filter.sort === 'manual' && !app.canReorder && (
          <p className="toggles__note">{t('sidebar.reorderHint')}</p>
        )}
      </div>

      <Chips
        heading={t('common.priority')}
        values={withSelected(collectPriorities(tasks), filter.priorities)}
        label={(value) => `(${value})`}
        selected={filter.priorities}
        onToggle={(value) => app.setFilter({ priorities: toggleIn(filter.priorities, value) })}
      />
      <LabelSection
        heading={t('sidebar.projectsHeading')}
        storageKey="todoom.labels.projects"
        prefix="+"
        counts={withCounts(countByProject(tasks), filter.projects)}
        selected={filter.projects}
        onToggle={(value) => app.setFilter({ projects: toggleIn(filter.projects, value) })}
      />
      <LabelSection
        heading={t('sidebar.contextsHeading')}
        storageKey="todoom.labels.contexts"
        prefix="@"
        counts={withCounts(countByContext(tasks), filter.contexts)}
        selected={filter.contexts}
        onToggle={(value) => app.setFilter({ contexts: toggleIn(filter.contexts, value) })}
      />

      <button className="archive-btn" onClick={() => void app.archive()}>
        {t('sidebar.archiveCompleted')}
      </button>
    </aside>
  )
})
