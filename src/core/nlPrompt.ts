import { addInterval } from './dates'

export interface Vocabulary {
  projects: string[]
  contexts: string[]
}

const GRAMMAR = `Terms:
- a plain word matches tasks containing it
- +project, @context
- (A) or pri:A for priority A; "no pri" for none
- due:<date>, due before:<date>, due after:<date>, due:none or "no date", due:overdue or overdue
- deadline:<date>, deadline before:<date>, deadline after:<date>, deadline:none or "no deadline", deadline:overdue
- done (completed), blocked (waits on another task), rec (repeats)
<date> is today, tomorrow, yesterday, or YYYY-MM-DD.
Operators: ! (not), & (and), | (or), parentheses. Two terms side by side mean &.`

const RULES = `Reply with exactly one line containing only the query: no explanation, no quotes, no code fences.
Only use projects and contexts from the lists below; for anything else use plain words.`

/** The system prompt: grammar, rules, examples, and the user's own labels. */
export function buildPrompt(vocab: Vocabulary, today: string): string {
  const examples: Array<[string, string]> = [
    ['things I have to do today', 'due:today'],
    ['overdue work tasks', '+work & overdue'],
    ['high priority and not blocked', '(A) & !blocked'],
    ['anything without a date', 'no date'],
    ['house or garden', '+house | +garden'],
    ['repeating chores', 'rec'],
    ['finished tasks', 'done'],
    ['deadline this week', `deadline before:${addInterval(today, 7, 'd')}`],
    ['calls I can make tomorrow', '@phone & due:tomorrow'],
    ['call mom', 'call mom'],
  ]
  const labels = [
    vocab.projects.length > 0 && `Projects: ${vocab.projects.map((p) => `+${p}`).join(' ')}`,
    vocab.contexts.length > 0 && `Contexts: ${vocab.contexts.map((c) => `@${c}`).join(' ')}`,
  ].filter((line): line is string => typeof line === 'string')
  return [
    'You turn a description of tasks into a filter query for a todo.txt list.',
    `Today is ${today}.`,
    GRAMMAR,
    RULES,
    ...labels,
    'Examples:',
    ...examples.map(([text, query]) => `${text} -> ${query}`),
  ].join('\n')
}

/** The follow-up when the first answer did not parse. */
export function retryPrompt(query: string, error: string): string {
  return `That answer, "${query}", is not valid: ${error}. Reply with only the corrected query.`
}
