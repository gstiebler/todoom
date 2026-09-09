import type { FileRef } from '../drive/store'
import type { TodoomApp } from './state'

const KEY = 'todoom.fileRef'

export function saveFileRef(ref: FileRef): void {
  localStorage.setItem(KEY, JSON.stringify(ref))
}

export function loadFileRef(): FileRef | null {
  const raw = localStorage.getItem(KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as unknown
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as FileRef).id === 'string' &&
      typeof (parsed as FileRef).name === 'string'
    ) {
      return parsed as FileRef
    }
    return null
  } catch {
    return null
  }
}

export function clearFileRef(): void {
  localStorage.removeItem(KEY)
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
