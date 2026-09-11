# Natural-language filters via on-device AI

An option to describe a filter in plain language and have Chrome's built-in
model (the Prompt API, `LanguageModel`) turn it into a smart-filter query. The
query lands in the search box, where it can be read, edited, and saved as a
filter through the existing flow. Nothing leaves the device; the feature is
hidden where the model does not exist.

Builds on [Smart filters](2026-09-10-smart-filters-design.md).

## Scope

- Backend: Chrome's Prompt API only. Native iOS/Android model APIs need a
  native shell that does not exist; the adapter interface below is the seam
  for them, and no code is written for them now.
- Approach: prompt the model for a query string, validate with `parseQuery`,
  retry once with the parse error, then give up with that error. No
  structured output, no grammar constraints.
- Nothing pre-existing is migrated.

## Units

### `src/core/nlPrompt.ts` — pure

```ts
export interface Vocabulary {
  projects: string[]
  contexts: string[]
}

/** The system prompt: grammar, rules, examples, and the user's own labels. */
export function buildPrompt(vocab: Vocabulary, today: string): string

/** The follow-up when the first answer did not parse. */
export function retryPrompt(query: string, error: string): string
```

`buildPrompt` contains:

- the grammar cheat-sheet: every term form from the smart-filters spec
  (`word`, `+project`, `@context`, `(A)`/`pri:A`, `no pri`, `due:<date>`,
  `due before:`/`due after:`, `due:none`/`no date`, `due:overdue`/`overdue`,
  the same for `deadline:`, `done`, `blocked`, `rec`), the operators
  `!`, `&`, `|`, parentheses, and that juxtaposition means `&`;
- rules: reply with exactly one line and nothing else — no prose, no quotes,
  no code fences; dates as `today`, `tomorrow`, `yesterday`, or `YYYY-MM-DD`
  (today's date is given so "next Friday" can be resolved); use only projects
  and contexts from the list, otherwise plain words;
- the vocabulary, one line each: `Projects: +work +house`, `Contexts: @phone`
  (the line is omitted when the list is empty);
- about ten examples, one per term family, for instance:

  | Description | Query |
  |---|---|
  | things I have to do today | `due:today` |
  | overdue work tasks | `+work & overdue` |
  | high priority and not blocked | `(A) & !blocked` |
  | anything without a date | `no date` |
  | house or garden | `+house \| +garden` |
  | repeating chores | `rec` |
  | finished tasks | `done` |
  | deadline this week | `deadline before:<today + 7>` |
  | call mom | `call mom` |

`retryPrompt(query, error)` is:
`That answer, "<query>", is not valid: <error>. Reply with only the corrected query.`

### `src/app/languageModel.ts` — the adapter

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

export const chromeModel: LanguageModelAdapter
```

`chromeModel` is the only code that knows about `window.LanguageModel`. It
declares the global's shape itself (a minimal `declare global` block — no
`@types` package). `availability()` returns `'unavailable'` when the global is
missing. `create` calls `LanguageModel.create({ initialPrompts: [{ role:
'system', content: system }], temperature: 0, topK: 1, monitor })`, wiring the
`downloadprogress` event to `onProgress(event.loaded)`. Errors from
`LanguageModel.create` and `prompt` bubble.

### `src/app/state.ts`

- Constructor gains a third parameter: `model: LanguageModelAdapter = chromeModel`.
  Like `store` and `today`, it is a collaborator and excluded from
  `makeAutoObservable`.
- Observable `state.model: Availability | 'unknown'`, initially `'unknown'`;
  the constructor kicks off `model.availability()` and stores the result via
  `runInAction`.
- Observable `state.modelProgress: number | null` (`null` when not
  downloading).
- `private session: ModelSession | null = null`, kept for the app's lifetime.
- `async translate(description: string): Promise<void>`:
  1. `const vocab = { projects: collectProjects(tasks), contexts: collectContexts(tasks) }`
  2. If there is no session: `state.modelProgress = 0`, create one with
     `buildPrompt(vocab, today())`, updating `modelProgress` from the
     callback; `modelProgress = null` when done (also on failure: the
     rejection bubbles after resetting it).
  3. `let query = firstLine(await session.prompt(description))`.
  4. `try { parseQuery(query) } catch (error) { query = firstLine(await
     session.prompt(retryPrompt(query, message))); parseQuery(query) }` — the
     second `parseQuery` throws to the caller on failure.
  5. `this.setFilter({ search: query })`.

  `firstLine` takes the first non-empty line that is not a code fence, and
  strips surrounding backticks or quotes if the model added them.

  The session is created once with the vocabulary of that moment; later label
  changes are not reflected until reload. This is acceptable for a first
  version and keeps the session cache trivial.

### `src/ui/AskFilter.tsx`

Same shape as `SaveFilter`:

- Closed: a `.ask-filter` button, content `✦`, `aria-label="Describe a filter"`.
  Rendered only when `app.state.model` is `available`, `downloadable`, or
  `downloading`.
- Open: `.ask-filter__form` with a text input (`.ask-filter__text`,
  placeholder "Describe a filter…", autofocus), Enter submits, Escape closes.
  While pending, the input is disabled and a status line shows
  `Downloading model… 42%` when `modelProgress !== null`, else `Thinking…`.
  On success the form closes (the query is now in the search box). On failure
  the form stays open and shows `error.message` in a `.query-error` line.

`Sidebar` renders `<AskFilter app={app} />` right after the search input.
`styles.css` gets `.ask-filter`, `.ask-filter__form`, `.ask-filter__text`,
`.ask-filter__status`; the terminal skin block stays last.

## Availability and download

| `state.model` | Button |
|---|---|
| `available` | shown; first use creates the session immediately |
| `downloadable` | shown; first use starts the download (progress shown) |
| `downloading` | shown; first use attaches to the running download |
| `unavailable`, `unknown` | hidden |

Chrome may reject `create()` (user declined, unsupported device). The error
bubbles to the form's error line; the button stays so the user can retry.

## Errors

The only `try/catch` in `app` is around the first `parseQuery` in
`translate`, to drive the single retry. Model and download errors bubble to
the form, which catches the rejected promise to show its message — a form
has no caller to bubble to. No new error types.

## Testing

- `src/core/nlPrompt.test.ts`: the prompt contains today's date, every
  vocabulary label, and the one-line rule; omits the `Projects:`/`Contexts:`
  line when empty; `retryPrompt` contains the query and the error.
- `src/app/state.test.ts`: a `FakeModel` adapter whose `create` records the
  system prompt and returns a session answering from a scripted list. Cases:
  first answer valid → search set; first invalid, second valid → search set
  and the second prompt contains the parse error; both invalid → rejects with
  the parse error and search unchanged; `create` reports progress → `modelProgress`
  goes 0 → 0.5 → null; `create` rejects → `translate` rejects and
  `modelProgress` is `null`; session reused across two calls.
- `src/ui/App.test.tsx`: button hidden when the adapter says `unavailable`;
  shown when `available`; typing a description and pressing Enter puts the
  fake's answer in the search box; an error keeps the form open with the
  message.
- `e2e/todoom.spec.ts`: the fixture constructs `TodoomApp` with a fake
  adapter (always `available`, answers `+house & (A)`); one scenario
  describes a filter and asserts the search box and the task list.

No test calls the real model. The real adapter is exercised manually in
Chrome.
