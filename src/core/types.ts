export interface Task {
  raw: string
  completed: boolean
  priority?: string
  completionDate?: string
  creationDate?: string
  description: string
  /** The Description field: the free text of a desc:"..." word, if there is one. */
  note?: string
  projects: string[]
  contexts: string[]
  attachments: string[]
  pairs: Record<string, string>
}

export function emptyTask(): Task {
  return {
    raw: '',
    completed: false,
    description: '',
    projects: [],
    contexts: [],
    attachments: [],
    pairs: {},
  }
}
