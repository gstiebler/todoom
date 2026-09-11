import type { DriveEntry, FileRef, ReadResult, TodoStore } from './store'

interface Entry {
  id: string
  name: string
  text: string
  modifiedTime: string
  parent: string
  isFolder: boolean
  trashed: boolean
  mimeType: string
}

function entryOf(entry: Entry): DriveEntry {
  return {
    id: entry.id,
    name: entry.name,
    webViewLink: `https://drive.fake/${entry.id}`,
    mimeType: entry.mimeType,
  }
}

export class FakeStore implements TodoStore {
  private signedIn = false
  private files = new Map<string, Entry>()
  private counter = 0
  private clock = 0
  private pendingWriteGate: { markStarted: () => void; releaseGate: Promise<void> } | null = null
  private failingWrites = new Set<string>()
  private failingUploads = 0

  constructor(seed: Record<string, string> = {}) {
    for (const [name, text] of Object.entries(seed)) {
      const entry = this.newEntry(name)
      entry.text = text
      this.files.set(entry.id, entry)
    }
  }

  private stamp(): string {
    this.clock += 1000
    return new Date(1_700_000_000_000 + this.clock).toISOString()
  }

  private newEntry(
    name: string,
    parent = 'root',
    isFolder = false,
    mimeType = isFolder ? 'application/vnd.google-apps.folder' : 'text/plain',
  ): Entry {
    this.counter += 1
    return {
      id: `fake-${this.counter}`,
      name,
      text: '',
      modifiedTime: this.stamp(),
      parent,
      isFolder,
      trashed: false,
      mimeType,
    }
  }

  private live(): Entry[] {
    return [...this.files.values()].filter((entry) => !entry.trashed)
  }

  private require(ref: FileRef): Entry {
    if (!this.signedIn) throw new Error('not signed in')
    const entry = this.files.get(ref.id)
    if (!entry) throw new Error('file not found')
    return entry
  }

  refFor(name: string): FileRef {
    for (const entry of this.live()) {
      if (entry.name === name) return { id: entry.id, name: entry.name }
    }
    throw new Error(`no seeded file named ${name}`)
  }

  isSignedIn(): boolean {
    return this.signedIn
  }

  async signIn(): Promise<void> {
    this.signedIn = true
  }

  signOut(): void {
    this.signedIn = false
  }

  /**
   * The workspace a seeded fake stands for: a Todoom folder holding the seeded
   * files, which is where the real app keeps them.
   */
  async workspace(
    todo = 'todo.txt',
  ): Promise<{ folder: FileRef; todo: FileRef; attachments: FileRef }> {
    const folder = await this.findOrCreateFolder('Todoom')
    for (const entry of this.live()) {
      if (!entry.isFolder && entry.parent === 'root') entry.parent = folder.id
    }
    const attachments = await this.findOrCreateFolder('attachments', folder)
    return { folder, todo: this.refFor(todo), attachments }
  }

  async findOrCreateFolder(name: string, parent?: FileRef): Promise<FileRef> {
    const under = parent?.id ?? 'root'
    for (const entry of this.live()) {
      if (entry.isFolder && entry.name === name && entry.parent === under) {
        return { id: entry.id, name: entry.name }
      }
    }
    const created = this.newEntry(name, under, true)
    this.files.set(created.id, created)
    return { id: created.id, name: created.name }
  }

  async findOrCreateFileIn(parent: FileRef, name: string): Promise<FileRef> {
    for (const entry of this.live()) {
      if (entry.parent === parent.id && entry.name === name) {
        return { id: entry.id, name: entry.name }
      }
    }
    const created = this.newEntry(name, parent.id)
    this.files.set(created.id, created)
    return { id: created.id, name: created.name }
  }

  async uploadFile(parent: FileRef, file: File): Promise<DriveEntry> {
    if (!this.signedIn) throw new Error('not signed in')
    if (this.failingUploads > 0) {
      this.failingUploads -= 1
      throw new Error(`simulated upload failure for ${file.name}`)
    }
    const mimeType = file.type || 'application/octet-stream'
    const created = this.newEntry(file.name, parent.id, false, mimeType)
    // jsdom's File has no text(), and no attachment test needs the bytes.
    if (typeof file.text === 'function') created.text = await file.text()
    this.files.set(created.id, created)
    return entryOf(created)
  }

  /** Makes the next n uploads throw. */
  failNextUploads(n = 1): void {
    this.failingUploads = n
  }

  async listFiles(parent: FileRef): Promise<DriveEntry[]> {
    return this.live()
      .filter((entry) => entry.parent === parent.id)
      .map(entryOf)
  }

  async trashFile(id: string): Promise<void> {
    const entry = this.files.get(id)
    if (entry) entry.trashed = true
  }

  isTrashed(id: string): boolean {
    return this.files.get(id)?.trashed ?? false
  }

  async read(ref: FileRef): Promise<ReadResult> {
    const entry = this.require(ref)
    return { text: entry.text, modifiedTime: entry.modifiedTime }
  }

  async write(ref: FileRef, text: string): Promise<{ modifiedTime: string }> {
    const entry = this.require(ref)
    if (this.failingWrites.has(entry.name)) {
      this.failingWrites.delete(entry.name)
      throw new Error(`simulated write failure for ${entry.name}`)
    }
    if (this.pendingWriteGate) {
      const gate = this.pendingWriteGate
      this.pendingWriteGate = null
      gate.markStarted()
      await gate.releaseGate
    }
    entry.text = text
    entry.modifiedTime = this.stamp()
    return { modifiedTime: entry.modifiedTime }
  }

  /** Holds the next write() call open until release() is called. Lets a test interleave
   * another operation with an in-flight save. */
  holdNextWrite(): { writeStarted: Promise<void>; release: () => void } {
    let markStarted!: () => void
    const writeStarted = new Promise<void>((resolve) => {
      markStarted = resolve
    })
    let release!: () => void
    const releaseGate = new Promise<void>((resolve) => {
      release = resolve
    })
    this.pendingWriteGate = { markStarted, releaseGate }
    return { writeStarted, release }
  }

  /** Makes the next write() to a file with this name throw. */
  failNextWriteTo(name: string): void {
    this.failingWrites.add(name)
  }

  async getModifiedTime(ref: FileRef): Promise<string> {
    return this.require(ref).modifiedTime
  }

  async findFileNamedLike(prefix: string): Promise<FileRef | null> {
    for (const entry of this.live()) {
      if (entry.name.startsWith(prefix)) return { id: entry.id, name: entry.name }
    }
    return null
  }

  /** Simulates an edit made outside Todoom. */
  editOutside(ref: FileRef, text: string): void {
    const entry = this.files.get(ref.id)
    if (!entry) throw new Error('file not found')
    entry.text = text
    entry.modifiedTime = this.stamp()
  }
}
