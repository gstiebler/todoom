# Localization

The interface in English and Brazilian Portuguese. The browser's language
picks the locale; a toggle in the sidebar overrides it and is remembered.
Dates and weekday names come from `Intl`.

## Behaviour

- Locale resolution, once at start: `localStorage['todoom.locale']` if it is
  a supported locale, else `navigator.language` starting with `pt` → `pt-BR`,
  else `en`.
- A `pt`/`en` button next to the theme button switches immediately and
  stores the choice. `<html lang>` follows.
- Every user-visible string in `src/ui` goes through `t()`. The todo.txt
  format, query grammar, `filters.txt`, URLs and the NL prompt stay in
  English: they are data, not interface.
- Dates: `shortDate` uses `Intl.DateTimeFormat(locale, { day: 'numeric',
  month: 'short' })`, adding `year: 'numeric'` when the year differs from
  today's. Weekday names within the coming week use `{ weekday: 'long' }`.
  The month and weekday names in `quickDates.ts` and the date popover come
  from `Intl` too; `MONTH_NAMES` / `WEEKDAY_NAMES` are removed.
- Numbers in Stats use `toLocaleString(locale)`.

## UI

`src/ui/i18n.ts`:

```ts
export type Locale = 'en' | 'pt-BR'
export const LOCALES: Locale[]
export function loadLocale(): Locale
export function saveLocale(locale: Locale): void
/** Keys are stable identifiers; the English text is the value, not the key. */
export type Key = keyof typeof STRINGS.en
export function t(locale: Locale, key: Key, params?: Record<string, string | number>): string
```

`STRINGS` is one object literal per locale; `{name}` placeholders are
replaced from `params`. Missing keys are a type error, so every locale must
list every key. Plurals are handled by separate keys (`tasks.one`,
`tasks.other`) chosen with `Intl.PluralRules`.

The locale is React context: `LocaleProvider` at the root in `App.tsx`,
`useLocale()` returning `{ locale, t, setLocale }`. Components call
`const { t } = useLocale()`. Pure helpers that format text
(`describeTask`, `quickDates`, `Stats` labels) take `locale` as a parameter.

## Testing

- `src/ui/i18n.test.ts`: `loadLocale` precedence; `t` replaces params;
  every key in `en` exists in `pt-BR` (enforced by the type, asserted at
  runtime too for the pt-BR object).
- `src/ui/describeTask.test.ts`, `quickDates.test.ts`: labels in `en` and
  `pt-BR` for the same dates.
- `src/ui/App.test.tsx`: the sidebar renders in pt-BR when
  `navigator.language` is `pt-BR`; the toggle switches and persists.

## Out of scope

Right-to-left, translating the query grammar or the NL prompt, per-user
locale stored in Drive.
