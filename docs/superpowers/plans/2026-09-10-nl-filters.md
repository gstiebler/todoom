# Natural-language Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A ✦ button beside the search box that turns a plain-language description into a smart-filter query via Chrome's on-device Prompt API, writing the result into the search box.

**Architecture:** A pure prompt builder in `core`, one adapter in `app` that is the only code touching `window.LanguageModel`, a `translate` method on `TodoomApp` that prompts, validates with `parseQuery`, retries once, then sets the search, and a small form component in `ui` modelled on `SaveFilter`. The adapter is injected into `TodoomApp` so every test uses a fake.

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess`), MobX 7, React 19, Vitest (jsdom for UI tests), Playwright.

**Spec:** `docs/superpowers/specs/2026-09-10-nl-filters-design.md`

## Global Constraints

- Only `src/app/languageModel.ts` may reference `LanguageModel`; it declares the global itself, no `@types` package is added.
- The OAuth scope, token handling and the Worker are untouched.
- No test calls the real model; every test injects a fake `LanguageModelAdapter`.
- The only `try/catch` added is the one around the first `parseQuery` in `translate`. Model and download errors bubble.
- House style: single quotes, no semicolons, ~100 columns, comments only where the code does not say why.
- The terminal skin block (`[data-theme='terminal'] …`) stays last in `src/ui/styles.css`.
- Nothing pre-existing is migrated.
- Commit messages end with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`. Never push.

---

## File structure

| File | Responsibility |
|---|---|
| `src/core/nlPrompt.ts` (new) | `Vocabulary`, `buildPrompt`, `retryPrompt` — pure strings |
| `src/app/languageModel.ts` (new) | `Availability`, `ModelSession`, `LanguageModelAdapter`, `chromeModel` |
| `src/app/fakeModel.ts` (new) | `FakeModel` test double, shared by unit tests and the e2e fixture |
| `src/app/state.ts` | `model`/`modelProgress` state, injected adapter, `translate` |
| `src/ui/AskFilter.tsx` (new) | the ✦ button and its form |
| `src/ui/Sidebar.tsx`, `src/ui/styles.css` | mount and style the form |
| `e2e/fixture.tsx`, `e2e/todoom.spec.ts` | fake adapter in the fixture, one scenario |
| `docs/roadmap.md` | remove the entry |

---

### Task 1: Prompt builder

**Files:**
- Create: `src/core/nlPrompt.ts`
- Test: `src/core/nlPrompt.test.ts`

**Interfaces:**
- Consumes: `addInterval(iso: string, count: number, unit: 'd' | 'w' | 'm' | 'y'): string` from `src/core/dates.ts`.
- Produces: `interface Vocabulary { projects: string[]; contexts: string[] }`, `buildPrompt(vocab: Vocabulary, today: string): string`, `retryPrompt(query: string, error: string): string`.

- [ ] **Step 1: Write the failing tests**

`src/core/nlPrompt.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { buildPrompt, retryPrompt } from './nlPrompt'

const TODAY = '2026-09-10'

describe('buildPrompt', () => {
  test('carries the date, the labels and the one-line rule', () => {
    const prompt = buildPrompt({ projects: ['work', 'house'], contexts: ['phone'] }, TODAY)
    expect(prompt).toContain('Today is 2026-09-10')
    expect(prompt).toContain('Projects: +work +house')
    expect(prompt).toContain('Contexts: @phone')
    expect(prompt).toContain('exactly one line')
  })

  test('omits the label lines when there are no labels', () => {
    const prompt = buildPrompt({ projects: [], contexts: [] }, TODAY)
    expect(prompt).not.toContain('Projects:')
    expect(prompt).not.toContain('Contexts:')
  })

  test('resolves the week example against today', () => {
    expect(buildPrompt({ projects: [], contexts: [] }, TODAY)).toContain('deadline before:2026-09-17')
  })
})

describe('retryPrompt', () => {
  test('quotes the answer and the error', () => {
    expect(retryPrompt('+home |', 'Missing a term at the end')).toBe(
      'That answer, "+home |", is not valid: Missing a term at the end. Reply with only the corrected query.',
    )
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/core/nlPrompt.test.ts`
Expected: FAIL — cannot resolve `./nlPrompt`.

- [ ] **Step 3: Write the implementation**

`src/core/nlPrompt.ts`:

```ts
import { addInterval } from './dates'

export interface Vocabulary {
  projects: string[]
  contexts: string[]
}

const GRAMMAR = `Terms:
- a plain word matches tasks containing it
- +project, @context
- (A) or pri:A for priority A; "no pri" for none
- due:<date>, due before:<date>, due after:<date>, due:none or "no date", due:overdue or overdue
- deadline:<date>, deadline before:<date>, deadline after:<date>, deadline:none or "no deadline", deadline:overdue
- done (completed), blocked (waits on another task), rec (repeats)
<date> is today, tomorrow, yesterday, or YYYY-MM-DD.
Operators: ! (not), & (and), | (or), parentheses. Two terms side by side mean &.`

const RULES = `Reply with exactly one line containing only the query: no explanation, no quotes, no code fences.
Only use projects and contexts from the lists below; for anything else use plain words.`

/** The system prompt: grammar, rules, examples, and the user's own labels. */
export function buildPrompt(vocab: Vocabulary, today: string): string {
  const examples: Array<[string, string]> = [
    ['things I have to do today', 'due:today'],
    ['overdue work tasks', '+work & overdue'],
    ['high priority and not blocked', '(A) & !blocked'],
    ['anything without a date', 'no date'],
    ['house or garden', '+house | +garden'],
    ['repeating chores', 'rec'],
    ['finished tasks', 'done'],
    ['deadline this week', `deadline before:${addInterval(today, 7, 'd')}`],
    ['calls I can make tomorrow', '@phone & due:tomorrow'],
    ['call mom', 'call mom'],
  ]
  const labels = [
    vocab.projects.length > 0 && `Projects: ${vocab.projects.map((p) => `+${p}`).join(' ')}`,
    vocab.contexts.length > 0 && `Contexts: ${vocab.contexts.map((c) => `@${c}`).join(' ')}`,
  ].filter((line): line is string => typeof line === 'string')
  return [
    'You turn a description of tasks into a filter query for a todo.txt list.',
    `Today is ${today}.`,
    GRAMMAR,
    RULES,
    ...labels,
    'Examples:',
    ...examples.map(([text, query]) => `${text} -> ${query}`),
  ].join('\n')
}

/** The follow-up when the first answer did not parse. */
export function retryPrompt(query: string, error: string): string {
  return `That answer, "${query}", is not valid: ${error}. Reply with only the corrected query.`
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/core/nlPrompt.test.ts`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add src/core/nlPrompt.ts src/core/nlPrompt.test.ts
git commit -m "feat: prompt for translating descriptions into filter queries"
```

---

### Task 2: Model adapter and fake

**Files:**
- Create: `src/app/languageModel.ts`
- Create: `src/app/fakeModel.ts`
- Test: `src/app/fakeModel.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type Availability = 'available' | 'downloadable' | 'downloading' | 'unavailable'
  export interface ModelSession { prompt(text: string): Promise<string>; destroy(): void }
  export interface LanguageModelAdapter {
    availability(): Promise<Availability>
    create(system: string, onProgress: (fraction: number) => void): Promise<ModelSession>
  }
  export const chromeModel: LanguageModelAdapter
  ```
  and, in `fakeModel.ts`:
  ```ts
  export class FakeModel implements LanguageModelAdapter {
    constructor(status: Availability = 'available', answers: string[] = [], progress: number[] = [])
    systemPrompt: string | null      // what create() received
    prompts: string[]                // every prompt() text, in order
    sessions: number                 // how many times create() ran
    failCreate: Error | null         // when set, create() rejects with it
  }
  ```
  `prompt()` returns the next answer from `answers`; when they run out it throws `new Error('no answer scripted')`. `create()` calls `onProgress` once per value in `progress` before resolving.

- [ ] **Step 1: Write the failing test**

`src/app/fakeModel.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { FakeModel } from './fakeModel'

describe('FakeModel', () => {
  test('answers in order, reports progress and remembers what it was asked', async () => {
    const model = new FakeModel('available', ['+home', 'done'], [0.5, 1])
    const seen: number[] = []
    const session = await model.create('system', (fraction) => seen.push(fraction))
    expect(seen).toEqual([0.5, 1])
    expect(model.systemPrompt).toBe('system')
    expect(await session.prompt('home stuff')).toBe('+home')
    expect(await session.prompt('finished')).toBe('done')
    expect(model.prompts).toEqual(['home stuff', 'finished'])
    await expect(session.prompt('again')).rejects.toThrow('no answer scripted')
  })

  test('rejects create when told to', async () => {
    const model = new FakeModel()
    model.failCreate = new Error('declined')
    await expect(model.create('s', () => {})).rejects.toThrow('declined')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/app/fakeModel.test.ts`
Expected: FAIL — cannot resolve `./fakeModel`.

- [ ] **Step 3: Write the adapter**

`src/app/languageModel.ts`:

```ts
export type Availability = 'available' | 'downloadable' | 'downloading' | 'unavailable'

export interface ModelSession {
  prompt(text: string): Promise<string>
  destroy(): void
}

export interface LanguageModelAdapter {
  availability(): Promise<Availability>
  /** Creates a session; `onProgress` gets 0..1 while the model downloads. */
  create(system: string, onProgress: (fraction: number) => void): Promise<ModelSession>
}

// The Prompt API as Chrome ships it; only the parts used here.
interface ChromeSession {
  prompt(input: string): Promise<string>
  destroy(): void
}

interface ChromeLanguageModel {
  availability(): Promise<Availability>
  create(options: {
    initialPrompts: Array<{ role: 'system'; content: string }>
    temperature: number
    topK: number
    monitor(monitor: EventTarget): void
  }): Promise<ChromeSession>
}

declare global {
  // eslint-disable-next-line no-var
  var LanguageModel: ChromeLanguageModel | undefined
}

/** Chrome's built-in model; reports `unavailable` in every other browser. */
export const chromeModel: LanguageModelAdapter = {
  async availability() {
    return globalThis.LanguageModel ? globalThis.LanguageModel.availability() : 'unavailable'
  },

  async create(system, onProgress) {
    const model = globalThis.LanguageModel
    if (!model) throw new Error('no on-device model')
    return model.create({
      initialPrompts: [{ role: 'system', content: system }],
      temperature: 0,
      topK: 1,
      monitor(monitor) {
        monitor.addEventListener('downloadprogress', (event) => {
          onProgress((event as ProgressEvent).loaded)
        })
      },
    })
  },
}
```

- [ ] **Step 4: Write the fake**

`src/app/fakeModel.ts`:

```ts
import type { Availability, LanguageModelAdapter, ModelSession } from './languageModel'

/** A scripted model for tests: answers come from a list, in order. */
export class FakeModel implements LanguageModelAdapter {
  systemPrompt: string | null = null
  prompts: string[] = []
  sessions = 0
  failCreate: Error | null = null

  constructor(
    private status: Availability = 'available',
    private answers: string[] = [],
    private progress: number[] = [],
  ) {}

  async availability(): Promise<Availability> {
    return this.status
  }

  async create(system: string, onProgress: (fraction: number) => void): Promise<ModelSession> {
    if (this.failCreate) throw this.failCreate
    this.sessions += 1
    this.systemPrompt = system
    for (const fraction of this.progress) onProgress(fraction)
    return {
      prompt: async (text) => {
        this.prompts.push(text)
        const answer = this.answers.shift()
        if (answer === undefined) throw new Error('no answer scripted')
        return answer
      },
      destroy: () => {},
    }
  }
}
```

- [ ] **Step 5: Run the test and the type check**

Run: `npx vitest run src/app/fakeModel.test.ts && npx tsc --noEmit`
Expected: 2 passed; tsc clean.

- [ ] **Step 6: Commit**

```bash
git add src/app/languageModel.ts src/app/fakeModel.ts src/app/fakeModel.test.ts
git commit -m "feat: adapter over Chrome's on-device language model"
```

---

### Task 3: `translate` in app state

**Files:**
- Modify: `src/app/state.ts` (imports, `AppState`, constructor, new method)
- Test: `src/app/state.test.ts` (append)

**Interfaces:**
- Consumes: `buildPrompt`, `retryPrompt`, `Vocabulary` (Task 1); `Availability`, `LanguageModelAdapter`, `ModelSession`, `chromeModel`, `FakeModel` (Task 2); existing `collectProjects`, `collectContexts` from `src/core/query.ts`; existing `parseQuery` from `src/core/filterQuery.ts`; existing `setFilter`.
- Produces: `AppState.model: Availability | 'unknown'`, `AppState.modelProgress: number | null`, `TodoomApp` constructor `(store, today, model: LanguageModelAdapter = chromeModel)`, `translate(description: string): Promise<void>`.

- [ ] **Step 1: Write the failing tests**

Append to `src/app/state.test.ts`:

```ts
describe('translate', () => {
  async function setupModel(model: FakeModel) {
    const store = new FakeStore({ 'todo.txt': 'a +home @phone\nb +work\n' })
    await store.signIn()
    const app = new TodoomApp(store, () => TODAY, model)
    await app.load(await store.workspace())
    return app
  }

  it('reports the availability once asked', async () => {
    const app = await setupModel(new FakeModel('downloadable'))
    await waitFor(() => expect(app.state.model).toBe('downloadable'))
  })

  it('puts a valid answer into the search', async () => {
    const model = new FakeModel('available', ['+home & due:today'])
    const app = await setupModel(model)
    await app.translate('home things for today')
    expect(app.state.filter.search).toBe('+home & due:today')
    expect(model.prompts).toEqual(['home things for today'])
    expect(model.systemPrompt).toContain('Projects: +home +work')
    expect(model.systemPrompt).toContain('Contexts: @phone')
  })

  it('strips fences and keeps the first line', async () => {
    const app = await setupModel(new FakeModel('available', ['`+home`\nsecond line']))
    await app.translate('home')
    expect(app.state.filter.search).toBe('+home')
  })

  it('retries once with the parse error', async () => {
    const model = new FakeModel('available', ['+home |', '+home'])
    const app = await setupModel(model)
    await app.translate('home')
    expect(app.state.filter.search).toBe('+home')
    expect(model.prompts[1]).toContain('"+home |"')
    expect(model.prompts[1]).toContain('Missing a term at the end')
  })

  it('gives up after the second bad answer', async () => {
    const app = await setupModel(new FakeModel('available', ['+home |', 'done |']))
    await expect(app.translate('home')).rejects.toThrow('Missing a term at the end')
    expect(app.state.filter.search).toBe('')
  })

  it('reports download progress and reuses the session', async () => {
    const model = new FakeModel('available', ['+home', 'done'], [0.5])
    const app = await setupModel(model)
    const seen: Array<number | null> = []
    reaction(() => app.state.modelProgress, (p) => seen.push(p))
    await app.translate('home')
    await app.translate('finished')
    expect(seen).toEqual([0, 0.5, null])
    expect(model.sessions).toBe(1)
  })

  it('clears the progress when the download fails', async () => {
    const model = new FakeModel()
    model.failCreate = new Error('declined')
    const app = await setupModel(model)
    await expect(app.translate('home')).rejects.toThrow('declined')
    expect(app.state.modelProgress).toBeNull()
  })
})
```

Add to the imports at the top of the file:

```ts
import { FakeModel } from './fakeModel'
```

and a tiny polling helper (the file has no `waitFor`; put it after `setup`):

```ts
async function waitFor(check: () => void): Promise<void> {
  for (let i = 0; i < 50; i += 1) {
    try {
      check()
      return
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 5))
    }
  }
  check()
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/app/state.test.ts`
Expected: the `translate` cases fail (no `translate`, no third constructor argument).

- [ ] **Step 3: Implement**

In `src/app/state.ts`, add imports:

```ts
import { collectProjects, collectContexts } from '../core/query'
import { buildPrompt, retryPrompt } from '../core/nlPrompt'
import type { Availability, LanguageModelAdapter, ModelSession } from './languageModel'
import { chromeModel } from './languageModel'
```

(merge `collectProjects, collectContexts` into the existing `../core/query` import line.)

Extend `AppState`:

```ts
  /** Whether the on-device model can be used; 'unknown' until Chrome answers. */
  model: Availability | 'unknown'
  /** Download fraction while the model session is being created, else null. */
  modelProgress: number | null
```

and its initializer in the class: `model: 'unknown', modelProgress: null,`.

Add a field and change the constructor:

```ts
  private session: ModelSession | null = null

  constructor(
    private store: TodoStore,
    private today: () => string,
    private model: LanguageModelAdapter = chromeModel,
  ) {
    // The Drive client, the clock and the model are collaborators, not state;
    // leave them as they are. Everything else is observable, so mutating
    // `state` in place is what tells the UI something happened.
    makeAutoObservable<TodoomApp, 'store' | 'today' | 'model'>(this, {
      store: false,
      today: false,
      model: false,
    })
    void this.model.availability().then((availability) => {
      runInAction(() => {
        this.state.model = availability
      })
    })
  }
```

Add the method after `visibleTasks`:

```ts
  /** Asks the on-device model for a query and puts it in the search box. */
  async translate(description: string): Promise<void> {
    const session = await this.modelSession()
    let query = firstLine(await session.prompt(description))
    try {
      parseQuery(query)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      query = firstLine(await session.prompt(retryPrompt(query, message)))
      parseQuery(query)
    }
    this.setFilter({ search: query })
  }

  private async modelSession(): Promise<ModelSession> {
    if (this.session) return this.session
    const vocab = {
      projects: collectProjects(this.state.tasks),
      contexts: collectContexts(this.state.tasks),
    }
    this.state.modelProgress = 0
    try {
      const session = await this.model.create(buildPrompt(vocab, this.today()), (fraction) => {
        runInAction(() => {
          this.state.modelProgress = fraction
        })
      })
      runInAction(() => {
        this.session = session
      })
      return session
    } finally {
      runInAction(() => {
        this.state.modelProgress = null
      })
    }
  }
```

and a module-level helper near `isErrorState`:

```ts
/** The model is asked for one line; this forgives fences or quotes around it. */
function firstLine(answer: string): string {
  const line = answer.trim().split('\n')[0] ?? ''
  return line.replace(/^[`"']+|[`"']+$/g, '').trim()
}
```

The `try/finally` in `modelSession` is not a catch: the rejection still bubbles. `session` is private and excluded from nothing — MobX makes it observable, which is harmless.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/app && npx tsc --noEmit`
Expected: all pass; tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/app/state.ts src/app/state.test.ts
git commit -m "feat: translate a description into a filter query"
```

---

### Task 4: The AskFilter form

**Files:**
- Create: `src/ui/AskFilter.tsx`
- Modify: `src/ui/Sidebar.tsx` (import; mount after the search input)
- Modify: `src/ui/styles.css` (after `.save-filter__name`; terminal skin block stays last)
- Test: `src/ui/App.test.tsx` (append)

**Interfaces:**
- Consumes: `app.state.model`, `app.state.modelProgress`, `app.translate(description)` (Task 3); `FakeModel` (Task 2).

- [ ] **Step 1: Write the failing tests**

Append to `src/ui/App.test.tsx`, plus `import { FakeModel } from '../app/fakeModel'` at the top. `mount` gains an optional second parameter:

```ts
async function mount(seed: string, model = new FakeModel('unavailable')) {
  const store = new FakeStore({ 'todo.txt': seed })
  await store.signIn()
  const app = new TodoomApp(store, () => TODAY, model)
  await app.load(await store.workspace())
  const { container } = render(<App app={app} today={() => TODAY} />)
  return { app, root: container, store }
}
```

Tests:

```ts
describe('describe a filter', () => {
  it('hides the button without a model', async () => {
    const { root } = await mount('a\n')
    expect(root.querySelector('.ask-filter')).toBeNull()
  })

  it('puts the answer into the search box', async () => {
    const model = new FakeModel('available', ['+house'])
    const { root } = await mount('a +house\nb +work\n', model)
    await waitFor(() => expect(root.querySelector('.ask-filter')).not.toBeNull())
    fireEvent.click(root.querySelector('.ask-filter')!)
    fireEvent.change(root.querySelector('.ask-filter__text')!, { target: { value: 'house' } })
    fireEvent.submit(root.querySelector('.ask-filter__form')!)
    await waitFor(() => expect(root.querySelector<HTMLInputElement>('.search')?.value).toBe('+house'))
    expect(root.querySelector('.ask-filter__form')).toBeNull()
    expect(root.querySelectorAll('.task')).toHaveLength(1)
  })

  it('keeps the form open with the error', async () => {
    const model = new FakeModel('downloadable', ['+house |', '|'])
    const { root } = await mount('a +house\n', model)
    await waitFor(() => expect(root.querySelector('.ask-filter')).not.toBeNull())
    fireEvent.click(root.querySelector('.ask-filter')!)
    fireEvent.change(root.querySelector('.ask-filter__text')!, { target: { value: 'house' } })
    fireEvent.submit(root.querySelector('.ask-filter__form')!)
    await waitFor(() => expect(root.querySelector('.ask-filter__form .query-error')).not.toBeNull())
    expect(root.querySelector('.ask-filter__form .query-error')?.textContent).toBe('Unexpected |')
    expect(root.querySelector<HTMLInputElement>('.search')?.value).toBe('')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/ui/App.test.tsx -t "describe a filter"`
Expected: the last two fail (no `.ask-filter`).

- [ ] **Step 3: Write the component**

`src/ui/AskFilter.tsx`:

```tsx
import { observer } from 'mobx-react-lite'
import { useState } from 'react'
import type { TodoomApp } from '../app/state'

/** A ✦ button that turns into a description box; the model's query lands in the search. */
export const AskFilter = observer(function AskFilter({ app }: { app: TodoomApp }) {
  const [text, setText] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { model, modelProgress } = app.state

  if (model === 'unknown' || model === 'unavailable') return null

  if (text === null) {
    return (
      <button className="ask-filter" aria-label="Describe a filter" onClick={() => setText('')}>
        ✦
      </button>
    )
  }

  const close = () => {
    setText(null)
    setError(null)
  }

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
    modelProgress !== null ? `Downloading model… ${Math.round(modelProgress * 100)}%` : 'Thinking…'

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
        placeholder="Describe a filter…"
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
```

The `try/catch` here is the boundary where a rejected promise becomes text on screen — a form has no caller to bubble to. It is the one exception to "the only try/catch is in `translate`", and the reviewer should treat it as the equivalent of `queryError`.

- [ ] **Step 4: Mount it in the sidebar**

In `src/ui/Sidebar.tsx`, add `import { AskFilter } from './AskFilter'` and, directly after the `<input className="search" … />` element:

```tsx
      <AskFilter app={app} />
```

- [ ] **Step 5: Style it**

In `src/ui/styles.css`, after the `.save-filter__name` rule:

```css
.ask-filter { margin-top: 6px; font-size: 13px; }

.ask-filter__form { margin-top: 6px; }

.ask-filter__text { width: 100%; }

.ask-filter__status { margin: 4px 0 0; font-size: 12px; color: var(--muted); }
```

- [ ] **Step 6: Run the tests and the type check**

Run: `npx vitest run src/ui && npx tsc --noEmit`
Expected: all pass; tsc clean.

- [ ] **Step 7: Commit**

```bash
git add src/ui/AskFilter.tsx src/ui/Sidebar.tsx src/ui/styles.css src/ui/App.test.tsx
git commit -m "feat: describe a filter in plain language"
```

---

### Task 5: End-to-end scenario, roadmap, gate

**Files:**
- Modify: `e2e/fixture.tsx` (pass a `FakeModel`)
- Modify: `e2e/todoom.spec.ts` (append one test)
- Modify: `docs/roadmap.md` (remove the "Natural-language filters via on-device AI" section)

**Interfaces:**
- Consumes: `FakeModel` (Task 2), the `.ask-filter*` selectors (Task 4).

- [ ] **Step 1: Give the fixture a model**

In `e2e/fixture.tsx`, add `import { FakeModel } from '../src/app/fakeModel'` and change the construction to:

```ts
  const model = new FakeModel('available', ['+house & (A)'])
  const app = new TodoomApp(store, () => TODAY, model)
```

- [ ] **Step 2: Write the scenario**

Append to `e2e/todoom.spec.ts`:

```ts
test('describes a filter and gets a query in the search box', async ({ page }) => {
  await page.goto(PAGE)
  await page.click('.ask-filter')
  await page.fill('.ask-filter__text', 'urgent house stuff')
  await page.keyboard.press('Enter')
  await expect(page.locator('.search')).toHaveValue('+house & (A)')
  await expect(page.locator('.ask-filter__form')).toHaveCount(0)
  await expect(page.locator('.task')).toHaveCount(1)
  await expect(page.locator('.save-filter')).toBeVisible()
})
```

- [ ] **Step 3: Run it**

Run: `npx playwright test`
Expected: 12 passed.

- [ ] **Step 4: Remove the roadmap entry**

In `docs/roadmap.md`, delete the whole `## Natural-language filters via on-device AI` section (heading through the `Builds on …` line and the blank line after it). The remaining sections are Columns view and Gantt chart.

- [ ] **Step 5: Full gate**

Run: `npx tsc --noEmit && npx vitest run && npx playwright test && npm run build`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add e2e/fixture.tsx e2e/todoom.spec.ts docs/roadmap.md
git commit -m "test: end-to-end natural-language filter; drop it from the roadmap"
```
