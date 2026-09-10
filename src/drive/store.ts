export interface FileRef {
  id: string
  name: string
}

export interface ReadResult {
  text: string
  modifiedTime: string
}

export interface TodoStore {
  isSignedIn(): boolean
  signIn(): Promise<void>
  signOut(): void
  createFile(name: string): Promise<FileRef>
  findOrCreateRootFile(name: string): Promise<FileRef>
  findOrCreateSibling(ref: FileRef, name: string): Promise<FileRef>
  read(ref: FileRef): Promise<ReadResult>
  write(ref: FileRef, text: string): Promise<{ modifiedTime: string }>
  getModifiedTime(ref: FileRef): Promise<string>
}
