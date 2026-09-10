import type { FileRef, ReadResult, TodoStore } from './store'
import { backendTokens, SignedOutError, type TokenSource } from './tokens'

const FILES = 'https://www.googleapis.com/drive/v3/files'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files'

// Minimal shapes for the Drive REST API responses this file reads.

interface DriveFile {
  id: string
  name: string
}

interface DriveFileList {
  files?: DriveFile[]
}

interface DriveFileParents {
  parents?: string[]
}

interface DriveFileModifiedTime {
  modifiedTime: string
}

// Drive query strings are single-quoted; escape backslashes and quotes so a
// filename can never terminate the literal and inject clauses.
function quoteForQuery(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
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

  async createFile(name: string, parent?: string): Promise<FileRef> {
    const metadata: Record<string, unknown> = { name, mimeType: 'text/plain' }
    if (parent) metadata['parents'] = [parent]
    const response = await this.request(`${FILES}?fields=id,name`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(metadata),
    })
    const json = (await response.json()) as DriveFile
    return { id: json.id, name: json.name }
  }

  async findOrCreateRootFile(name: string): Promise<FileRef> {
    const query = [
      `name = '${quoteForQuery(name)}'`,
      'trashed = false',
      "'root' in parents",
    ].join(' and ')
    const response = await this.request(
      `${FILES}?q=${encodeURIComponent(query)}&fields=files(id,name)&pageSize=1`,
    )
    const json = (await response.json()) as DriveFileList
    const found = json.files?.[0]
    if (found) return { id: found.id, name: found.name }
    return this.createFile(name, 'root')
  }

  private async parentOf(ref: FileRef): Promise<string | undefined> {
    const response = await this.request(`${FILES}/${ref.id}?fields=parents`)
    const json = (await response.json()) as DriveFileParents
    return json.parents?.[0]
  }

  async findOrCreateSibling(ref: FileRef, name: string): Promise<FileRef> {
    const parent = await this.parentOf(ref)
    const query = [
      `name = '${quoteForQuery(name)}'`,
      'trashed = false',
      parent ? `'${quoteForQuery(parent)}' in parents` : null,
    ]
      .filter((clause): clause is string => clause !== null)
      .join(' and ')
    const response = await this.request(
      `${FILES}?q=${encodeURIComponent(query)}&fields=files(id,name)&pageSize=1`,
    )
    const json = (await response.json()) as DriveFileList
    const found = json.files?.[0]
    if (found) return { id: found.id, name: found.name }
    return this.createFile(name, parent)
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
