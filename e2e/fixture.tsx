import '../src/ui/styles.css'
import { reaction } from 'mobx'
import { createRoot } from 'react-dom/client'
import { TodoomApp } from '../src/app/state'
import { FakeStore } from '../src/drive/fakeStore'
import { App } from '../src/ui/App'

const TODAY = '2026-09-10'

async function main(): Promise<void> {
  const root = document.querySelector<HTMLDivElement>('#app')
  if (!root) throw new Error('missing #app')

  const store = new FakeStore({
    'todo.txt': '(A) Call plumber +house @phone\nBuy milk +groceries\n',
  })
  await store.signIn()
  const app = new TodoomApp(store, () => TODAY)
  await app.load(await store.workspace())

  // A reaction's effect runs untracked, so it may change state; calling save()
  // from inside an autorun's tracked body would be a write from within a
  // derivation, which MobX rejects.
  reaction(
    () => app.state.saveState,
    (saveState) => {
      if (saveState === 'dirty') void app.save()
    },
  )
  createRoot(root).render(<App app={app} today={() => TODAY} />)
}

void main()
