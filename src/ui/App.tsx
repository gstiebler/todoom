import { observer } from 'mobx-react-lite'
import type { TodoomApp } from '../app/state'
import { AddTask } from './AddTask'
import { Sidebar } from './Sidebar'
import { TaskList } from './TaskList'
import { Stats } from './Stats'
import { Columns } from './Columns'
import { Gantt } from './Gantt'

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
        {app.state.page === 'stats' ? (
          <Stats app={app} today={today()} />
        ) : app.state.page === 'columns' ? (
          <Columns app={app} today={today()} />
        ) : app.state.page === 'gantt' ? (
          <Gantt app={app} today={today()} />
        ) : (
          <>
            <AddTask app={app} today={today()} />
            <TaskList app={app} today={today()} />
          </>
        )}
      </main>
    </div>
  )
})
