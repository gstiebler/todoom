export interface FileRef {
  id: string
  name: string
}

/** A file in the Todoom folder, as the UI needs to see it. */
export interface DriveEntry {
  id: string
  name: string
  webViewLink: string
}

export interface ReadResult {
  text: string
  modifiedTime: string
}

export interface TodoStore {
  isSignedIn(): boolean
  signIn(): Promise<void>
  signOut(): void
  findOrCreateFolder(name: string, parent?: FileRef): Promise<FileRef>
  findOrCreateFileIn(parent: FileRef, name: string): Promise<FileRef>
  uploadFile(parent: FileRef, file: File): Promise<DriveEntry>
  listFiles(parent: FileRef): Promise<DriveEntry[]>
  trashFile(id: string): Promise<void>
  read(ref: FileRef): Promise<ReadResult>
  write(ref: FileRef, text: string): Promise<{ modifiedTime: string }>
  getModifiedTime(ref: FileRef): Promise<string>
}
