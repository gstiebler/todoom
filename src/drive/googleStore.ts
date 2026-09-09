import type { FileRef, ReadResult, TodoStore } from './store'
import { loadConfig, SCOPE } from './config'

const FILES = 'https://www.googleapis.com/drive/v3/files'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files'

// Minimal ambient types for the two Google SDKs loaded via <script> tags in
// index.html (Google Identity Services and the legacy gapi loader/Picker).
// These are the only shapes this file touches; no full @types package.

interface GoogleTokenResponse {
  access_token: string
  error?: string
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
  }): GoogleTokenClient
  revoke(token: string, callback: () => void): void
}

interface GooglePickerDoc {
  id: string
  name: string
}

interface GooglePickerData {
  action: string
  docs: GooglePickerDoc[]
}

interface GooglePickerView {
  setMimeTypes(mimeTypes: string): GooglePickerView
  setIncludeFolders(include: boolean): GooglePickerView
}

interface GooglePickerInstance {
  setVisible(visible: boolean): void
}

interface GooglePickerBuilder {
  setOAuthToken(token: string): GooglePickerBuilder
  setDeveloperKey(key: string): GooglePickerBuilder
  addView(view: GooglePickerView): GooglePickerBuilder
  setCallback(callback: (data: GooglePickerData) => void): GooglePickerBuilder
  build(): GooglePickerInstance
}

interface GooglePickerNamespace {
  DocsView: new (viewId: unknown) => GooglePickerView
  ViewId: { DOCS: unknown }
  PickerBuilder: new () => GooglePickerBuilder
  Action: { PICKED: string; CANCEL: string }
}

interface GoogleNamespace {
  accounts?: { oauth2: GoogleOAuth2 }
  picker?: GooglePickerNamespace
}

interface GapiNamespace {
  load(api: string, callback: () => void): void
}

declare global {
  interface Window {
    google?: GoogleNamespace
    gapi?: GapiNamespace
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
    })
  }

  async signIn(): Promise<void> {
    await this.ensureTokenClient()
    await this.requestToken('consent')
  }

  private requestToken(prompt: '' | 'consent'): Promise<void> {
    return new Promise((resolve, reject) => {
      const tokenClient = this.tokenClient!
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

  async pickFile(): Promise<FileRef | null> {
    await waitFor(() => Boolean(window.gapi), 'Google API loader')
    await new Promise<void>((resolve) => window.gapi!.load('picker', () => resolve()))
    if (!this.token) throw new Error('not signed in')
    const token = this.token
    const picker = window.google!.picker!

    return new Promise((resolve) => {
      const view = new picker.DocsView(picker.ViewId.DOCS)
        .setMimeTypes('text/plain')
        .setIncludeFolders(true)
      const instance = new picker.PickerBuilder()
        .setOAuthToken(token)
        .setDeveloperKey(this.config.apiKey)
        .addView(view)
        .setCallback((data) => {
          if (data.action === picker.Action.PICKED) {
            const doc = data.docs[0]
            if (doc) resolve({ id: doc.id, name: doc.name })
          } else if (data.action === picker.Action.CANCEL) {
            resolve(null)
          }
        })
        .build()
      instance.setVisible(true)
    })
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
