import type { DueView, Filter } from '../core/query'
import { emptyFilter } from '../core/query'

const DUE_VIEWS: DueView[] = ['all', 'overdue', 'today', 'upcoming']

export function filterToQuery(filter: Filter): string {
  const params = new URLSearchParams()
  if (filter.projects.length > 0) params.set('project', filter.projects.join(','))
  if (filter.contexts.length > 0) params.set('context', filter.contexts.join(','))
  if (filter.priorities.length > 0) params.set('pri', filter.priorities.join(','))
  if (filter.search.length > 0) params.set('q', filter.search)
  if (filter.showCompleted) params.set('done', '1')
  if (filter.dueView !== 'all') params.set('due', filter.dueView)
  return params.toString()
}

function list(params: URLSearchParams, key: string): string[] {
  const raw = params.get(key)
  if (!raw) return []
  return raw.split(',').filter((value) => value.length > 0)
}

export function filterFromQuery(query: string): Filter {
  const params = new URLSearchParams(query.startsWith('?') ? query.slice(1) : query)
  const due = params.get('due')
  return {
    ...emptyFilter(),
    projects: list(params, 'project'),
    contexts: list(params, 'context'),
    priorities: list(params, 'pri'),
    search: params.get('q') ?? '',
    showCompleted: params.get('done') === '1',
    dueView: due && DUE_VIEWS.includes(due as DueView) ? (due as DueView) : 'all',
  }
}
