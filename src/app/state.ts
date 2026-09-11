import { makeAutoObservable, runInAction } from 'mobx'
import type { Task } from '../core/types'
import type { Filter } from '../core/query'
import type { DriveEntry, FileRef, TodoStore } from '../drive/store'
import type { Workspace } from './session'
import { parseFile, parseLine } from '../core/parse'
import { formatFile } from '../core/format'
import { complete, uncomplete, createTask, addAttachment, removeAttachment } from '../core/mutate'
import { nextOccurrence } from '../core/recurrence'
import { emptyFilter, filterTasks, sortTasks, collectProjects, collectContexts } from '../core/query'
import { splitCompleted } from '../core/archive'
import { ensureId, setDependency } from '../core/deps'
import { parseQuery } from '../core/filterQuery'
import type { SavedFilter } from '../core/filters'
import { formatFilters, parseFilters } from '../core/filters'
import { buildPrompt, retryPrompt } from '../core/nlPrompt'
import type { Availability, LanguageModelAdapter, ModelSession } from './languageModel'
import { chromeModel } from './languageModel'

export type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error'

function isErrorState(state: AppState): boolean {
  return state.saveState === 'error'
}

/** The model is asked for one line; this forgives fences or quotes around it. */
function firstLine(answer: string): string {
  const line = answer
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 0 && !l.startsWith('```')) ?? ''
  return line.replace(/^[`"']+|[`"']+$/g, '').trim()
}

export interface AppState {
  tasks: Task[]
  /** What done.txt held the last time the Stats view asked; null until it does. */
  archived: Task[] | null
  /** What filters.txt holds; null until the workspace has loaded. */
  filters: SavedFilter[] | null
  page: 'tasks' | 'stats'
  filter: Filter
  saveState: SaveState
  error: string | null
  loadedModifiedTime: string | null
  /** Whether the on-device model can be used; 'unknown' until Chrome answers. */
  model: Availability | 'unknown'
  /** Download fraction while the model session is being created, else null. */
  modelProgress: number | null
}

export class TodoomApp {
  readonly state: AppState = {
    tasks: [],
    archived: null,
    filters: null,
    page: 'tasks',
    filter: emptyFilter(),
    saveState: 'idle',
    error: null,
    loadedModifiedTime: null,
    model: 'unknown',
    modelProgress: null,
  }

  /** Every file in the Todoom folder we know the name and link of. */
  readonly attachmentsById = new Map<string, DriveEntry>()

  private workspace: Workspace | null = null
  private revision = 0
  // The last search that parsed, so a half-typed query never empties the list.
  private validSearch = ''
  private session: ModelSession | null = null

  constructor(
    private store: TodoStore,
    private today: () => string,
    private model: LanguageModelAdapter = chromeModel,
  ) {
    // The Drive client, the clock and the model are collaborators, not state;
    // leave them as they are. Everything else is observable, so mutating
    // `state` in place is what tells the UI something happened.
    makeAutoObservable<TodoomApp, 'store' | 'today' | 'model' | 'session'>(this, {
      store: false,
      today: false,
      model: false,
      session: false,
    })
    void this.model.availability().then((availability) => {
      runInAction(() => {
        this.state.model = availability
      })
    })
  }

  private markDirty(): void {
    this.revision += 1
    this.state.saveState = 'dirty'
  }

  private requireWorkspace(): Workspace {
    if (!this.workspace) throw new Error('no file loaded')
    return this.workspace
  }

  private requireRef(): FileRef {
    return this.requireWorkspace().todo
  }

  /** The Drive folder holding todo.txt, done.txt and every attachment. */
  get folder(): FileRef {
    if (!this.workspace) throw new Error('no file loaded')
    return this.workspace.folder
  }

  /** Names and links for the attachments, read from the folder in one call. */
  async loadAttachments(): Promise<void> {
    const entries = await this.store.listFiles(this.attachmentsFolder)
    runInAction(() => {
      for (const entry of entries) this.attachmentsById.set(entry.id, entry)
    })
  }

  /** Uploads each file to the Todoom folder and returns its Drive id. */
  async uploadFiles(files: File[]): Promise<string[]> {
    const folder = this.attachmentsFolder
    const entries: DriveEntry[] = []
    for (const file of files) entries.push(await this.store.uploadFile(folder, file))
    runInAction(() => {
      for (const entry of entries) this.attachmentsById.set(entry.id, entry)
    })
    return entries.map((entry) => entry.id)
  }

  /**
   * Uploads first and edits the line only once every file has an id, so a
   * half-failed batch leaves no reference to a file that isn't there.
   */
  async attachFiles(index: number, files: File[]): Promise<void> {
    if (!this.state.tasks[index]) return
    try {
      const ids = await this.uploadFiles(files)
      runInAction(() => {
        const task = this.state.tasks[index]
        if (!task) return
        this.state.tasks[index] = ids.reduce(addAttachment, task)
        this.markDirty()
      })
    } catch (error) {
      runInAction(() => {
        this.state.error = error instanceof Error ? error.message : String(error)
      })
      return
    }
    await this.save()
  }

  /** Drops the id from the line and moves the Drive file to the trash. */
  async detachFile(index: number, id: string): Promise<void> {
    const task = this.state.tasks[index]
    if (!task) return
    runInAction(() => {
      this.state.tasks[index] = removeAttachment(task, id)
      this.markDirty()
    })
    try {
      await this.store.trashFile(id)
      runInAction(() => {
        this.attachmentsById.delete(id)
      })
    } catch (error) {
      runInAction(() => {
        this.state.error = error instanceof Error ? error.message : String(error)
      })
    }
    await this.save()
  }

  /** The Todoom/attachments folder every uploaded file lands in. */
  get attachmentsFolder(): FileRef {
    return this.requireWorkspace().attachments
  }

  async load(workspace: Workspace): Promise<void> {
    const { text, modifiedTime } = await this.store.read(workspace.todo)
    runInAction(() => {
      this.workspace = workspace
      this.state.tasks = parseFile(text)
      this.state.loadedModifiedTime = modifiedTime
      this.state.saveState = 'idle'
      this.state.error = null
    })
    await this.loadAttachments()
    if (this.state.filters === null) await this.loadFilters()
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

  /** Applies one of the core's task mutations in place. */
  updateTask(index: number, change: (task: Task) => Task): void {
    const task = this.state.tasks[index]
    if (!task) return
    const next = change(task)
    if (next === task) return
    this.state.tasks[index] = next
    this.markDirty()
  }

  /** Makes one task wait on another: the target gets an id if it has none yet. */
  setDependency(index: number, targetIndex: number | null): void {
    const task = this.state.tasks[index]
    if (!task) return
    if (targetIndex === null) {
      this.state.tasks[index] = setDependency(task, null)
    } else {
      const target = this.state.tasks[targetIndex]
      if (!target) return
      const withId = ensureId(target)
      this.state.tasks[targetIndex] = withId
      this.state.tasks[index] = setDependency(task, withId.pairs['id'] ?? null)
    }
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

  showPage(page: AppState['page']): void {
    this.state.page = page
  }

  setFilter(patch: Partial<Filter>): void {
    this.state.filter = { ...this.state.filter, ...patch }
    if (this.queryError === null) this.validSearch = this.state.filter.search
  }

  /** The message for the search box, or null when the query parses. */
  get queryError(): string | null {
    try {
      parseQuery(this.state.filter.search)
      return null
    } catch (error) {
      return error instanceof Error ? error.message : String(error)
    }
  }

  visibleTasks(): Task[] {
    const filter = { ...this.state.filter, search: this.validSearch }
    return sortTasks(filterTasks(this.state.tasks, filter, this.today()))
  }

  /** Asks the on-device model for a query and puts it in the search box. */
  async translate(description: string): Promise<void> {
    const session = await this.modelSession()
    let query = firstLine(await session.prompt(description))
    try {
      parseQuery(query)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      query = firstLine(await session.prompt(retryPrompt(query, message)))
      parseQuery(query)
    }
    this.setFilter({ search: query })
  }

  private async modelSession(): Promise<ModelSession> {
    if (this.session) return this.session
    const vocab = {
      projects: collectProjects(this.state.tasks),
      contexts: collectContexts(this.state.tasks),
    }
    this.state.modelProgress = 0
    try {
      const session = await this.model.create(buildPrompt(vocab, this.today()), (fraction) => {
        runInAction(() => {
          this.state.modelProgress = fraction
        })
      })
      this.session = session
      return session
    } finally {
      runInAction(() => {
        this.state.modelProgress = null
      })
    }
  }

  indexOf(task: Task): number {
    return this.state.tasks.indexOf(task)
  }

  async save(): Promise<void> {
    if (this.state.saveState !== 'dirty' && this.state.saveState !== 'error') return
    const ref = this.requireRef()
    this.state.saveState = 'saving'
    this.state.error = null

    try {
      const current = await this.store.getModifiedTime(ref)
      if (this.state.loadedModifiedTime && current !== this.state.loadedModifiedTime) {
        await this.writeConflictCopy(ref)
      }
      const revisionAtWrite = this.revision
      const payload = formatFile(this.state.tasks)
      const { modifiedTime } = await this.store.write(ref, payload)
      runInAction(() => {
        this.state.loadedModifiedTime = modifiedTime
        this.state.saveState = revisionAtWrite === this.revision ? 'saved' : 'dirty'
      })
    } catch (error) {
      runInAction(() => {
        this.state.saveState = 'error'
        this.state.error = error instanceof Error ? error.message : String(error)
      })
    }
  }

  private async writeConflictCopy(ref: FileRef): Promise<void> {
    const { text } = await this.store.read(ref)
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const copy = await this.store.findOrCreateFileIn(this.folder, `todo.conflict-${stamp}.txt`)
    await this.store.write(copy, text)
  }

  async refreshIfClean(): Promise<void> {
    if (this.state.saveState === 'dirty' || this.state.saveState === 'error') return
    const workspace = this.requireWorkspace()
    const current = await this.store.getModifiedTime(workspace.todo)
    if (current === this.state.loadedModifiedTime) return
    await this.load(workspace)
  }

  /** Reads done.txt so the charts can count completions that left todo.txt. */
  async loadHistory(): Promise<void> {
    const done = await this.store.findOrCreateFileIn(this.folder, 'done.txt')
    const { text } = await this.store.read(done)
    runInAction(() => {
      this.state.archived = parseFile(text)
    })
  }

  async loadFilters(): Promise<void> {
    const ref = await this.store.findOrCreateFileIn(this.folder, 'filters.txt')
    const { text } = await this.store.read(ref)
    runInAction(() => {
      this.state.filters = parseFilters(text)
    })
  }

  private async writeFilters(filters: SavedFilter[]): Promise<void> {
    const ref = await this.store.findOrCreateFileIn(this.folder, 'filters.txt')
    await this.store.write(ref, formatFilters(filters))
    runInAction(() => {
      this.state.filters = filters
    })
  }

  /** Adds the filter, or replaces the one already saved under that name. */
  async saveFilter(name: string, query: string): Promise<void> {
    if (name.includes(': ')) throw new Error('Filter names cannot contain ": "')
    const current = this.state.filters ?? []
    const next = current.some((filter) => filter.name === name)
      ? current.map((filter) => (filter.name === name ? { name, query } : filter))
      : [...current, { name, query }]
    await this.writeFilters(next)
  }

  async deleteFilter(name: string): Promise<void> {
    await this.writeFilters((this.state.filters ?? []).filter((filter) => filter.name !== name))
  }

  async archive(): Promise<number> {
    this.requireRef()
    const { archive } = splitCompleted(this.state.tasks)
    if (archive.length === 0) return 0

    const done = await this.store.findOrCreateFileIn(this.folder, 'done.txt')
    const existing = (await this.store.read(done)).text
    await this.store.write(done, existing + formatFile(archive))

    const archivedTasks = new Set(archive)
    runInAction(() => {
      this.state.tasks = this.state.tasks.filter((task) => !archivedTasks.has(task))
      this.revision += 1
      this.state.saveState = 'dirty'
    })
    await this.save()
    if (isErrorState(this.state)) {
      throw new Error(this.state.error ?? 'failed to save todo.txt after archiving')
    }
    return archive.length
  }
}
