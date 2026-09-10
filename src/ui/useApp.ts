import { useSyncExternalStore } from 'react'
import type { TodoomApp } from '../app/state'

// TodoomApp mutates its state in place, so `app.state` never changes identity
// and cannot signal React that anything happened. The version counter can:
// subscribing to it re-renders the tree on every notify, exactly as the old
// hand-rolled renderer redrew itself.
export function useApp(app: TodoomApp): number {
  return useSyncExternalStore(app.subscribe, app.getVersion, app.getVersion)
}
