import './ui/styles.css'
import { reaction } from 'mobx'
import { createRoot } from 'react-dom/client'
import { TodoomApp } from './app/state'
import { GoogleDriveStore } from './drive/googleStore'
import type { TodoStore } from './drive/store'
import { App } from './ui/App'
import { SignIn } from './ui/SignIn'
import { loadLocale, t, type Locale } from './ui/i18n'
import { filterFromQuery } from './app/urlState'
import { syncFilterHistory } from './app/urlHistory'
import { clearWorkspace, createDebouncedSaver, openWorkspace, type Workspace } from './app/session'
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

function start(store: TodoStore, workspace: Workspace, locale: Locale): void {
  const app = new TodoomApp(store, todayIso)
  const saver = createDebouncedSaver(app, 2000)

  app.setFilter(filterFromQuery(window.location.search))
  let lastSyncedFilter = app.state.filter

  // The components observe the store themselves, so these reactions only carry
  // the two side effects: push the filter into the address bar, and start the
  // autosave timer once an edit lands.
  reaction(
    () => app.state.filter,
    (filter) => {
      syncFilterHistory(lastSyncedFilter, filter)
      lastSyncedFilter = filter
    },
  )
  reaction(
    () => app.state.saveState,
    (saveState) => {
      if (saveState === 'dirty') saver.schedule()
    },
  )

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
    .load(workspace)
    .then(() => {
      reactRoot.render(<App app={app} today={todayIso} />)
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      if (message.includes('404')) {
        clearWorkspace()
        showSignIn(t(locale, 'signin.gone'), [
          [t(locale, 'signin.reload'), () => window.location.reload()],
        ])
        return
      }
      showSignIn(message, [[t(locale, 'common.retry'), () => window.location.reload()]])
    })
}

function main(): void {
  const store = new GoogleDriveStore()
  const locale = loadLocale()
  document.documentElement.lang = locale

  const failed = (error: unknown) => {
    showSignIn(error instanceof Error ? error.message : String(error), [
      [t(locale, 'common.retry'), () => window.location.reload()],
    ])
  }

  function offerConnect(reason?: string): void {
    const base = t(locale, 'signin.intro')
    showSignIn(reason ? `${base} (${reason})` : base, [
      // A full navigation, not a fetch: the backend answers with a redirect to
      // Google, and only a top-level load can follow it.
      [t(locale, 'signin.connect'), () => window.location.assign('/auth/start')],
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
    .then(() => openWorkspace(store))
    .then((workspace) => start(store, workspace, locale))
    .catch((cause: unknown) => {
      if (cause instanceof SignedOutError) {
        offerConnect(error ? t(locale, 'signin.failed', { error }) : undefined)
        return
      }
      failed(cause)
    })
}

main()
