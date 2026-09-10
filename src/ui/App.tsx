import { observer } from 'mobx-react-lite'
import type { TodoomApp } from '../app/state'
import { AddTask } from './AddTask'
import { Sidebar } from './Sidebar'
import { TaskList } from './TaskList'

export const App = observer(function App({
  app,
  today,
}: {
  app: TodoomApp
  today: () => string
}) {
  return (
    <div className="app">
      <Sidebar app={app} />
      <main className="main">
        <AddTask app={app} today={today()} />
        <TaskList app={app} today={today()} />
      </main>
    </div>
  )
})
