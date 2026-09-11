import { useState } from 'react'
import type { TodoomApp } from '../app/state'
import { useLocale } from './locale'

/** A button that turns into a name box; saving keeps the query in the search. */
export function SaveFilter({ app, query }: { app: TodoomApp; query: string }) {
  const { t } = useLocale()
  const [name, setName] = useState<string | null>(null)

  if (name === null) {
    return (
      <button className="save-filter" onClick={() => setName('')}>
        {t('saveFilter.cta')}
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
        placeholder={t('saveFilter.namePlaceholder')}
        value={name}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setName(null)
        }}
      />
      <button type="submit" disabled={invalid}>
        {t('common.save')}
      </button>
      <button type="button" onClick={() => setName(null)}>
        {t('common.cancel')}
      </button>
    </form>
  )
}
