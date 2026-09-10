import type { FileRef, TodoStore } from '../drive/store'
import type { TodoomApp } from './state'

const KEY = 'todoom.workspace'

/** The Todoom folder in Drive and the todo file inside it. */
export interface Workspace {
  folder: FileRef
  todo: FileRef
}

export function saveWorkspace(workspace: Workspace): void {
  localStorage.setItem(KEY, JSON.stringify(workspace))
}

function isRef(value: unknown): value is FileRef {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as FileRef).id === 'string' &&
    typeof (value as FileRef).name === 'string'
  )
}

export function loadWorkspace(): Workspace | null {
  const raw = localStorage.getItem(KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { folder?: unknown; todo?: unknown }
    if (isRef(parsed.folder) && isRef(parsed.todo)) {
      return { folder: parsed.folder, todo: parsed.todo }
    }
    return null
  } catch {
    return null
  }
}

export function clearWorkspace(): void {
  localStorage.removeItem(KEY)
}

export async function openWorkspace(
  store: Pick<TodoStore, 'findOrCreateFolder' | 'findOrCreateFileIn'>,
): Promise<Workspace> {
  const saved = loadWorkspace()
  if (saved) return saved
  const folder = await store.findOrCreateFolder('Todoom')
  const todo = await store.findOrCreateFileIn(folder, 'todo.txt')
  const workspace = { folder, todo }
  saveWorkspace(workspace)
  return workspace
}
export function createDebouncedSaver(
  app: TodoomApp,
  delayMs: number,
): { schedule(): void; flush(): Promise<void> } {
  let timer: ReturnType<typeof setTimeout> | null = null

  const clear = () => {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }

  return {
    schedule(): void {
      clear()
      timer = setTimeout(() => {
        timer = null
        void app.save()
      }, delayMs)
    },
    async flush(): Promise<void> {
      clear()
      await app.save()
    },
  }
}
