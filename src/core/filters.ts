export interface SavedFilter {
  name: string
  query: string
  /** Shown as a column on the Columns page; a leading "* " in the file. */
  column: boolean
}

const MARKER = '* '

/** One `Name: query` per line, `* ` in front for a column; anything else is dropped. */
export function parseFilters(text: string): SavedFilter[] {
  return text.split('\n').flatMap((raw) => {
    let line = raw.trim()
    const column = line.startsWith(MARKER)
    if (column) line = line.slice(MARKER.length).trim()
    const at = line.indexOf(': ')
    if (at < 1) return []
    return [{ name: line.slice(0, at).trim(), query: line.slice(at + 2).trim(), column }]
  })
}

export function formatFilters(filters: SavedFilter[]): string {
  return filters
    .map((filter) => `${filter.column ? MARKER : ''}${filter.name}: ${filter.query}\n`)
    .join('')
}
