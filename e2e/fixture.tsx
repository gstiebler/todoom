import '../src/ui/styles.css'
import { reaction } from 'mobx'
import { createRoot } from 'react-dom/client'
import { TodoomApp } from '../src/app/state'
import { FakeStore } from '../src/drive/fakeStore'
import { FakeModel } from '../src/app/fakeModel'
import { App } from '../src/ui/App'
import { filterFromQuery } from '../src/app/urlState'
import { syncFilterHistory } from '../src/app/urlHistory'
import { loadSort } from '../src/app/sortPref'

const TODAY = '2026-09-10'

async function main(): Promise<void> {
  const root = document.querySelector<HTMLDivElement>('#app')
  if (!root) throw new Error('missing #app')

  const store = new FakeStore({
    'todo.txt': '(A) Call plumber +house @phone\nBuy milk +groceries\n',
  })
  await store.signIn()
  const model = new FakeModel('available', ['+house & (A)'])
  const app = new TodoomApp(store, () => TODAY, model)
  await app.load(await store.workspace())

  app.setFilter(filterFromQuery(window.location.search, loadSort()))
  let lastSyncedFilter = app.state.filter

  // A reaction's effect runs untracked, so it may change state; calling save()
  // from inside an autorun's tracked body would be a write from within a
  // derivation, which MobX rejects.
  reaction(
    () => app.state.saveState,
    (saveState) => {
      if (saveState === 'dirty') void app.save()
    },
  )
  reaction(
    () => app.state.filter,
    (filter) => {
      syncFilterHistory(lastSyncedFilter, filter)
      lastSyncedFilter = filter
    },
  )
  window.addEventListener('popstate', () => {
    app.setFilter(filterFromQuery(window.location.search, loadSort()))
  })
  createRoot(root).render(<App app={app} today={() => TODAY} />)
}

void main()
