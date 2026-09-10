import './ui/styles.css'
import { TodoomApp } from './app/state'
import { GoogleDriveStore } from './drive/googleStore'
import type { FileRef, TodoStore } from './drive/store'
import { render } from './ui/render'
import { filterFromQuery } from './app/urlState'
import { syncFilterHistory } from './app/urlHistory'
import {
  clearFileRef,
  createDebouncedSaver,
  loadFileRef,
  loadOrCreateTodoFile,
} from './app/session'
import {
  buildAuthUrl,
  mayTrySilently,
  parseAuthFragment,
  randomState,
} from './drive/redirectAuth'
import { renewalDecision, RENEW_LEAD_MS } from './app/renewal'
import { SCOPE } from './drive/config'

// Keys are per-tab and hold no credential: a CSRF nonce, the query string to
// restore across the round-trip, and a guard against redirect loops.
const STATE_KEY = 'todoom.authState'
const RETURN_KEY = 'todoom.authReturn'
const TRIED_KEY = 'todoom.silentAuthAt'

// Must match an Authorized redirect URI on the OAuth client exactly. BASE_URL
// is the deployed base path, so this is stable whatever page the user landed on.
function redirectUri(): string {
  return new URL(import.meta.env.BASE_URL, window.location.origin).href
}

const root = document.querySelector<HTMLDivElement>('#app')
if (!root) throw new Error('missing #app element')

function todayIso(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

function showSignIn(message: string, actions: Array<[string, () => void]>): void {
  root!.textContent = ''
  const panel = document.createElement('div')
  panel.className = 'signin'
  const title = document.createElement('h1')
  title.textContent = 'Todoom'
  const text = document.createElement('p')
  text.textContent = message
  panel.append(title, text)
  for (const [label, onClick] of actions) {
    const button = document.createElement('button')
    button.textContent = label
    button.addEventListener('click', onClick)
    panel.appendChild(button)
  }
  root!.appendChild(panel)
}

/** How often to reconsider renewing. Cheap: it is one comparison. */
const RENEWAL_POLL_MS = 15_000

function start(store: TodoStore, ref: FileRef, onRenew?: (app: TodoomApp) => void): void {
  const app = new TodoomApp(store, todayIso)
  const saver = createDebouncedSaver(app, 2000)

  app.setFilter(filterFromQuery(window.location.search))
  let lastSyncedFilter = app.state.filter

  const syncUrl = () => {
    syncFilterHistory(lastSyncedFilter, app.state.filter)
    lastSyncedFilter = app.state.filter
  }

  const draw = () => {
    render(root!, app, todayIso())
    syncUrl()
  }

  // render.ts re-renders itself after UI-driven mutations (it closes over
  // root/app/today), so this subscription only needs to keep the URL and
  // autosave timer in sync with every state change, not force another
  // render — that would double-render and fight render.ts's own focus
  // restoration in the search box.
  app.subscribe(() => {
    if (app.state.saveState === 'dirty') saver.schedule()
    syncUrl()
  })

  // Back/forward changes the query string without going through render.ts's
  // own handlers, so this path does need an explicit render.
  window.addEventListener('popstate', () => {
    app.setFilter(filterFromQuery(window.location.search))
    draw()
  })

  window.addEventListener('blur', () => void saver.flush())
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void saver.flush()
  })
  window.addEventListener('focus', () => {
    void app.refreshIfClean().then(draw)
  })
  window.addEventListener('beforeunload', (event) => {
    if (app.state.saveState === 'dirty' || app.state.saveState === 'saving') {
      event.preventDefault()
      event.returnValue = ''
    }
  })

  if (onRenew) onRenew(app)

  app
    .load(ref)
    .then(draw)
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      if (message.includes('404')) {
        clearFileRef()
        showSignIn('That file is gone from Drive. Reload to create a new todo.txt.', [
          ['Reload', () => window.location.reload()],
        ])
        return
      }
      showSignIn(message, [['Retry', () => window.location.reload()]])
    })
}

function main(): void {
  let store: GoogleDriveStore
  try {
    store = new GoogleDriveStore()
  } catch (error) {
    showSignIn(error instanceof Error ? error.message : String(error), [
      ['Reload', () => window.location.reload()],
    ])
    return
  }

  const failed = (error: unknown) => {
    showSignIn(error instanceof Error ? error.message : String(error), [
      ['Retry', () => window.location.reload()],
    ])
  }

  function beginAuth(mode: 'none' | 'interactive'): void {
    const state = randomState()
    sessionStorage.setItem(STATE_KEY, state)
    sessionStorage.setItem(RETURN_KEY, window.location.search)
    if (mode === 'none') sessionStorage.setItem(TRIED_KEY, String(Date.now()))
    window.location.assign(
      buildAuthUrl({
        clientId: store.clientId(),
        redirectUri: redirectUri(),
        scope: SCOPE,
        state,
        mode,
      }),
    )
  }

  function connect(): void {
    // An explicit click is a fresh mandate: let the silent path be tried again
    // on the next load even if it failed earlier in this tab.
    sessionStorage.removeItem(TRIED_KEY)
    showSignIn('Taking you to Google\u2026', [])
    beginAuth('interactive')
  }

  function offerConnect(reason?: string): void {
    const base = 'Todoom keeps your tasks in a todo.txt file in your Google Drive.'
    showSignIn(reason ? `${base} (${reason})` : base, [['Connect to Drive', connect]])
  }

  // Google sessions outlive the one-hour token by months, so the app can keep
  // itself signed in indefinitely by redirecting again before the token dies —
  // but only at a moment where the reload costs the user nothing.
  function watchForRenewal(app: TodoomApp, expiresAt: number): void {
    const timer = setInterval(() => {
      const active = document.activeElement
      const editing =
        active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement
      const decision = renewalDecision({
        now: Date.now(),
        expiresAt,
        saveState: app.state.saveState,
        editing,
      })
      if (decision !== 'renew') return
      clearInterval(timer)
      beginAuth('none')
    }, RENEWAL_POLL_MS)
  }

  function open(expiresIn: number): void {
    loadOrCreateTodoFile(store)
      .then((ref) =>
        start(store, ref, (app) => {
          // A token too short-lived to schedule against is treated as
          // unrenewable rather than renewed at once, which would redirect in a
          // loop. The 401 path still catches its expiry.
          const lifetimeMs = expiresIn * 1000
          if (lifetimeMs > RENEW_LEAD_MS) watchForRenewal(app, Date.now() + lifetimeMs)
        }),
      )
      .catch(failed)
  }

  const response = parseAuthFragment(window.location.hash)
  if (response.kind !== 'none') {
    const expected = sessionStorage.getItem(STATE_KEY)
    const search = sessionStorage.getItem(RETURN_KEY) ?? ''
    sessionStorage.removeItem(STATE_KEY)
    sessionStorage.removeItem(RETURN_KEY)

    // Strip the token out of the address bar before anything else runs, and put
    // back the filter query string the redirect discarded.
    window.history.replaceState(null, '', window.location.pathname + search)

    if (!expected || response.state !== expected) {
      // A response we did not ask for: someone else's token, or a stale tab.
      offerConnect('That sign-in response did not match this tab.')
      return
    }
    if (response.kind === 'error') {
      // prompt=none reports login_required or interaction_required when the
      // Google session or the grant is gone. Both mean "ask properly".
      offerConnect(`Automatic sign-in failed: ${response.error}`)
      return
    }
    store.setToken(response.accessToken)
    sessionStorage.removeItem(TRIED_KEY)
    open(response.expiresIn)
    return
  }

  // A saved file reference means this browser has connected before, so Google
  // will recognise the grant and bounce straight back. The guard stops a failed
  // attempt from redirecting on every load.
  if (loadFileRef() && mayTrySilently(sessionStorage.getItem(TRIED_KEY), Date.now())) {
    showSignIn('Signing in\u2026', [])
    beginAuth('none')
    return
  }

  offerConnect()
}

main()
