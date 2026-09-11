import { useState } from 'react'
import type { TodoomApp } from '../app/state'

/** A button that turns into a name box; saving keeps the query in the search. */
export function SaveFilter({ app, query }: { app: TodoomApp; query: string }) {
  const [name, setName] = useState<string | null>(null)

  if (name === null) {
    return (
      <button className="save-filter" onClick={() => setName('')}>
        Save as filter
      </button>
    )
  }

  const trimmed = name.trim()
  const invalid = trimmed.length === 0 || name.includes(': ')

  const save = () => {
    if (invalid) return
    void app.saveFilter(trimmed, query.trim())
    setName(null)
  }

  return (
    <form
      className="save-filter__form"
      onSubmit={(event) => {
        event.preventDefault()
        save()
      }}
    >
      <input
        className="save-filter__name"
        autoFocus
        placeholder="Filter name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setName(null)
        }}
      />
      <button type="submit" disabled={invalid}>
        Save
      </button>
      <button type="button" onClick={() => setName(null)}>
        Cancel
      </button>
    </form>
  )
}
