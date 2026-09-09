import type { Filter } from '../core/query'
import { filterToQuery } from './urlState'

function arraysEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index])
}

function filtersEqual(a: Filter, b: Filter): boolean {
  return (
    arraysEqual(a.projects, b.projects) &&
    arraysEqual(a.contexts, b.contexts) &&
    arraysEqual(a.priorities, b.priorities) &&
    a.search === b.search &&
    a.showCompleted === b.showCompleted &&
    a.dueView === b.dueView
  )
}

// A change is "search-only" when every field but `search` is untouched. Those
// changes come from typing in the search box, which should replace the
// current history entry rather than push a new one per keystroke.
function isSearchOnlyChange(previous: Filter, next: Filter): boolean {
  return (
    previous.search !== next.search &&
    arraysEqual(previous.projects, next.projects) &&
    arraysEqual(previous.contexts, next.contexts) &&
    arraysEqual(previous.priorities, next.priorities) &&
    previous.showCompleted === next.showCompleted &&
    previous.dueView === next.dueView
  )
}

/**
 * Keeps the URL query string in sync with the current filter using the
 * browser history API, so back/forward can restore a filter without a
 * reload.
 *
 * - A navigable filter change (a view, a project/context/priority chip, the
 *   show-completed toggle) pushes a new history entry.
 * - A search-box change replaces the current entry, so one search doesn't
 *   deposit one entry per keystroke.
 * - Nothing is pushed when the filter didn't actually change (e.g. a task
 *   mutation notified the same listener) or when the computed URL is
 *   already the current one — this also keeps the initial render from
 *   pushing a duplicate entry.
 */
export function syncFilterHistory(previousFilter: Filter, nextFilter: Filter): void {
  const query = filterToQuery(nextFilter)
  const url = query ? `${window.location.pathname}?${query}` : window.location.pathname
  const currentUrl = window.location.pathname + window.location.search

  const shouldPush =
    url !== currentUrl &&
    !filtersEqual(previousFilter, nextFilter) &&
    !isSearchOnlyChange(previousFilter, nextFilter)

  if (shouldPush) {
    window.history.pushState(null, '', url)
  } else {
    window.history.replaceState(null, '', url)
  }
}
