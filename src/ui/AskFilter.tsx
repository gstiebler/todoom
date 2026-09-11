import { observer } from 'mobx-react-lite'
import { useState } from 'react'
import type { TodoomApp } from '../app/state'
import { useLocale } from './locale'

/** A ✦ button that turns into a description box; the model's query lands in the search. */
export const AskFilter = observer(function AskFilter({ app }: { app: TodoomApp }) {
  const { t } = useLocale()
  const [text, setText] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { model, modelProgress } = app.state

  if (model === 'unknown' || model === 'unavailable') return null

  if (text === null) {
    return (
      <button
        className="ask-filter"
        aria-label={t('askFilter.aria')}
        onClick={() => setText('')}
      >
        ✦
      </button>
    )
  }

  const close = () => {
    setText(null)
    setError(null)
  }

  // A form has no caller to bubble to: a rejection becomes text on screen here.
  const ask = async () => {
    const description = text.trim()
    if (description.length === 0 || pending) return
    setPending(true)
    setError(null)
    try {
      await app.translate(description)
      close()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setPending(false)
    }
  }

  const status =
    modelProgress !== null
      ? t('askFilter.downloading', { percent: Math.round(modelProgress * 100) })
      : t('askFilter.thinking')

  return (
    <form
      className="ask-filter__form"
      onSubmit={(event) => {
        event.preventDefault()
        void ask()
      }}
    >
      <input
        className="ask-filter__text"
        autoFocus
        disabled={pending}
        placeholder={t('askFilter.placeholder')}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') close()
        }}
      />
      {pending && <p className="ask-filter__status">{status}</p>}
      {error && <p className="query-error">{error}</p>}
    </form>
  )
})
