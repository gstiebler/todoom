export interface SavedFilter {
  name: string
  query: string
}

/** One `Name: query` per line; anything else is left alone and dropped. */
export function parseFilters(text: string): SavedFilter[] {
  return text.split('\n').flatMap((raw) => {
    const line = raw.trim()
    const at = line.indexOf(': ')
    if (at < 1) return []
    return [{ name: line.slice(0, at).trim(), query: line.slice(at + 2).trim() }]
  })
}

export function formatFilters(filters: SavedFilter[]): string {
  return filters.map((filter) => `${filter.name}: ${filter.query}\n`).join('')
}
