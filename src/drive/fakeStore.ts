import type { FileRef, ReadResult, TodoStore } from './store'

interface Entry {
  id: string
  name: string
  text: string
  modifiedTime: string
}

export class FakeStore implements TodoStore {
  private signedIn = false
  private files = new Map<string, Entry>()
  private counter = 0
  private clock = 0
  private pendingWriteGate: { markStarted: () => void; releaseGate: Promise<void> } | null = null
  private failingWrites = new Set<string>()

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

  private newEntry(name: string): Entry {
    this.counter += 1
    return { id: `fake-${this.counter}`, name, text: '', modifiedTime: this.stamp() }
  }

  private require(ref: FileRef): Entry {
    if (!this.signedIn) throw new Error('not signed in')
    const entry = this.files.get(ref.id)
    if (!entry) throw new Error('file not found')
    return entry
  }

  refFor(name: string): FileRef {
    for (const entry of this.files.values()) {
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

  async pickFile(): Promise<FileRef | null> {
    for (const entry of this.files.values()) {
      return { id: entry.id, name: entry.name }
    }
    return null
  }

  async createFile(name: string): Promise<FileRef> {
    const entry = this.newEntry(name)
    this.files.set(entry.id, entry)
    return { id: entry.id, name: entry.name }
  }

  async findOrCreateSibling(_ref: FileRef, name: string): Promise<FileRef> {
    for (const entry of this.files.values()) {
      if (entry.name === name) return { id: entry.id, name: entry.name }
    }
    return this.createFile(name)
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

  async pickFileNamedLike(prefix: string): Promise<FileRef | null> {
    for (const entry of this.files.values()) {
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
