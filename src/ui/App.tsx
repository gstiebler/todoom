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
import { LocaleProvider } from './locale'

function typing(): boolean {
  const el = document.activeElement
  if (!(el instanceof HTMLElement)) return false
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable
}

export function App(props: { app: TodoomApp; today: () => string }) {
  return (
    <LocaleProvider>
      <Shell {...props} />
    </LocaleProvider>
  )
}

const Shell = observer(function Shell({
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
      const palette =
        (event.metaKey || event.ctrlKey) &&
        !event.shiftKey &&
        !event.altKey &&
        event.key.toLowerCase() === 'k'
      if (palette) {
        // Prevent the browser's own Cmd/Ctrl+K before the dialog guard, so it
        // never fires while a dialog is already open.
        event.preventDefault()
        if (document.querySelector('[role="dialog"]')) return
        openSearch()
        return
      }
      const slash = event.key === '/' && !typing()
      if (!slash) return
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
