import { useState } from 'react'
import type { TodoomApp } from '../app/state'

export function AddForm({ app }: { app: TodoomApp }) {
  const [text, setText] = useState('')

  return (
    <form
      className="add-form"
      onSubmit={(event) => {
        event.preventDefault()
        app.addTask(text)
        setText('')
      }}
    >
      <input
        className="add-input"
        placeholder="(A) Call plumber +house @phone due:2026-09-12"
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      <button>Add</button>
    </form>
  )
}
