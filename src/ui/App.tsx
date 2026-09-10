import type { TodoomApp } from '../app/state'
import { AddForm } from './AddForm'
import { Sidebar } from './Sidebar'
import { TaskList } from './TaskList'
import { useApp } from './useApp'

export function App({ app, today }: { app: TodoomApp; today: () => string }) {
  useApp(app)

  return (
    <div className="app">
      <Sidebar app={app} />
      <main className="main">
        <AddForm app={app} />
        <TaskList app={app} today={today()} />
      </main>
    </div>
  )
}
