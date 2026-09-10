import type { DriveEntry, FileRef, ReadResult, TodoStore } from './store'
import { backendTokens, SignedOutError, type TokenSource } from './tokens'

const FILES = 'https://www.googleapis.com/drive/v3/files'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files'
const FOLDER_MIME = 'application/vnd.google-apps.folder'
const ENTRY_FIELDS = 'id,name,webViewLink'

// Minimal shapes for the Drive REST API responses this file reads.

interface DriveFile {
  id: string
  name: string
  webViewLink?: string
}

interface DriveFileList {
  files?: DriveFile[]
}

interface DriveFileModifiedTime {
  modifiedTime: string
}

// Drive query strings are single-quoted; escape backslashes and quotes so a
// filename can never terminate the literal and inject clauses.
function quoteForQuery(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

function entryOf(file: DriveFile): DriveEntry {
  return { id: file.id, name: file.name, webViewLink: file.webViewLink ?? '' }
}

export class GoogleDriveStore implements TodoStore {
  private token: string | null = null
  private expiresAt = 0

  constructor(private readonly tokens: TokenSource = backendTokens) {}

  isSignedIn(): boolean {
    return this.token !== null
  }

  async signIn(): Promise<void> {
    await this.authorize()
  }

  signOut(): void {
    this.token = null
    this.expiresAt = 0
    void fetch('/auth/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => {})
  }

  /**
   * The access token lives an hour; the session behind it lives as long as the
   * cookie. Renewal is therefore not an event to schedule but a question asked
   * before every request, and the answer is almost always the cached token.
   */
  private async authorize(): Promise<string> {
    // A minute of slack so a token cannot expire in flight between this check
    // and Drive receiving it.
    if (this.token && Date.now() < this.expiresAt - 60_000) return this.token
    const issued = await this.tokens.fetch()
    this.token = issued.accessToken
    this.expiresAt = Date.now() + issued.expiresIn * 1000
    return this.token
  }

  private async request(url: string, init: RequestInit = {}): Promise<Response> {
    let response = await this.send(url, init, await this.authorize())

    // Drive rejected a token the app believed was good — a clock skew, or a
    // token revoked mid-session. One forced renewal distinguishes a stale
    // token from a dead session, and costs a single extra round trip.
    if (response.status === 401) {
      this.token = null
      response = await this.send(url, init, await this.authorize())
    }
    if (response.status === 401 || response.status === 403) {
      this.token = null
      throw new SignedOutError()
    }
    if (!response.ok) {
      throw new Error(`Drive request failed: ${response.status} ${await response.text()}`)
    }
    return response
  }

  private async send(url: string, init: RequestInit, token: string): Promise<Response> {
    const headers = new Headers(init.headers)
    headers.set('Authorization', `Bearer ${token}`)
    return fetch(url, { ...init, headers })
  }

  private async findIn(parent: string, name: string, mimeType?: string): Promise<DriveEntry | null> {
    const query = [
      `name = '${quoteForQuery(name)}'`,
      'trashed = false',
      `'${quoteForQuery(parent)}' in parents`,
      mimeType ? `mimeType = '${quoteForQuery(mimeType)}'` : null,
    ]
      .filter((clause): clause is string => clause !== null)
      .join(' and ')
    const response = await this.request(
      `${FILES}?q=${encodeURIComponent(query)}&fields=files(${ENTRY_FIELDS})&pageSize=1`,
    )
    const found = ((await response.json()) as DriveFileList).files?.[0]
    return found ? entryOf(found) : null
  }

  private async create(name: string, parent: string, mimeType: string): Promise<DriveEntry> {
    const response = await this.request(`${FILES}?fields=${ENTRY_FIELDS}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, mimeType, parents: [parent] }),
    })
    return entryOf((await response.json()) as DriveFile)
  }

  async findOrCreateFolder(name: string, parent?: FileRef): Promise<FileRef> {
    // The mime type is part of the question: a plain file called Todoom must
    // not be mistaken for the folder.
    const under = parent?.id ?? 'root'
    const found = await this.findIn(under, name, FOLDER_MIME)
    const entry = found ?? (await this.create(name, under, FOLDER_MIME))
    return { id: entry.id, name: entry.name }
  }

  async findOrCreateFileIn(parent: FileRef, name: string): Promise<FileRef> {
    const found = await this.findIn(parent.id, name)
    const entry = found ?? (await this.create(name, parent.id, 'text/plain'))
    return { id: entry.id, name: entry.name }
  }

  /**
   * Two requests rather than one multipart body: the metadata creates the file,
   * a media PATCH fills it. The extra round trip buys not hand-rolling a
   * multipart/related envelope.
   */
  async uploadFile(parent: FileRef, file: File): Promise<DriveEntry> {
    const mimeType = file.type || 'application/octet-stream'
    const entry = await this.create(file.name, parent.id, mimeType)
    await this.request(`${UPLOAD}/${entry.id}?uploadType=media`, {
      method: 'PATCH',
      headers: { 'Content-Type': mimeType },
      body: file,
    })
    return entry
  }

  async listFiles(parent: FileRef): Promise<DriveEntry[]> {
    const query = [`'${quoteForQuery(parent.id)}' in parents`, 'trashed = false'].join(' and ')
    const response = await this.request(
      `${FILES}?q=${encodeURIComponent(query)}&fields=files(${ENTRY_FIELDS})&pageSize=1000`,
    )
    const files = ((await response.json()) as DriveFileList).files ?? []
    return files.map(entryOf)
  }

  /** Trashed, not deleted: a detached file stays recoverable in Drive. */
  async trashFile(id: string): Promise<void> {
    await this.request(`${FILES}/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trashed: true }),
    })
  }

  async read(ref: FileRef): Promise<ReadResult> {
    const content = await this.request(`${FILES}/${ref.id}?alt=media`)
    const text = await content.text()
    const modifiedTime = await this.getModifiedTime(ref)
    return { text, modifiedTime }
  }

  async write(ref: FileRef, text: string): Promise<{ modifiedTime: string }> {
    const response = await this.request(`${UPLOAD}/${ref.id}?uploadType=media&fields=modifiedTime`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'text/plain' },
      body: text,
    })
    const json = (await response.json()) as DriveFileModifiedTime
    return { modifiedTime: json.modifiedTime }
  }

  async getModifiedTime(ref: FileRef): Promise<string> {
    const response = await this.request(`${FILES}/${ref.id}?fields=modifiedTime`)
    const json = (await response.json()) as DriveFileModifiedTime
    return json.modifiedTime
  }
}
