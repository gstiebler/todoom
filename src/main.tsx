import './ui/styles.css'
import { createRoot } from 'react-dom/client'
import { TodoomApp } from './app/state'
import { GoogleDriveStore } from './drive/googleStore'
import type { FileRef, TodoStore } from './drive/store'
import { App } from './ui/App'
import { SignIn } from './ui/SignIn'
import { filterFromQuery } from './app/urlState'
import { syncFilterHistory } from './app/urlHistory'
import { clearFileRef, createDebouncedSaver, loadOrCreateTodoFile } from './app/session'
import { SignedOutError } from './drive/tokens'

const root = document.querySelector<HTMLDivElement>('#app')
if (!root) throw new Error('missing #app element')

const reactRoot = createRoot(root)

function todayIso(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

function showSignIn(message: string, actions: Array<[string, () => void]>): void {
  reactRoot.render(<SignIn message={message} actions={actions} />)
}

function start(store: TodoStore, ref: FileRef): void {
  const app = new TodoomApp(store, todayIso)
  const saver = createDebouncedSaver(app, 2000)

  app.setFilter(filterFromQuery(window.location.search))
  let lastSyncedFilter = app.state.filter

  const syncUrl = () => {
    syncFilterHistory(lastSyncedFilter, app.state.filter)
    lastSyncedFilter = app.state.filter
  }

  // App subscribes to the same store, so every mutation already redraws.
  // This subscription only keeps the URL and the autosave timer in step.
  app.subscribe(() => {
    if (app.state.saveState === 'dirty') saver.schedule()
    syncUrl()
  })

  window.addEventListener('popstate', () => {
    app.setFilter(filterFromQuery(window.location.search))
  })

  window.addEventListener('blur', () => void saver.flush())
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void saver.flush()
  })
  window.addEventListener('focus', () => {
    void app.refreshIfClean()
  })
  window.addEventListener('beforeunload', (event) => {
    if (app.state.saveState === 'dirty' || app.state.saveState === 'saving') {
      event.preventDefault()
      event.returnValue = ''
    }
  })

  app
    .load(ref)
    .then(() => {
      reactRoot.render(<App app={app} today={todayIso} />)
    })
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
  const store = new GoogleDriveStore()

  const failed = (error: unknown) => {
    showSignIn(error instanceof Error ? error.message : String(error), [
      ['Retry', () => window.location.reload()],
    ])
  }

  function offerConnect(reason?: string): void {
    const base = 'Todoom keeps your tasks in a todo.txt file in your Google Drive.'
    showSignIn(reason ? `${base} (${reason})` : base, [
      // A full navigation, not a fetch: the backend answers with a redirect to
      // Google, and only a top-level load can follow it.
      ['Connect to Drive', () => window.location.assign('/auth/start')],
    ])
  }

  // The backend reports a failed sign-in by bouncing back with ?error=. Take it
  // out of the address bar before the filter parser sees it.
  const params = new URLSearchParams(window.location.search)
  const error = params.get('error')
  if (error) {
    params.delete('error')
    const query = params.toString()
    window.history.replaceState(null, '', window.location.pathname + (query ? `?${query}` : ''))
  }

  store
    .signIn()
    .then(() => loadOrCreateTodoFile(store))
    .then((ref) => start(store, ref))
    .catch((cause: unknown) => {
      if (cause instanceof SignedOutError) {
        offerConnect(error ? `sign-in failed: ${error}` : undefined)
        return
      }
      failed(cause)
    })
}

main()
