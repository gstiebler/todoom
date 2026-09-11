# Localization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The interface in English and Brazilian Portuguese, picked from the browser language, overridable from the sidebar, with dates and numbers from `Intl`.

**Architecture:** `src/ui/i18n.ts` holds the locale resolution, one string table per locale and a pure `t(locale, key, params)`. `src/ui/formatDate.ts` wraps `Intl.DateTimeFormat` for the handful of date shapes the UI uses. `src/ui/locale.tsx` puts the locale in React context; components call `useLocale()`. Pure helpers (`describeTask`, `quickDates`, `monthGrid`) take `locale` as a parameter. The month/weekday name arrays disappear.

**Tech Stack:** React 19 context, TypeScript strict (`as const` string table, `Record<Key, string>` for the second locale), `Intl.DateTimeFormat` / `Intl.PluralRules`, Vitest jsdom (Node ships full ICU, so `pt-BR` formats in tests).

**Spec:** `docs/superpowers/specs/2026-09-10-localization-design.md`

## Global Constraints

- Single quotes, no semicolons, ~100 columns, comments only where the code doesn't say why. No new try/catch.
- Every user-visible string in `src/ui` goes through `t()`. The todo.txt format, query grammar, `filters.txt`, URLs and the NL prompt stay English. Pure symbols (`×`, `▸`, `▾`, `🔍`, `+`, `·`, `(A)`) are not translated.
- Locale storage key: `todoom.locale`. Supported locales: `'en' | 'pt-BR'`.
- `<html lang>` follows the locale.
- Existing English assertions in tests keep passing: jsdom's `navigator.language` is `en-US`, so the default locale in tests is `en`.
- Commits end with a blank line then `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`. Never push.
- Gate after each task: `npx tsc --noEmit && npx vitest run`. The final task also runs `npx playwright test && npm run build`.

Rulings taken from the spec's gaps (binding):

- The month and weekday keys are not in the string table: every month/weekday name comes from `Intl` via `src/ui/formatDate.ts`. `shortDate` therefore reads `May 8` in `en` (Intl's order), not `8 May`.
- The sign-in screen's messages live in `src/main.tsx`, before React context exists; they use `t(loadLocale(), …)` directly.
- The sidebar locale button shows the locale it switches *to* (`pt` while in English, `en` while in Portuguese), mirroring the theme button.
- Only an explicit toggle stores the locale; the auto-detected one is not written to `localStorage`.
- The theme button's `auto` / `terminal` captions are mode names and stay as they are.
- The locale context value is rebuilt each render (no `useMemo`): every consumer is a MobX `observer` that re-renders anyway.

---

### Task 1: String table, locale resolution and Intl date helpers

**Files:**
- Create: `src/ui/i18n.ts`
- Create: `src/ui/formatDate.ts`
- Test: `src/ui/i18n.test.ts`, `src/ui/formatDate.test.ts`

**Interfaces:**
- Consumes: `addInterval(iso, n, 'd')` from `src/core/dates.ts`.
- Produces:
  - `export type Locale = 'en' | 'pt-BR'`, `export const LOCALES: Locale[]`
  - `export function loadLocale(): Locale`, `export function saveLocale(locale: Locale): void`
  - `export type Key = keyof typeof en`, `export const STRINGS: Record<Locale, Record<Key, string>>`
  - `export function t(locale: Locale, key: Key, params?: Record<string, string | number>): string`
  - `export function pluralOf(locale: Locale, count: number): 'one' | 'other'`
  - `formatDate.ts`: `shortDate(locale, iso, today)`, `weekdayName(locale, iso)`, `weekdayShort(locale, iso)`, `monthShort(locale, iso)`, `monthYear(locale, iso, month: 'short' | 'long')`, `weekdayInitials(locale): string[]`

- [ ] **Step 1: Write the failing tests**

`src/ui/i18n.test.ts`:

```ts
import { describe, it, expect, afterEach, vi } from 'vitest'
import { loadLocale, pluralOf, saveLocale, STRINGS, t } from './i18n'

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('loadLocale', () => {
  it('prefers a stored choice', () => {
    saveLocale('pt-BR')
    expect(loadLocale()).toBe('pt-BR')
  })

  it('ignores a stored value it does not know', () => {
    localStorage.setItem('todoom.locale', 'fr')
    expect(loadLocale()).toBe('en')
  })

  it('falls back to the browser language', () => {
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('pt-PT')
    expect(loadLocale()).toBe('pt-BR')
  })

  it('defaults to English', () => {
    expect(loadLocale()).toBe('en')
  })
})

describe('t', () => {
  it('returns the string for the locale', () => {
    expect(t('en', 'sidebar.saved')).toBe('Saved')
    expect(t('pt-BR', 'sidebar.saved')).toBe('Salvo')
  })

  it('replaces params', () => {
    expect(t('en', 'task.waitingOn', { title: 'Call plumber' })).toBe('Waiting on Call plumber')
  })

  it('leaves a placeholder alone when the param is missing', () => {
    expect(t('en', 'task.waitingOn')).toBe('Waiting on {title}')
  })

  it('has every English key in Portuguese', () => {
    expect(Object.keys(STRINGS['pt-BR']).sort()).toEqual(Object.keys(STRINGS.en).sort())
  })
})

describe('pluralOf', () => {
  it('picks one or other', () => {
    expect(pluralOf('en', 1)).toBe('one')
    expect(pluralOf('en', 2)).toBe('other')
    expect(pluralOf('pt-BR', 0)).toBe('one')
  })
})
```

(`pt-BR` treats 0 as `one` in CLDR; the test pins that so nobody "fixes" it.)

`src/ui/formatDate.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  monthShort,
  monthYear,
  shortDate,
  weekdayInitials,
  weekdayName,
  weekdayShort,
} from './formatDate'

const TODAY = '2026-09-10'

describe('shortDate', () => {
  it('omits the year inside the current year', () => {
    expect(shortDate('en', '2026-05-08', TODAY)).toBe('May 8')
    expect(shortDate('pt-BR', '2026-05-08', TODAY)).toBe('8 de mai.')
  })

  it('adds the year once it differs', () => {
    expect(shortDate('en', '2025-08-26', TODAY)).toBe('Aug 26, 2025')
    expect(shortDate('pt-BR', '2025-08-26', TODAY)).toBe('26 de ago. de 2025')
  })
})

describe('weekday and month names', () => {
  it('names a weekday', () => {
    expect(weekdayName('en', '2026-09-14')).toBe('Monday')
    expect(weekdayName('pt-BR', '2026-09-14')).toBe('segunda-feira')
    expect(weekdayShort('en', '2026-09-14')).toBe('Mon')
    expect(weekdayShort('pt-BR', '2026-09-14')).toBe('seg.')
  })

  it('names a month', () => {
    expect(monthShort('en', '2026-05-01')).toBe('May')
    expect(monthShort('pt-BR', '2026-05-01')).toBe('mai.')
    expect(monthYear('en', '2026-05-01', 'long')).toBe('May 2026')
    expect(monthYear('pt-BR', '2026-05-01', 'long')).toBe('maio de 2026')
    expect(monthYear('pt-BR', '2026-05-01', 'short')).toBe('mai. de 2026')
  })

  it('lists Monday-first weekday initials', () => {
    expect(weekdayInitials('en').join('')).toBe('MTWTFSS')
    expect(weekdayInitials('pt-BR').join('')).toBe('STQQSSD')
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/ui/i18n.test.ts src/ui/formatDate.test.ts`
Expected: both files fail to import.

- [ ] **Step 3: Write `src/ui/i18n.ts`**

```ts
export type Locale = 'en' | 'pt-BR'
export const LOCALES: Locale[] = ['en', 'pt-BR']

const KEY = 'todoom.locale'

function isLocale(value: string | null): value is Locale {
  return LOCALES.some((locale) => locale === value)
}

/** A stored choice wins; otherwise a Portuguese browser gets pt-BR and everyone else English. */
export function loadLocale(): Locale {
  const stored = localStorage.getItem(KEY)
  if (isLocale(stored)) return stored
  return navigator.language.startsWith('pt') ? 'pt-BR' : 'en'
}

export function saveLocale(locale: Locale): void {
  localStorage.setItem(KEY, locale)
}

// Keys are stable identifiers; the English text is a value like any other.
const en = {
  'common.description': 'Description',
  'common.attachments': 'Attachments',
  'common.priority': 'Priority',
  'common.labels': 'Labels',
  'common.none': 'None',
  'common.cancel': 'Cancel',
  'common.retry': 'Retry',
  'common.close': 'Close',
  'common.search': 'Search',
  'common.searchPlaceholder': 'Search or filter…',
  'common.dismiss': 'Dismiss',
  'common.remove': 'Remove',
  'common.save': 'Save',
  'common.delete': 'Delete',
  'addTask.aria': 'Add task',
  'addTask.textPlaceholder': 'Call plumber +house @phone',
  'addTask.attachChip': 'Attach',
  'addTask.openButton': '+ Add task',
  'askFilter.aria': 'Describe a filter',
  'askFilter.placeholder': 'Describe a filter…',
  'askFilter.downloading': 'Downloading model… {percent}%',
  'askFilter.thinking': 'Thinking…',
  'attachments.trashConfirm': 'Move {name} to the Drive trash?',
  'attachments.empty': 'No files yet.',
  'attachments.addFile': 'Add file',
  'attachments.workingAria': 'Working',
  'columns.empty': 'Tick a saved filter in the sidebar to show it here.',
  'date.fieldLabel': 'Date',
  'date.previousMonth': 'Previous month',
  'date.nextMonth': 'Next month',
  'date.clear': 'Clear',
  'date.repeat.daily': 'Daily',
  'date.repeat.weekly': 'Weekly',
  'date.repeat.monthly': 'Monthly',
  'date.repeat.yearly': 'Yearly',
  'date.today': 'Today',
  'date.tomorrow': 'Tomorrow',
  'quick.weekend': 'This weekend',
  'quick.nextWeek': 'Next week',
  'deps.searchPlaceholder': 'Find a task',
  'deps.empty': 'No open task to wait on.',
  'gantt.empty': 'Give a task a due date or a deadline to see it here.',
  'labels.emptyHint': 'No labels yet. Type +project or @context instead.',
  'labels.typePlaceholder': 'Type a label',
  'preview.openInDrive': 'Open in Drive',
  'preview.loading': 'Loading…',
  'saveFilter.cta': 'Save as filter',
  'saveFilter.namePlaceholder': 'Filter name',
  'sidebar.unsavedChanges': 'Unsaved changes',
  'sidebar.saving': 'Saving…',
  'sidebar.saved': 'Saved',
  'sidebar.saveFailed': 'Save failed',
  'sidebar.filtersHeading': 'Filters',
  'sidebar.showAsColumn': 'Show {name} as a column',
  'sidebar.deleteFilter': 'Delete {name}',
  'sidebar.showCompleted': 'Show completed',
  'sidebar.projectsHeading': 'Projects',
  'sidebar.contextsHeading': 'Contexts',
  'sidebar.archiveCompleted': 'Archive completed',
  'sidebar.stats': 'Stats',
  'sidebar.columns': 'Columns',
  'sidebar.gantt': 'Gantt',
  'sidebar.switchLocale': 'Switch language',
  'view.all': 'All',
  'view.overdue': 'Overdue',
  'view.today': 'Today',
  'view.upcoming': 'Upcoming',
  'stats.streakHeading': 'Streak',
  'stats.noStreak': 'No streak running',
  'stats.streakDays.one': '{count} day running',
  'stats.streakDays.other': '{count} days running',
  'stats.completedPerDay': 'Completed per day',
  'stats.completedPerWeek': 'Completed per week',
  'stats.loadingHistory': 'Loading history…',
  'task.waitingOn': 'Waiting on {title}',
  'task.empty': 'Nothing here.',
  'taskModal.aria': 'Task',
  'taskModal.noDate': 'No date',
  'taskModal.deadlineHeading': 'Deadline',
  'taskModal.noDeadline': 'No deadline',
  'taskModal.addLabelAria': 'Add label',
  'taskModal.removeLabelAria': 'Remove {label}',
  'taskModal.dependsOnHeading': 'Depends on',
  'taskModal.clearDependencyAria': 'Clear dependency',
  'signin.intro': 'Todoom keeps your tasks in a todo.txt file in your Google Drive.',
  'signin.connect': 'Connect to Drive',
  'signin.gone': 'That file is gone from Drive. Reload to create a new todo.txt.',
  'signin.reload': 'Reload',
} as const

export type Key = keyof typeof en

const ptBR: Record<Key, string> = {
  'common.description': 'Descrição',
  'common.attachments': 'Anexos',
  'common.priority': 'Prioridade',
  'common.labels': 'Etiquetas',
  'common.none': 'Nenhuma',
  'common.cancel': 'Cancelar',
  'common.retry': 'Tentar de novo',
  'common.close': 'Fechar',
  'common.search': 'Buscar',
  'common.searchPlaceholder': 'Buscar ou filtrar…',
  'common.dismiss': 'Dispensar',
  'common.remove': 'Remover',
  'common.save': 'Salvar',
  'common.delete': 'Excluir',
  'addTask.aria': 'Adicionar tarefa',
  'addTask.textPlaceholder': 'Ligar pro encanador +casa @telefone',
  'addTask.attachChip': 'Anexar',
  'addTask.openButton': '+ Adicionar tarefa',
  'askFilter.aria': 'Descrever um filtro',
  'askFilter.placeholder': 'Descreva um filtro…',
  'askFilter.downloading': 'Baixando modelo… {percent}%',
  'askFilter.thinking': 'Pensando…',
  'attachments.trashConfirm': 'Mover {name} para a lixeira do Drive?',
  'attachments.empty': 'Nenhum arquivo ainda.',
  'attachments.addFile': 'Adicionar arquivo',
  'attachments.workingAria': 'Processando',
  'columns.empty': 'Marque um filtro salvo na barra lateral pra mostrar aqui.',
  'date.fieldLabel': 'Data',
  'date.previousMonth': 'Mês anterior',
  'date.nextMonth': 'Próximo mês',
  'date.clear': 'Limpar',
  'date.repeat.daily': 'Diariamente',
  'date.repeat.weekly': 'Semanalmente',
  'date.repeat.monthly': 'Mensalmente',
  'date.repeat.yearly': 'Anualmente',
  'date.today': 'Hoje',
  'date.tomorrow': 'Amanhã',
  'quick.weekend': 'Este fim de semana',
  'quick.nextWeek': 'Semana que vem',
  'deps.searchPlaceholder': 'Buscar uma tarefa',
  'deps.empty': 'Nenhuma tarefa aberta pra esperar.',
  'gantt.empty': 'Dê uma data ou prazo a uma tarefa pra ela aparecer aqui.',
  'labels.emptyHint': 'Nenhuma etiqueta ainda. Digite +projeto ou @contexto.',
  'labels.typePlaceholder': 'Digite uma etiqueta',
  'preview.openInDrive': 'Abrir no Drive',
  'preview.loading': 'Carregando…',
  'saveFilter.cta': 'Salvar como filtro',
  'saveFilter.namePlaceholder': 'Nome do filtro',
  'sidebar.unsavedChanges': 'Alterações não salvas',
  'sidebar.saving': 'Salvando…',
  'sidebar.saved': 'Salvo',
  'sidebar.saveFailed': 'Falha ao salvar',
  'sidebar.filtersHeading': 'Filtros',
  'sidebar.showAsColumn': 'Mostrar {name} como coluna',
  'sidebar.deleteFilter': 'Excluir {name}',
  'sidebar.showCompleted': 'Mostrar concluídas',
  'sidebar.projectsHeading': 'Projetos',
  'sidebar.contextsHeading': 'Contextos',
  'sidebar.archiveCompleted': 'Arquivar concluídas',
  'sidebar.stats': 'Estatísticas',
  'sidebar.columns': 'Colunas',
  'sidebar.gantt': 'Gantt',
  'sidebar.switchLocale': 'Trocar idioma',
  'view.all': 'Todas',
  'view.overdue': 'Atrasadas',
  'view.today': 'Hoje',
  'view.upcoming': 'Em breve',
  'stats.streakHeading': 'Sequência',
  'stats.noStreak': 'Nenhuma sequência ativa',
  'stats.streakDays.one': '{count} dia seguido',
  'stats.streakDays.other': '{count} dias seguidos',
  'stats.completedPerDay': 'Concluídas por dia',
  'stats.completedPerWeek': 'Concluídas por semana',
  'stats.loadingHistory': 'Carregando histórico…',
  'task.waitingOn': 'Esperando {title}',
  'task.empty': 'Nada por aqui.',
  'taskModal.aria': 'Tarefa',
  'taskModal.noDate': 'Sem data',
  'taskModal.deadlineHeading': 'Prazo',
  'taskModal.noDeadline': 'Sem prazo',
  'taskModal.addLabelAria': 'Adicionar etiqueta',
  'taskModal.removeLabelAria': 'Remover {label}',
  'taskModal.dependsOnHeading': 'Depende de',
  'taskModal.clearDependencyAria': 'Limpar dependência',
  'signin.intro': 'O Todoom guarda suas tarefas em um arquivo todo.txt no seu Google Drive.',
  'signin.connect': 'Conectar ao Drive',
  'signin.gone': 'Esse arquivo sumiu do Drive. Recarregue pra criar um novo todo.txt.',
  'signin.reload': 'Recarregar',
}

export const STRINGS: Record<Locale, Record<Key, string>> = { en, 'pt-BR': ptBR }

export function t(locale: Locale, key: Key, params: Record<string, string | number> = {}): string {
  return STRINGS[locale][key].replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name]
    return value === undefined ? match : String(value)
  })
}

/** Which of a `.one` / `.other` key pair fits the count in this locale. */
export function pluralOf(locale: Locale, count: number): 'one' | 'other' {
  return new Intl.PluralRules(locale).select(count) === 'one' ? 'one' : 'other'
}
```

- [ ] **Step 4: Write `src/ui/formatDate.ts`**

```ts
import { addInterval } from '../core/dates'
import type { Locale } from './i18n'

// Every ISO day is formatted as a UTC instant so the browser's zone never
// shifts it to the day before.
function format(locale: Locale, iso: string, options: Intl.DateTimeFormatOptions): string {
  const date = new Date(`${iso}T00:00:00Z`)
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' }).format(date)
}

/** "May 8" while we are still in the same year, "Aug 26, 2025" once we are not. */
export function shortDate(locale: Locale, iso: string, today: string): string {
  const sameYear = iso.slice(0, 4) === today.slice(0, 4)
  return format(locale, iso, { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) })
}

export function weekdayName(locale: Locale, iso: string): string {
  return format(locale, iso, { weekday: 'long' })
}

export function weekdayShort(locale: Locale, iso: string): string {
  return format(locale, iso, { weekday: 'short' })
}

export function monthShort(locale: Locale, iso: string): string {
  return format(locale, iso, { month: 'short' })
}

export function monthYear(locale: Locale, iso: string, month: 'short' | 'long'): string {
  return format(locale, iso, { month, year: 'numeric' })
}

/** Monday-first, matching weekday() in core/dates. 2024-01-01 was a Monday. */
export function weekdayInitials(locale: Locale): string[] {
  return Array.from({ length: 7 }, (_, i) =>
    format(locale, addInterval('2024-01-01', i, 'd'), { weekday: 'narrow' }),
  )
}
```

If the `shortDate` line runs past 100 columns, split the options into a `const options` first.

- [ ] **Step 5: Run the tests**

Run: `npx tsc --noEmit && npx vitest run`
Expected: all green. The expected strings were produced by Node's ICU on this machine; if one differs, adjust the assertion to what `Intl` actually returns and say so in the report — never special-case the code.

- [ ] **Step 6: Commit**

```bash
git add src/ui/i18n.ts src/ui/i18n.test.ts src/ui/formatDate.ts src/ui/formatDate.test.ts
git commit -m "feat: string table, locale resolution and Intl date helpers"
```

---

### Task 2: Locale context, sidebar toggle and sign-in strings

**Files:**
- Create: `src/ui/locale.tsx`
- Modify: `src/ui/App.tsx`, `src/ui/Sidebar.tsx`, `src/main.tsx`, `src/ui/styles.css` (next to `.theme-btn`)
- Test: `src/ui/App.test.tsx`

**Interfaces:**
- Consumes from Task 1: `Locale`, `Key`, `loadLocale`, `saveLocale`, `t`.
- Produces:
  - `export function LocaleProvider({ children }): JSX`
  - `export function useLocale(): { locale: Locale; t: (key: Key, params?: Record<string, string | number>) => string; setLocale: (locale: Locale) => void }`

- [ ] **Step 1: Write the failing tests**

In `src/ui/App.test.tsx` add a new `describe` at the end of the file (`vi` is already imported; `afterEach` already runs `cleanup()` and `vi.restoreAllMocks()`):

```ts
describe('locale', () => {
  afterEach(() => localStorage.clear())

  it('renders in Portuguese when the browser speaks it', async () => {
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('pt-BR')
    const { root } = await mount('Buy milk\n')
    expect(root.querySelector('.search')?.getAttribute('placeholder')).toBe('Buscar ou filtrar…')
    expect(document.documentElement.lang).toBe('pt-BR')
    expect(localStorage.getItem('todoom.locale')).toBeNull()
  })

  it('switches from the sidebar and remembers it', async () => {
    const { root } = await mount('Buy milk\n')
    expect(root.querySelector('.locale-btn')?.textContent).toBe('pt')
    fireEvent.click(root.querySelector('.locale-btn')!)
    expect(root.querySelector('.search')?.getAttribute('placeholder')).toBe('Buscar ou filtrar…')
    expect(root.querySelector('.locale-btn')?.textContent).toBe('en')
    expect(document.documentElement.lang).toBe('pt-BR')
    expect(localStorage.getItem('todoom.locale')).toBe('pt-BR')
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/ui/App.test.tsx -t locale`
Expected: both fail (English placeholder, no `.locale-btn`).

- [ ] **Step 3: Write `src/ui/locale.tsx`**

```tsx
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
```

- [ ] **Step 4: Wrap the app**

In `src/ui/App.tsx`, rename the existing `App` observer to `Shell` (keep its body) and export a new `App`:

```tsx
export function App(props: { app: TodoomApp; today: () => string }) {
  return (
    <LocaleProvider>
      <Shell {...props} />
    </LocaleProvider>
  )
}
```

Import `LocaleProvider` from `./locale`. `Shell` stays an `observer` and keeps the keyboard handling.

- [ ] **Step 5: Localize the sidebar and add the toggle**

In `src/ui/Sidebar.tsx`:

- `const { locale, t, setLocale } = useLocale()` at the top of the component (import from `./locale`).
- Turn `STATUS_TEXT` into a map from `SaveState` to `Key`: `dirty: 'sidebar.unsavedChanges'`, `saving: 'sidebar.saving'`, `saved: 'sidebar.saved'`, and render `t(STATUS_TEXT[saveState])`. Keep whatever the map does for `idle`/`error` today (an empty string stays an empty string, not a key).
- `VIEWS` becomes `[view, Key]` pairs: `['all', 'view.all']`, `['overdue', 'view.overdue']`, `['today', 'view.today']`, `['upcoming', 'view.upcoming']`; render `t(key)`.
- Replace every remaining English literal in the file with `t(...)` using these keys: `'Save failed'` → `sidebar.saveFailed`, `'Retry'` → `common.retry`, search placeholder → `common.searchPlaceholder`, search button `aria-label` → `common.search`, `'Filters'` → `sidebar.filtersHeading`, `` `Show ${saved.name} as a column` `` → `t('sidebar.showAsColumn', { name: saved.name })`, `` `Delete ${saved.name}` `` → `t('sidebar.deleteFilter', { name: saved.name })`, `'Show completed'` → `sidebar.showCompleted`, `'Archive completed'` → `sidebar.archiveCompleted`, `'Stats'` → `sidebar.stats`, `'Columns'` → `sidebar.columns`, `'Gantt'` → `sidebar.gantt`, `'Projects'`/`'Contexts'` headings passed to `LabelSection` → `sidebar.projectsHeading` / `sidebar.contextsHeading`, `'Priority'` → `common.priority`, `'Labels'` if present → `common.labels`. The theme button's `auto` / `terminal` stay.
- Right after the theme button add:

```tsx
        <button
          className="locale-btn"
          title={t('sidebar.switchLocale')}
          onClick={() => setLocale(locale === 'en' ? 'pt-BR' : 'en')}
        >
          {locale === 'en' ? 'pt' : 'en'}
        </button>
```

- In `src/ui/styles.css`, find the `.theme-btn` rule and make its selector `.theme-btn, .locale-btn` (same look). If the terminal block also styles `.theme-btn`, extend that selector the same way — the block itself stays last.

- [ ] **Step 6: Sign-in strings**

In `src/main.tsx`, import `{ loadLocale, t }` from `./ui/i18n` and replace: `'That file is gone from Drive. Reload to create a new todo.txt.'` → `t(loadLocale(), 'signin.gone')`, `'Reload'` → `t(loadLocale(), 'signin.reload')`, both `'Retry'` → `t(loadLocale(), 'common.retry')`, `const base = 'Todoom keeps your tasks…'` → `t(loadLocale(), 'signin.intro')`, `'Connect to Drive'` → `t(loadLocale(), 'signin.connect')`. A local `const locale = loadLocale()` at the top of `main()` is fine.

- [ ] **Step 7: Run the tests**

Run: `npx tsc --noEmit && npx vitest run`
Expected: all green. Any existing test asserting English sidebar text still passes (default locale `en`).

- [ ] **Step 8: Commit**

```bash
git add src/ui/locale.tsx src/ui/App.tsx src/ui/Sidebar.tsx src/ui/styles.css src/main.tsx src/ui/App.test.tsx
git commit -m "feat: locale context with a sidebar toggle"
```

---

### Task 3: Dates through Intl

**Files:**
- Modify: `src/ui/describeTask.ts`, `src/ui/quickDates.ts`, `src/ui/DatePopover.tsx`, `src/ui/Gantt.tsx`, `src/ui/Stats.tsx`, `src/ui/TaskList.tsx`, `src/ui/TaskModal.tsx`, `src/ui/SearchModal.tsx` (the three `describeTask` callers)
- Test: `src/ui/describeTask.test.ts`, `src/ui/quickDates.test.ts`

**Interfaces:**
- Consumes: Task 1's `formatDate.ts`, `t`, `pluralOf`; Task 2's `useLocale`.
- Produces: `describeTask(task, today, locale)`, `quickDates(today, locale)`, `monthGrid(year, month, locale)`. `MONTH_NAMES`, `WEEKDAY_NAMES`, `WEEKDAY_INITIALS` and `DatePopover.tsx`'s local `WEEKDAY_NAMES` are deleted.

- [ ] **Step 1: Update the tests**

`src/ui/describeTask.test.ts`: every `describeTask(x, TODAY)` becomes `describeTask(x, TODAY, 'en')`; change `'1 Sep'` → `'Sep 1'`, `'20 Sep'` → `'Sep 20'`, `'26 Aug 2025'` → `'Aug 26, 2025'`. Add:

```ts
  it('speaks Portuguese', () => {
    expect(describeTask(parseLine('Buy milk due:2026-09-10'), TODAY, 'pt-BR').dueLabel).toBe('Hoje')
    expect(describeTask(parseLine('Buy milk due:2026-09-11'), TODAY, 'pt-BR').dueLabel).toBe('Amanhã')
    expect(describeTask(parseLine('Buy milk due:2026-09-15'), TODAY, 'pt-BR').dueLabel).toBe(
      'terça-feira',
    )
    expect(describeTask(parseLine('Buy milk due:2026-09-01'), TODAY, 'pt-BR').dueLabel).toBe(
      '1 de set.',
    )
  })
```

`src/ui/quickDates.test.ts`: `quickDates(TODAY)` → `quickDates(TODAY, 'en')`, `monthGrid(2026, 9)` → `monthGrid(2026, 9, 'en')` and its title `'Sep 2026'` → `'September 2026'`. Add:

```ts
  it('labels the shortcuts in Portuguese', () => {
    expect(quickDates(TODAY, 'pt-BR').map((q) => q.label)).toEqual([
      'Hoje',
      'Amanhã',
      'Este fim de semana',
      'Semana que vem',
    ])
    expect(monthGrid(2026, 9, 'pt-BR').title).toBe('setembro de 2026')
  })
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/ui/describeTask.test.ts src/ui/quickDates.test.ts`
Expected: type/argument failures and the new label expectations fail.

- [ ] **Step 3: `describeTask.ts`**

Remove the `MONTH_NAMES`/`WEEKDAY_NAMES` import and the local `shortDate`. Import `{ shortDate, weekdayName } from './formatDate'`, `{ t, type Locale } from './i18n'`. `describeDate(iso, today, locale)`:

```ts
function describeDate(iso: string, today: string, locale: Locale): { label: string; urgency: Urgency } {
  const delta = daysBetween(today, iso)
  if (delta < 0) return { label: shortDate(locale, iso, today), urgency: 'overdue' }
  if (delta === 0) return { label: t(locale, 'date.today'), urgency: 'today' }
  if (delta === 1) return { label: t(locale, 'date.tomorrow'), urgency: 'soon' }
  // Inside the coming week a weekday name places the task better than a date.
  if (delta < 7) return { label: weekdayName(locale, iso), urgency: 'soon' }
  return { label: shortDate(locale, iso, today), urgency: '' }
}
```

`describeTask(task, today, locale)` passes `locale` to both `describeDate` calls. Drop the now-unused `weekday` import if nothing else uses it.

- [ ] **Step 4: `quickDates.ts`**

`quickDates(today, locale)` labels: `t(locale, 'date.today')`, `t(locale, 'date.tomorrow')`, `t(locale, 'quick.weekend')`, `t(locale, 'quick.nextWeek')`. `monthGrid(year, month, locale)` title: `monthYear(locale, first, 'long')`. Delete `WEEKDAY_INITIALS`, `WEEKDAY_NAMES`, `MONTH_NAMES`.

- [ ] **Step 5: Components**

- `DatePopover.tsx`: `const { locale, t } = useLocale()`; `monthGrid(year, month, locale)`; `quickDates(today, locale)`; the quick-date weekday hint becomes `weekdayShort(locale, quick.date)`; the header initials `weekdayInitials(locale).map(...)`; delete the local `WEEKDAY_NAMES`. Also translate the file's other literals: `'Previous month'` / `'Next month'` aria → `date.previousMonth` / `date.nextMonth`, `'Clear'` → `date.clear`, the repeat options `Daily/Weekly/Monthly/Yearly` → `date.repeat.daily|weekly|monthly|yearly` (keep their `rec:` values untouched).
- `Gantt.tsx`: `const { locale, t } = useLocale()`; month label → `monthYear(locale, day, 'short')`; the empty paragraph → `t('gantt.empty')`.
- `Stats.tsx`: `Bars` and `Streak` receive `locale` as a prop; `short(iso)` → `shortDate(locale, iso, today)` needs `today` too, so give `Bars` a `today` prop as well (the `Stats` component has it). Streak month labels → `monthShort(locale, monday)`. Tooltip counts → `count.toLocaleString(locale)`. Headings → `stats.streakHeading`, `stats.completedPerDay`, `stats.completedPerWeek`; `'Loading history…'` → `stats.loadingHistory`; the streak sentence → `streak === 0 ? t('stats.noStreak') : t(`stats.streakDays.${pluralOf(locale, streak)}`, { count: streak })`.
- `TaskList.tsx`, `TaskModal.tsx`, `SearchModal.tsx`: pass `locale` from `useLocale()` into `describeTask(task, today, locale)`. Only the argument changes here; the rest of their strings are Task 4.

- [ ] **Step 6: Run the tests**

Run: `npx tsc --noEmit && npx vitest run`
Expected: green. `tsc` is the guard that no caller was missed. If an `App.test.tsx` assertion relied on `Sep 2026` or `1 Sep` style text, update it to Intl's `en` output.

- [ ] **Step 7: Commit**

```bash
git add src/ui
git commit -m "feat: dates and month names from Intl"
```

---

### Task 4: Every remaining string, and the roadmap

**Files:**
- Modify: `src/ui/AddTask.tsx`, `src/ui/AskFilter.tsx`, `src/ui/AttachmentsPopover.tsx`, `src/ui/Columns.tsx`, `src/ui/DependencyPopover.tsx`, `src/ui/LabelsPopover.tsx`, `src/ui/PreviewModal.tsx`, `src/ui/SaveFilter.tsx`, `src/ui/SearchModal.tsx`, `src/ui/TaskList.tsx`, `src/ui/TaskModal.tsx`
- Modify: `docs/roadmap.md` (remove `## Localization`)
- Test: `src/ui/App.test.tsx` (one assertion)

**Interfaces:**
- Consumes: `useLocale()` from Task 2 and the keys of Task 1.

- [ ] **Step 1: Add the failing test**

In the `describe('locale')` block of `src/ui/App.test.tsx`:

```ts
  it('translates the task list and the add button', async () => {
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('pt-BR')
    const { root } = await mount('')
    expect(root.querySelector('.empty')?.textContent).toBe('Nada por aqui.')
    expect(root.querySelector('.add-task')?.textContent).toBe('+ Adicionar tarefa')
  })
```

(Check the class names of the empty-list paragraph and the add button in `TaskList.tsx` / `AddTask.tsx` and adjust the selectors if they differ.)

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/ui/App.test.tsx -t locale`

- [ ] **Step 3: Replace the literals**

In each file: `const { t } = useLocale()` inside the component (a helper component without hooks gets `t` as a prop, or becomes a component that calls the hook — pick whichever is fewer lines), then replace each English literal with `t(key)` from this map. Do the same-shape edit in every file, one commit for all.

| English | key |
|---|---|
| `Description` (placeholders) | `common.description` |
| `Attachments` (title) | `common.attachments` |
| `Priority` | `common.priority` |
| `Labels` | `common.labels` |
| `None` | `common.none` |
| `Cancel` | `common.cancel` |
| `Retry` | `common.retry` |
| `Close` (aria/title) | `common.close` |
| `Search` (aria) | `common.search` |
| `Dismiss` (title) | `common.dismiss` |
| `Remove` (title) | `common.remove` |
| `Save` | `common.save` |
| `Delete` | `common.delete` |
| `Add task` (aria, twice) | `addTask.aria` |
| `Call plumber +house @phone` | `addTask.textPlaceholder` |
| `Attach` | `addTask.attachChip` |
| `+ Add task` | `addTask.openButton` |
| `Date` (chip) | `date.fieldLabel` |
| `Describe a filter` (aria) / `Describe a filter…` (placeholder) | `askFilter.aria` / `askFilter.placeholder` |
| `` Downloading model… ${n}% `` | `t('askFilter.downloading', { percent: n })` |
| `Thinking…` | `askFilter.thinking` |
| `` Move ${name} to the Drive trash? `` | `t('attachments.trashConfirm', { name })` |
| `No files yet.` | `attachments.empty` |
| `Add file` | `attachments.addFile` |
| `Working` (spinner aria) | `attachments.workingAria` |
| `Tick a saved filter in the sidebar to show it here.` | `columns.empty` |
| `Find a task` | `deps.searchPlaceholder` |
| `No open task to wait on.` | `deps.empty` |
| `No labels yet. Type +project or @context instead.` | `labels.emptyHint` |
| `Type a label` | `labels.typePlaceholder` |
| `Open in Drive` | `preview.openInDrive` |
| `Loading…` | `preview.loading` |
| `Save as filter` | `saveFilter.cta` |
| `Filter name` | `saveFilter.namePlaceholder` |
| `` Waiting on ${title} `` | `t('task.waitingOn', { title })` |
| `Nothing here.` | `task.empty` |
| `Task` (dialog aria) | `taskModal.aria` |
| `No date` | `taskModal.noDate` |
| `Deadline` | `taskModal.deadlineHeading` |
| `No deadline` | `taskModal.noDeadline` |
| `Add label` (aria) | `taskModal.addLabelAria` |
| `` Remove ${label} `` (aria) | `t('taskModal.removeLabelAria', { label })` |
| `Depends on` | `taskModal.dependsOnHeading` |
| `Clear dependency` (aria) | `taskModal.clearDependencyAria` |
| `Search or filter…` (SearchModal input) | `common.searchPlaceholder` |

If you meet a user-visible English string that is not in the table, add a key to **both** `en` and `ptBR` in `src/ui/i18n.ts` (same naming style) and list it in your report. `AttachmentsPopover.tsx`'s `detach` uses `confirm(...)`: it gets `t` from the component scope. `PendingMark` is an observer without `t`: call `useLocale()` inside it.

- [ ] **Step 4: Sweep for leftovers**

Run: `grep -nE '>[A-Z][a-z]+[^<{]*<|placeholder="[A-Z]|title="[A-Z]|aria-label="[A-Z]' src/ui/*.tsx | grep -v 'Todoom'`
Expected: nothing but symbols and the theme button captions. Fix anything else.

- [ ] **Step 5: Roadmap**

In `docs/roadmap.md`, delete the `## Localization` heading and its paragraph.

- [ ] **Step 6: Full gate and commit**

Run: `npx tsc --noEmit && npx vitest run && npx playwright test && npm run build`
Expected: all green (Playwright runs Chromium with `en-US`, so the English e2e assertions hold).

```bash
git add src/ui docs/roadmap.md
git commit -m "feat: every interface string through the locale"
```
