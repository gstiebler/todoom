import type { FileRef, ReadResult, TodoStore } from './store'
import { loadConfig, SCOPE } from './config'

const FILES = 'https://www.googleapis.com/drive/v3/files'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files'

// Minimal ambient types for Google Identity Services, loaded via a script tag
// in index.html. These are the only shapes this file touches; no full @types
// package is needed.

interface GoogleTokenResponse {
  access_token: string
  error?: string
}

interface GoogleTokenError {
  type: string
  message?: string
}

interface GoogleTokenClient {
  callback: (response: GoogleTokenResponse) => void
  requestAccessToken: (options: { prompt: '' | 'consent' }) => void
}

interface GoogleOAuth2 {
  initTokenClient(config: {
    client_id: string
    scope: string
    callback: (response: GoogleTokenResponse) => void
    error_callback?: (error: GoogleTokenError) => void
  }): GoogleTokenClient
  revoke(token: string, callback: () => void): void
}

interface GoogleNamespace {
  accounts?: { oauth2: GoogleOAuth2 }
}

declare global {
  interface Window {
    google?: GoogleNamespace
  }
}

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

function waitFor(check: () => boolean, what: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const started = Date.now()
    const tick = () => {
      if (check()) return resolve()
      if (Date.now() - started > 10000) return reject(new Error(`timed out loading ${what}`))
      setTimeout(tick, 50)
    }
    tick()
  })
}

// Drive query strings are single-quoted; escape backslashes and quotes so a
// filename can never terminate the literal and inject clauses.
function quoteForQuery(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

export class GoogleDriveStore implements TodoStore {
  private token: string | null = null
  private tokenClient: GoogleTokenClient | null = null
  private config = loadConfig()
  private onTokenError: ((error: Error) => void) | null = null

  isSignedIn(): boolean {
    return this.token !== null
  }

  private async ensureTokenClient(): Promise<void> {
    if (this.tokenClient) return
    await waitFor(() => Boolean(window.google?.accounts?.oauth2), 'Google Identity Services')
    this.tokenClient = window.google!.accounts!.oauth2.initTokenClient({
      client_id: this.config.clientId,
      scope: SCOPE,
      callback: () => {},
      error_callback: (error) => this.onTokenError?.(new Error(error.type)),
    })
  }

  async signIn(): Promise<void> {
    await this.ensureTokenClient()
    await this.requestToken('consent')
  }

  // Ask Google for a token without showing any UI. This succeeds only when the
  // browser still has a Google session and the scope is already granted, which
  // is what lets a returning visitor skip the Connect screen. It resolves false
  // rather than throwing: a revoked grant, an expired session or blocked
  // third-party cookies are all ordinary reasons to fall back to the button.
  async signInSilently(): Promise<boolean> {
    await this.ensureTokenClient()
    try {
      await Promise.race([
        this.requestToken(''),
        // Google occasionally answers neither callback; without this the page
        // would sit on the placeholder forever.
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('silent sign-in timed out')), 10000),
        ),
      ])
      return true
    } catch {
      return false
    }
  }

  private requestToken(prompt: '' | 'consent'): Promise<void> {
    return new Promise((resolve, reject) => {
      const tokenClient = this.tokenClient!
      this.onTokenError = reject
      tokenClient.callback = (response) => {
        if (response.error) return reject(new Error(response.error))
        this.token = response.access_token
        resolve()
      }
      tokenClient.requestAccessToken({ prompt })
    })
  }

  signOut(): void {
    if (this.token && window.google?.accounts?.oauth2) {
      window.google.accounts.oauth2.revoke(this.token, () => {})
    }
    this.token = null
  }

  private async request(url: string, init: RequestInit = {}, retry = true): Promise<Response> {
    if (!this.token) throw new Error('not signed in')
    const headers = new Headers(init.headers)
    headers.set('Authorization', `Bearer ${this.token}`)
    const response = await fetch(url, { ...init, headers })
    if ((response.status === 401 || response.status === 403) && retry) {
      await this.ensureTokenClient()
      await this.requestToken('')
      return this.request(url, init, false)
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
