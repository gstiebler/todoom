export interface Draft {
  text: string
  priority: string | null
  due: string | null
  rec: string | null
  labels: string[]
  attachments: string[]
}

export function emptyDraft(): Draft {
  return { text: '', priority: null, due: null, rec: null, labels: [], attachments: [] }
}

function hasPair(text: string, key: string): boolean {
  return text.split(' ').some((word) => word.startsWith(`${key}:`))
}

// The chips are a shortcut for typing, not an override of it: anything the text
// already says wins, so a line typed as "pay rent due:2026-10-01" keeps that
// date even if the Date chip holds another one.
export function composeLine(draft: Draft): string {
  const text = draft.text.trim()
  const words = text.split(' ')
  const parts: string[] = []

  if (draft.priority && !/^\([A-Z]\)$/.test(words[0] ?? '')) parts.push(`(${draft.priority})`)
  parts.push(text)
  for (const label of draft.labels) {
    if (!words.includes(label)) parts.push(label)
  }
  if (draft.due && !hasPair(text, 'due')) parts.push(`due:${draft.due}`)
  if (draft.rec && !hasPair(text, 'rec')) parts.push(`rec:${draft.rec}`)
  for (const id of draft.attachments) {
    if (!words.includes(`file:${id}`)) parts.push(`file:${id}`)
  }

  return parts.join(' ').trim()
}
