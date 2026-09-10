import type { Task } from './types'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const PRIORITY_RE = /^\(([A-Z])\) /
const PROJECT_RE = /(?:^|\s)\+(\S+)/g
const CONTEXT_RE = /(?:^|\s)@(\S+)/g
const ATTACHMENT_RE = /(?:^|\s)file:([A-Za-z0-9_-]+)(?=\s|$)/g
const PAIR_RE = /(?:^|\s)([A-Za-z0-9_-]+):([^\s:/][^\s:]*)(?=\s|$)/g

export function normalizeLine(line: string): string {
  return line.trim().replace(/\s+/g, ' ')
}

export function parseLine(line: string): Task {
  const raw = line
  let rest = normalizeLine(line)

  let completed = false
  if (rest.startsWith('x ')) {
    completed = true
    rest = rest.slice(2)
  }

  let priority: string | undefined
  const priMatch = PRIORITY_RE.exec(rest)
  if (priMatch) {
    priority = priMatch[1]
    rest = rest.slice(priMatch[0].length)
  }

  let completionDate: string | undefined
  let creationDate: string | undefined
  const tokens = rest.length > 0 ? rest.split(' ') : []
  if (tokens[0] !== undefined && DATE_RE.test(tokens[0])) {
    const first = tokens.shift() as string
    if (completed) {
      completionDate = first
      if (tokens[0] !== undefined && DATE_RE.test(tokens[0])) {
        creationDate = tokens.shift() as string
      }
    } else {
      creationDate = first
    }
    rest = tokens.join(' ')
  }

  const description = rest

  return {
    raw,
    completed,
    priority,
    completionDate,
    creationDate,
    description,
    projects: collect(description, PROJECT_RE),
    contexts: collect(description, CONTEXT_RE),
    attachments: collect(description, ATTACHMENT_RE),
    pairs: collectPairs(description),
  }
}

function collect(text: string, re: RegExp): string[] {
  const out: string[] = []
  for (const m of text.matchAll(re)) {
    if (m[1] !== undefined) out.push(m[1])
  }
  return out
}

function collectPairs(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of text.matchAll(PAIR_RE)) {
    if (m[1] !== undefined && m[2] !== undefined) out[m[1]] = m[2]
  }
  return out
}

export function parseFile(text: string): Task[] {
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map(parseLine)
}
