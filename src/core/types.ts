export interface Task {
  raw: string
  completed: boolean
  priority?: string
  completionDate?: string
  creationDate?: string
  description: string
  projects: string[]
  contexts: string[]
  pairs: Record<string, string>
}

export function emptyTask(): Task {
  return {
    raw: '',
    completed: false,
    description: '',
    projects: [],
    contexts: [],
    pairs: {},
  }
}
