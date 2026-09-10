import type { FileRef, ReadResult, TodoStore } from './store'
import { loadConfig } from './config'

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
  private config = loadConfig()

  clientId(): string {
    return this.config.clientId
  }

  isSignedIn(): boolean {
    return this.token !== null
  }

  // The token is supplied by the redirect flow in main.ts and held in memory
  // only, never in localStorage, sessionStorage or a cookie. See spec §5.1.
  setToken(token: string): void {
    this.token = token
  }

  async signIn(): Promise<void> {
    throw new Error('Todoom signs in by redirect; call startRedirectSignIn instead.')
  }

  signOut(): void {
    const token = this.token
    this.token = null
    if (!token) return
    // Best effort: the page is usually navigating away, and a failed revoke
    // costs nothing because the token expires within the hour regardless.
    void fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    }).catch(() => {})
  }

  private async request(url: string, init: RequestInit = {}): Promise<Response> {
    if (!this.token) throw new Error('not signed in')
    const headers = new Headers(init.headers)
    headers.set('Authorization', `Bearer ${this.token}`)
    const response = await fetch(url, { ...init, headers })
    // Renewing the token means navigating to Google, which would discard any
    // unsaved edit. Report the expiry instead and let the user reload when the
    // work is safe; the beforeunload guard warns if anything is still dirty.
    if (response.status === 401 || response.status === 403) {
      this.token = null
      throw new Error('Your Google session expired. Reload the page to reconnect.')
    }
    if (!response.ok) {
      throw new Error(`Drive request failed: ${response.status} ${await response.text()}`)
    }
    return response
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
