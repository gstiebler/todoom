import type { SortMode } from '../core/query'

const KEY = 'todoom.sort'

/** The sort the URL falls back to; manual is the only value worth remembering. */
export function loadSort(): SortMode {
  return localStorage.getItem(KEY) === 'manual' ? 'manual' : 'smart'
}

export function saveSort(sort: SortMode): void {
  localStorage.setItem(KEY, sort)
}
