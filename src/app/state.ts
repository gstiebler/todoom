import type { Task } from '../core/types'
import type { Filter } from '../core/query'
import type { FileRef, TodoStore } from '../drive/store'
import { parseFile, parseLine } from '../core/parse'
import { formatFile } from '../core/format'
import { complete, uncomplete, createTask } from '../core/mutate'
import { nextOccurrence } from '../core/recurrence'
import { emptyFilter, filterTasks, sortTasks } from '../core/query'
import { splitCompleted } from '../core/archive'

export type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error'

function isErrorState(state: AppState): boolean {
  return state.saveState === 'error'
}

export interface AppState {
  tasks: Task[]
  filter: Filter
  saveState: SaveState
  error: string | null
  loadedModifiedTime: string | null
}

export class TodoomApp {
  readonly state: AppState = {
    tasks: [],
    filter: emptyFilter(),
    saveState: 'idle',
    error: null,
    loadedModifiedTime: null,
  }

  private listeners = new Set<() => void>()
  private ref: FileRef | null = null
  private revision = 0

  constructor(
    private store: TodoStore,
    private today: () => string,
  ) {}

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private notify(): void {
    for (const listener of this.listeners) listener()
  }

  private markDirty(): void {
    this.revision += 1
    this.state.saveState = 'dirty'
    this.notify()
  }

  private requireRef(): FileRef {
    if (!this.ref) throw new Error('no file loaded')
    return this.ref
  }

  async load(ref: FileRef): Promise<void> {
    const { text, modifiedTime } = await this.store.read(ref)
    this.ref = ref
    this.state.tasks = parseFile(text)
    this.state.loadedModifiedTime = modifiedTime
    this.state.saveState = 'idle'
    this.state.error = null
    this.notify()
  }

  addTask(input: string): void {
    if (input.trim().length === 0) return
    this.state.tasks.push(createTask(input, this.today()))
    this.markDirty()
  }

  editTask(index: number, rawLine: string): void {
    const current = this.state.tasks[index]
    if (!current) return
    if (rawLine.trim().length === 0) {
      this.deleteTask(index)
      return
    }
    this.state.tasks[index] = parseLine(rawLine)
    this.markDirty()
  }

  deleteTask(index: number): void {
    if (!this.state.tasks[index]) return
    this.state.tasks.splice(index, 1)
    this.markDirty()
  }

  toggleComplete(index: number): void {
    const task = this.state.tasks[index]
    if (!task) return
    if (task.completed) {
      this.state.tasks[index] = uncomplete(task)
    } else {
      const today = this.today()
      const next = nextOccurrence(task, today)
      this.state.tasks[index] = complete(task, today)
      if (next) this.state.tasks.push(next)
    }
    this.markDirty()
  }

  setFilter(patch: Partial<Filter>): void {
    this.state.filter = { ...this.state.filter, ...patch }
    this.notify()
  }

  visibleTasks(): Task[] {
    return sortTasks(filterTasks(this.state.tasks, this.state.filter, this.today()))
  }

  indexOf(task: Task): number {
    return this.state.tasks.indexOf(task)
  }

  async save(): Promise<void> {
    if (this.state.saveState !== 'dirty' && this.state.saveState !== 'error') return
    const ref = this.requireRef()
    this.state.saveState = 'saving'
    this.state.error = null
    this.notify()

    try {
      const current = await this.store.getModifiedTime(ref)
      if (this.state.loadedModifiedTime && current !== this.state.loadedModifiedTime) {
        await this.writeConflictCopy(ref)
      }
      const revisionAtWrite = this.revision
      const payload = formatFile(this.state.tasks)
      const { modifiedTime } = await this.store.write(ref, payload)
      this.state.loadedModifiedTime = modifiedTime
      this.state.saveState = revisionAtWrite === this.revision ? 'saved' : 'dirty'
    } catch (error) {
      this.state.saveState = 'error'
      this.state.error = error instanceof Error ? error.message : String(error)
    }
    this.notify()
  }

  private async writeConflictCopy(ref: FileRef): Promise<void> {
    const { text } = await this.store.read(ref)
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const copy = await this.store.findOrCreateSibling(ref, `todo.conflict-${stamp}.txt`)
    await this.store.write(copy, text)
  }

  async refreshIfClean(): Promise<void> {
    if (this.state.saveState === 'dirty' || this.state.saveState === 'error') return
    const ref = this.requireRef()
    const current = await this.store.getModifiedTime(ref)
    if (current === this.state.loadedModifiedTime) return
    await this.load(ref)
  }

  async archive(): Promise<number> {
    const ref = this.requireRef()
    const { keep, archive } = splitCompleted(this.state.tasks)
    if (archive.length === 0) return 0

    const done = await this.store.findOrCreateSibling(ref, 'done.txt')
    const existing = (await this.store.read(done)).text
    await this.store.write(done, existing + formatFile(archive))

    this.state.tasks = keep
    this.state.saveState = 'dirty'
    await this.save()
    if (isErrorState(this.state)) {
      throw new Error(this.state.error ?? 'failed to save todo.txt after archiving')
    }
    return archive.length
  }
}
