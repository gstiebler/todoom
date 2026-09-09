import type { DueView, Filter } from '../core/query'
import { emptyFilter } from '../core/query'

const DUE_VIEWS: DueView[] = ['all', 'overdue', 'today', 'upcoming']

export function filterToQuery(filter: Filter): string {
  const params = new URLSearchParams()
  filter.projects.forEach((project) => params.append('project', project))
  filter.contexts.forEach((context) => params.append('context', context))
  filter.priorities.forEach((priority) => params.append('pri', priority))
  if (filter.search.length > 0) params.set('q', filter.search)
  if (filter.showCompleted) params.set('done', '1')
  if (filter.dueView !== 'all') params.set('due', filter.dueView)
  return params.toString()
}

// An empty parameter (`project=`) carries no value; dropping it keeps a
// stray or hand-edited URL from filtering on the empty string.
function values(params: URLSearchParams, name: string): string[] {
  return params.getAll(name).filter((value) => value.length > 0)
}

export function filterFromQuery(query: string): Filter {
  const params = new URLSearchParams(query.startsWith('?') ? query.slice(1) : query)
  const due = params.get('due')
  return {
    ...emptyFilter(),
    projects: values(params, 'project'),
    contexts: values(params, 'context'),
    priorities: values(params, 'pri'),
    search: params.get('q') ?? '',
    showCompleted: params.get('done') === '1',
    dueView: due && DUE_VIEWS.includes(due as DueView) ? (due as DueView) : 'all',
  }
}
