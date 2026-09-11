import { observer } from 'mobx-react-lite'
import { useEffect, useState } from 'react'
import type { TodoomApp } from '../app/state'
import { AddTask } from './AddTask'
import { Sidebar } from './Sidebar'
import { TaskList } from './TaskList'
import { Stats } from './Stats'
import { Columns } from './Columns'
import { Gantt } from './Gantt'
import { SearchModal } from './SearchModal'
import { TaskModal } from './TaskModal'

function typing(): boolean {
  const el = document.activeElement
  if (!(el instanceof HTMLElement)) return false
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable
}

export const App = observer(function App({
  app,
  today,
}: {
  app: TodoomApp
  today: () => string
}) {
  const [searchOpen, setSearchOpen] = useState(false)
  const [picked, setPicked] = useState<number | null>(null)

  const openSearch = () => {
    if (app.state.page !== 'tasks') app.showPage('tasks')
    setSearchOpen(true)
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const palette = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k'
      const slash = event.key === '/' && !typing()
      if (!palette && !slash) return
      // Any open dialog, including this one, owns the keyboard.
      if (document.querySelector('[role="dialog"]')) return
      event.preventDefault()
      openSearch()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const pickedTask = picked !== null ? app.state.tasks[picked] : undefined

  return (
    <div className="app">
      <Sidebar app={app} onSearch={openSearch} />
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
      {searchOpen && (
        <SearchModal
          app={app}
          today={today()}
          onClose={() => setSearchOpen(false)}
          onPick={(index) => {
            setSearchOpen(false)
            setPicked(index)
          }}
        />
      )}
      {pickedTask && (
        <TaskModal app={app} task={pickedTask} today={today()} onClose={() => setPicked(null)} />
      )}
    </div>
  )
})
