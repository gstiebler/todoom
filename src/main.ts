import './ui/styles.css'
import { TodoomApp } from './app/state'
import { GoogleDriveStore } from './drive/googleStore'
import type { FileRef, TodoStore } from './drive/store'
import { render } from './ui/render'
import { filterFromQuery, filterToQuery } from './app/urlState'
import { clearFileRef, createDebouncedSaver, loadFileRef, saveFileRef } from './app/session'

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

function start(store: TodoStore, ref: FileRef): void {
  const app = new TodoomApp(store, todayIso)
  const saver = createDebouncedSaver(app, 2000)

  app.setFilter(filterFromQuery(window.location.search))

  const syncUrl = () => {
    const query = filterToQuery(app.state.filter)
    const url = query ? `${window.location.pathname}?${query}` : window.location.pathname
    window.history.replaceState(null, '', url)
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

  app
    .load(ref)
    .then(draw)
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      if (message.includes('404')) {
        clearFileRef()
        showSignIn('That file is gone from Drive. Choose another.', [
          ['Reload', () => window.location.reload()],
        ])
        return
      }
      showSignIn(message, [['Retry', () => window.location.reload()]])
    })
}

async function chooseFile(store: TodoStore): Promise<void> {
  showSignIn('Choose where your tasks live.', [
    [
      'Create todo.txt in Drive',
      () => {
        void store.createFile('todo.txt').then((ref) => {
          saveFileRef(ref)
          start(store, ref)
        })
      },
    ],
    [
      'Open an existing file',
      () => {
        void store.pickFile().then((ref) => {
          if (!ref) return
          saveFileRef(ref)
          start(store, ref)
        })
      },
    ],
  ])
}

function main(): void {
  let store: TodoStore
  try {
    store = new GoogleDriveStore()
  } catch (error) {
    showSignIn(error instanceof Error ? error.message : String(error), [])
    return
  }

  showSignIn('Todoom keeps your tasks in a todo.txt file in your Google Drive.', [
    [
      'Connect to Drive',
      () => {
        void store
          .signIn()
          .then(() => {
            const ref = loadFileRef()
            if (ref) start(store, ref)
            else void chooseFile(store)
          })
          .catch((error: unknown) => {
            showSignIn(error instanceof Error ? error.message : String(error), [
              ['Retry', () => window.location.reload()],
            ])
          })
      },
    ],
  ])
}

main()
