import '../src/ui/styles.css'
import { TodoomApp } from '../src/app/state'
import { FakeStore } from '../src/drive/fakeStore'
import { render } from '../src/ui/render'

const TODAY = '2026-09-10'

async function main(): Promise<void> {
  const root = document.querySelector<HTMLDivElement>('#app')
  if (!root) throw new Error('missing #app')

  const store = new FakeStore({
    'todo.txt': '(A) Call plumber +house @phone\nBuy milk +groceries\n',
  })
  await store.signIn()
  const app = new TodoomApp(store, () => TODAY)
  await app.load(store.refFor('todo.txt'))

  const draw = () => render(root, app, TODAY)
  app.subscribe(() => {
    void app.save()
  })
  draw()
}

void main()
