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
    entry.text = text
    entry.modifiedTime = this.stamp()
    return { modifiedTime: entry.modifiedTime }
  }

  async getModifiedTime(ref: FileRef): Promise<string> {
    return this.require(ref).modifiedTime
  }

  /** Simulates an edit made outside Todoom. */
  editOutside(ref: FileRef, text: string): void {
    const entry = this.files.get(ref.id)
    if (!entry) throw new Error('file not found')
    entry.text = text
    entry.modifiedTime = this.stamp()
  }
}
