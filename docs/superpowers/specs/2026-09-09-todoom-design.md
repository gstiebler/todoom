# Todoom — Design Spec

Date: 2026-09-09
Status: Draft for review

## 1. Summary

Todoom is a browser-based task manager whose entire data model is a single
plain-text `todo.txt` file living in the user's Google Drive. There is no
database and no application server. The browser reads the file, holds it in
memory, and writes it back.

The file stays the source of truth. A user can open `todo.txt` in any text
editor, in Google Docs, or in another todo.txt client, and Todoom will pick up
the change on its next load.

## 2. Goals and non-goals

### Goals

- Full support for the todo.txt format rules, including completion, priority,
  creation and completion dates, projects, contexts, and `key:value` pairs.
- Filter by project, context, and priority; free-text search.
- `due:` dates with an overdue/today view.
- `rec:` recurring tasks that respawn on completion.
- Archiving completed tasks to a companion `done.txt`.
- Runs as a static site with no backend of any kind.
- Narrowest practical Google Drive permission.

### Non-goals

- Multi-user collaboration, sharing, or presence.
- Offline use. The app requires a network connection; a service worker and
  offline queue are explicitly out of scope.
- Merging concurrent edits. See section 7.
- Mobile-native apps. The layout is responsive, but the deliverable is a web page.
- Attachments, subtasks, reminders, notifications, or calendar integration.
- Multiple todo files or workspaces. Todoom manages exactly one `todo.txt`
  and its companion `done.txt`.

## 3. Architecture

A single-page application served as static files. Three layers, each usable and
testable on its own.

### 3.1 Core (`src/core/`)

Pure functions over strings and plain objects. No DOM, no network, no clock
except through an injected `today` value. This is where the todo.txt rules live,
and it is the part that gets the densest tests.

- `parse.ts` — `parseLine(text): Task`, `parseFile(text): Task[]`
- `format.ts` — `formatTask(task): string`, `formatFile(tasks): string`
- `query.ts` — filtering, searching, and sorting over `Task[]`
- `recurrence.ts` — `nextOccurrence(task, completedOn): Task | null`
- `archive.ts` — `splitCompleted(tasks): { keep, archive }`

### 3.2 Drive adapter (`src/drive/`)

The only code that talks to Google. Exposes a narrow interface so the core and
UI never see an access token.

```
interface TodoStore {
  signIn(): Promise<void>
  signOut(): void
  createFile(name: string): Promise<FileRef>
  findOrCreateRootFile(name: string): Promise<FileRef>
  findOrCreateSibling(ref: FileRef, name: string): Promise<FileRef>
  read(ref: FileRef): Promise<{ text: string; modifiedTime: string }>
  write(ref: FileRef, text: string): Promise<{ modifiedTime: string }>
}
```

`FileRef` is `{ id, name }`. Nothing above this layer knows about Drive.

### 3.3 UI (`src/ui/`)

Renders the task list, the filter bar, and the editor. Holds the in-memory
`Task[]` and a dirty flag. Calls the store on load, on save, and on archive.

### 3.4 Stack

Vite, TypeScript, no UI framework, no state library. The app is a list, a form,
and a filter bar; a framework would be more machinery than the problem needs.
Vitest for the core tests. Styling is hand-written CSS with a small set of
custom properties, supporting light and dark via `prefers-color-scheme`.

## 4. The todo.txt format

Todoom implements the format rules as published at todotxt.org. One task per
line. Blank lines are ignored on read and never written.

### 4.1 Incomplete task grammar

```
[(A) ][2026-09-09 ]description
```

- Priority, if present, is a single uppercase letter in parentheses at the very
  start, followed by a space.
- Creation date, if present, is `YYYY-MM-DD` and comes after the priority.
- A creation date may only appear if it is the first token after any priority.

### 4.2 Completed task grammar

```
x [2026-09-10 ][2026-09-09 ]description
```

- A completed line starts with a lowercase `x` and a space.
- The completion date directly follows. If a completion date is present, the
  creation date follows it. A creation date is preserved through completion.
- Todoom preserves the original priority on completion by rewriting `(A) ` as a
  `pri:A` key-value pair, which is the common convention and keeps the
  information recoverable when the task is un-completed.

### 4.3 Tokens inside the description

- `+project` — a project tag. Any non-whitespace run after `+`.
- `@context` — a context tag.
- `key:value` — a key-value pair. The key and value contain no whitespace and
  no colon; the first colon separates them.

Tokens may appear anywhere in the description and are kept in place in the raw
text. The parser records them; the formatter never reorders the description.

### 4.4 Parsing rule

Parsing never fails. Any line that does not match the grammar is a task whose
whole text is the description. Round-tripping is the invariant that matters:
for any input line, `formatTask(parseLine(line)) === line`, except that Todoom
normalizes internal runs of whitespace to a single space. This invariant gets a
property test over generated lines.

### 4.5 Task shape

```
interface Task {
  raw: string            // original line, for round-trip fidelity
  completed: boolean
  priority?: string      // "A".."Z"
  completionDate?: string
  creationDate?: string
  description: string
  projects: string[]
  contexts: string[]
  pairs: Record<string, string>
}
```

## 5. Google Drive integration

### 5.1 Auth

Authorization code flow, run by a **backend-for-frontend**: a Cloudflare Worker
that serves the static app and four auth routes from one origin.

Scope: `https://www.googleapis.com/auth/drive.file` only. This grants access to
files the app creates. Todoom can never see the rest of the user's Drive.

**Why a backend at all.** The browser-only version could not hold a refresh
token: the code flow requires a client secret at Google's token endpoint, and a
secret shipped to a page is not a secret. Without a refresh token the session
died with the one-hour access token, so the app had to bounce the user through
Google again — a page reload that risked discarding unsaved edits, and that
failed outright for a user signed into several Google accounts. A server can
keep a secret, so it can hold a refresh token and mint access tokens on demand.

**Why one origin.** A session cookie set by any origin other than the one
serving the app is a third-party cookie, which Safari's ITP and Edge's tracking
prevention block. Serving the app from the Worker makes the cookie first-party.
This is a requirement, not a convenience.

| Route | Behaviour |
| --- | --- |
| `GET /auth/start` | Redirect to Google with `access_type=offline` and `prompt=consent`; `state` nonce in a ten-minute cookie |
| `GET /auth/callback` | Verify `state`, exchange the code, set the session cookie, redirect to `/` |
| `GET /api/token` | Mint an access token from the refresh token; `401 signed_out` if the cookie is missing, forged, or dead |
| `POST /auth/logout` | Revoke at Google and clear the cookie |

`prompt=consent` is required, not cosmetic: without `access_type=offline`
Google returns no refresh token, and without a forced consent it returns one
only on a user's very first authorization, so a reconnecting user would
silently get a session that dies in an hour.

**The session is the refresh token, encrypted.** Rather than key a database row
by a session id, the Worker seals the refresh token with AES-GCM under
`SESSION_SECRET` and puts the ciphertext in the cookie. The Worker is stateless:
no database to run, back up or migrate, and the design already works for many
users. The trades, both acceptable now and both a KV binding away later:
rotating the key signs everyone out, and a single user cannot be revoked
server-side.

The cookie is `HttpOnly`, `Secure`, `SameSite=Lax`, one year. `HttpOnly` is what
makes this safer than the previous design: an XSS bug can no longer reach the
credential. `SameSite=Lax` is required so the cookie survives Google's
cross-site redirect back to `/auth/callback`. `Secure` is set unconditionally;
browsers treat loopback as a trustworthy origin, so local development works.

**In the browser.** The access token is still held in memory only, never in
`localStorage`, `sessionStorage` or a cookie. Renewal is no longer an event to
schedule: the store asks for a token before every request and reuses the cached
one until a minute before expiry. A 401 from Drive forces one renewal and one
retry, which distinguishes a stale token from a dead session. Only a second 401,
or a 403, surfaces as signed out. There is no redirect, so no page reload, so
nothing to interrupt an unsaved edit.

The client secret and `SESSION_SECRET` live only in Worker secrets and in a
git-ignored `.dev.vars`. Neither is ever sent to the browser.

### 5.2 Creating the file

After the user authorizes Drive access, Todoom looks for a `todo.txt` that it
previously created in the root of My Drive. If none exists, it creates one
there automatically. There is no file picker or second setup step.

Because the app creates the file, `drive.file` covers it without granting
access to unrelated Drive files. The file stays visible in My Drive and can be
opened by text editors and other todo.txt clients.

The chosen `FileRef` is stored in `localStorage` so subsequent visits skip this
lookup. If local storage is cleared or Todoom is opened in another browser, the
app finds the file it created before creating a new one. The file id is not a
secret; it is useless without a token.

`done.txt` is created lazily in the same parent folder as `todo.txt`, the first
time the user archives.

### 5.3 Reading and writing

Read is `GET /drive/v3/files/{id}?alt=media`. Write is a media upload to
`PATCH /upload/drive/v3/files/{id}?uploadType=media`. Both return
`modifiedTime`, which the app records.

Files are read and written as UTF-8 with `\n` line endings. A trailing newline
is written. A file that arrives with `\r\n` endings is normalized to `\n` on the
next save, silently.

### 5.4 Deployment

The app is deployed to GitHub Pages from `github.com/gstiebler/todoom`, built
by a GitHub Actions workflow on every push to `main`. The published origin is
`https://gstiebler.github.io`, with the app served under the `/todoom/` path.
Vite's `base` is set to `/todoom/` so asset URLs resolve correctly.

The Google Drive API and these Google Cloud settings must exist before sign-in
works:

- Authorized JavaScript origin `https://gstiebler.github.io` for the deployed
  app, and `http://localhost:5173` for local development.
- The OAuth consent screen configured as an External app with the
  `drive.file` scope. It may stay in Testing mode with the developer's own
  account added as a test user, which avoids Google's verification review
  entirely for a single-user app.

The OAuth client id is not a secret. It is injected into the build through the
`VITE_GOOGLE_CLIENT_ID` repository variable. There is no API key or client
secret.

## 6. Saving

Autosave, debounced 2 seconds after the last edit. A save also fires on window
blur and on `visibilitychange` to hidden, so switching tabs commits the work.

A `beforeunload` handler warns if a save is still pending. It cannot reliably
complete the request, so it only warns.

The status line shows one of: `Saved`, `Saving…`, `Unsaved changes`, or an
error. Errors are shown verbatim with a Retry button; the in-memory list is
never discarded because a write failed.

## 7. Concurrency: last write wins

If the file changes in Drive between Todoom's load and its next save, Todoom
overwrites it. Edits made elsewhere in that window are lost.

This is a deliberate choice for the first version, and it is the single largest
known sharp edge in this design. Two things soften it without adding a merge
engine:

- Todoom re-reads the file on window focus when there are no unsaved local
  changes, so a passive tab picks up outside edits rather than sitting on a
  stale copy.
- Before a save, Todoom compares the file's current `modifiedTime` against the
  one it loaded. On a mismatch it still saves, but it first writes the version
  it is about to overwrite into a sibling file named
  `todo.conflict-YYYY-MM-DDTHH-MM-SS.txt`. Nothing is silently destroyed, and
  recovery is a manual copy-paste rather than a lost afternoon.

Real merging is the obvious follow-up if this proves annoying in practice.

## 8. Features

### 8.1 List and edit

The list shows one row per task: a completion checkbox, the priority, the
description with projects and contexts styled as chips, and the due date if
present. Clicking a row opens inline editing of the raw line, which keeps the
plain-text model visible rather than hiding it behind form fields.

Adding a task is a single text input. Typed text is parsed with the same
parser, so `(A) Call plumber +house @phone due:2026-09-12` works as typed. A
creation date is stamped automatically unless the typed line already has one.

Completing a task prepends `x` and today's date, moves any priority to `pri:`,
and, if the task recurs, appends the next occurrence.

### 8.2 Sorting

Default sort: incomplete before complete, then priority ascending with
un-prioritized last, then due date ascending with undated last, then original
file order. Sort is a view concern only. The file's line order on disk is never
changed by sorting; new tasks are appended.

### 8.3 Filter and search

A filter bar with project, context, and priority selectors, populated from the
tasks actually present. Filters combine with AND across categories and OR
within a category. A free-text box matches a case-insensitive substring against
the raw line.

Completed tasks are hidden by default, with a toggle to show them.

Filter state lives in the URL query string, so a filtered view is bookmarkable
and survives a reload.

### 8.4 due:

`due:YYYY-MM-DD`. A malformed value is left alone as an ordinary key-value pair
and does not participate in date logic.

Three quick views sit above the list: Overdue, Today, and Upcoming (the next
seven days). These are filters, not separate screens. Overdue and today's rows
carry a colour accent that is paired with a text label, so the state does not
rely on colour alone.

### 8.5 rec:

`rec:` takes `+?<n><unit>` where unit is one of `d`, `w`, `m`, `y`.

- `rec:1w` — non-strict. The next due date is one week from the completion date.
- `rec:+1w` — strict. The next due date is one week from the previous due date,
  regardless of when the task was actually completed. This keeps a weekly
  obligation anchored to its day.

On completing a recurring task, Todoom appends a new incomplete task: same
description, same priority, creation date of today, and the computed `due:`.
The completed line stays in place as a record.

Month and year arithmetic clamps to the end of the month, so one month after
January 31 is February 28 or 29.

A recurring task with no `due:` uses the completion date as the anchor.

### 8.6 done.txt archiving

An "Archive completed" action moves every completed task out of `todo.txt` and
appends it to `done.txt` in the same folder. The order is: write `done.txt`
first, then rewrite `todo.txt`. If the second write fails, the tasks exist in
both files, which is recoverable; the reverse order could lose them outright.

Archiving is manual. There is no automatic sweep.

## 9. Error handling

Errors bubble. The core parser is the one place that swallows a malformed
input, and it does so by design, because a todo.txt file with a weird line is
not an error condition.

Everything else, network failures included, propagates to a single top-level
handler that renders the message in the status line and leaves the in-memory
state untouched. Specific cases worth naming:

- **401 or 403 on a request.** One renewal and retry happens first. If that
  also fails the session is genuinely gone: offer to reconnect.
- **404 on the file.** The file was deleted or unshared. Clear the cached
  `FileRef` and return to the create-or-pick screen, keeping the in-memory
  tasks so the user can save them somewhere new.
- **Write failure.** Keep the dirty flag set and offer Retry.

## 10. Testing

- **Core, unit.** Parsing and formatting for every rule in section 4, including
  the odd ones: a bare `x` that is not a completion marker, a priority that is
  not at position zero, a colon inside a URL, a date-shaped word that is not in
  the date position.
- **Core, property.** Round-trip: parse then format equals the normalized
  input, over generated lines.
- **Recurrence.** Strict versus non-strict, month-end clamping, missing due
  date, malformed `rec:` values.
- **Query.** Filter combination logic and sort ordering.
- **Drive adapter.** Tested against a fake implementing the `TodoStore`
  interface. Nothing in the test suite touches the network.
- **End to end.** Playwright over the fake store: sign in, add, complete,
  filter, archive.

## 11. Resolved decisions

- **Product name.** Todoom. It is the page title, the repository name, and the
  name shown on the Google consent screen.
- **Deployment.** GitHub Pages at `https://gstiebler.github.io/todoom/`. See
  section 5.4.
- **File count.** Exactly one `todo.txt` and one `done.txt`. No workspace
  switcher, no multi-file support. Todoom finds or creates `todo.txt`
  automatically in the visible My Drive root.
- **Format.** Plain todo.txt rather than JSON. The deciding factor is
  interoperability: the file must remain readable by other todo.txt clients and
  editable by hand, which is the reason a file backend was chosen over a
  datastore at all.

## 12. Assumptions

Recorded because they were made without confirmation and each would change the
work if wrong.

- Single user, typically one device at a time. Last-write-wins is acceptable
  because of this.
- Modern evergreen browser. No transpilation targets beyond Vite's defaults.
- English-only interface, with dates displayed in ISO form to match the file.
- Todoom is a single-user app for its author. The OAuth consent screen stays
  in Testing mode with that one account as a test user, so Google's
  verification review never applies. Opening Todoom to other users would
  require publishing the consent screen, at which point the unverified-app
  warning appears until verification completes.
