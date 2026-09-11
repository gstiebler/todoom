import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { type Key, type Locale, loadLocale, saveLocale, t as translate } from './i18n'

interface LocaleValue {
  locale: Locale
  t: (key: Key, params?: Record<string, string | number>) => string
  setLocale: (locale: Locale) => void
}

const LocaleContext = createContext<LocaleValue | null>(null)

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState(loadLocale)
  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  const value: LocaleValue = {
    locale,
    t: (key, params) => translate(locale, key, params),
    // Only a deliberate choice is remembered; the browser's language is not.
    setLocale: (next) => {
      saveLocale(next)
      setLocale(next)
    },
  }
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
}

export function useLocale(): LocaleValue {
  const value = useContext(LocaleContext)
  if (!value) throw new Error('useLocale needs a LocaleProvider above it')
  return value
}
