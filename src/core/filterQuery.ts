import { isValidDate } from './dates'

export type DateField = 'due' | 'deadline'
export type DateOp = 'on' | 'before' | 'after' | 'none' | 'overdue'

export type Query =
  | { kind: 'text'; value: string }
  | { kind: 'project'; value: string }
  | { kind: 'context'; value: string }
  | { kind: 'priority'; value: string | null }
  | { kind: 'date'; field: DateField; op: DateOp; value?: string }
  | { kind: 'done' }
  | { kind: 'blocked' }
  | { kind: 'rec' }
  | { kind: 'not'; query: Query }
  | { kind: 'and'; queries: Query[] }
  | { kind: 'or'; queries: Query[] }

type Operator = '(' | ')' | '&' | '|' | '!'
type Token = Operator | { word: string }

// `(A)` is read before a bare `(` so a priority never opens a group.
const TOKEN_RE = /\([A-Za-z]\)|[()&|!]|[^\s()&|!]+/g
const OPERATORS = '()&|!'
const TWO_WORDS = new Set(['no date', 'no pri', 'no deadline'])
const DATE_WORDS = new Set(['today', 'tomorrow', 'yesterday'])

function isOperator(raw: string): raw is Operator {
  return raw.length === 1 && OPERATORS.includes(raw)
}

// Two-word terms are joined here, so `no` on its own stays a text word.
function tokenize(text: string): Token[] {
  const raw = text.match(TOKEN_RE) ?? []
  const tokens: Token[] = []
  let skip = false
  raw.forEach((current, i) => {
    if (skip) {
      skip = false
      return
    }
    if (isOperator(current)) {
      tokens.push(current)
      return
    }
    const pair = `${current} ${raw[i + 1] ?? ''}`
    if (TWO_WORDS.has(pair.toLowerCase()) || /^(due|deadline) (before|after):\S+$/i.test(pair)) {
      tokens.push({ word: pair })
      skip = true
      return
    }
    tokens.push({ word: current })
  })
  return tokens
}

function dateTerm(field: DateField, op: 'on' | 'before' | 'after', value: string): Query {
  const lower = value.toLowerCase()
  if (op === 'on' && lower === 'none') return { kind: 'date', field, op: 'none' }
  if (op === 'on' && lower === 'overdue') return { kind: 'date', field, op: 'overdue' }
  if (DATE_WORDS.has(lower)) return { kind: 'date', field, op, value: lower }
  if (!isValidDate(value)) throw new Error(`Unknown date: ${value}`)
  return { kind: 'date', field, op, value }
}

function term(word: string): Query {
  const lower = word.toLowerCase()
  const priority = /^\(([a-z])\)$|^pri:([a-z])$/.exec(lower)
  if (priority) return { kind: 'priority', value: (priority[1] ?? priority[2] ?? '').toUpperCase() }
  if (lower === 'no pri') return { kind: 'priority', value: null }
  if (lower === 'no date') return { kind: 'date', field: 'due', op: 'none' }
  if (lower === 'no deadline') return { kind: 'date', field: 'deadline', op: 'none' }
  if (lower === 'overdue') return { kind: 'date', field: 'due', op: 'overdue' }
  if (lower === 'done') return { kind: 'done' }
  if (lower === 'blocked') return { kind: 'blocked' }
  if (lower === 'rec') return { kind: 'rec' }
  const dated = /^(due|deadline)(?: (before|after))?:(.+)$/i.exec(word)
  if (dated) {
    const field = (dated[1] ?? '').toLowerCase() as DateField
    const op = ((dated[2] ?? 'on').toLowerCase()) as 'on' | 'before' | 'after'
    return dateTerm(field, op, dated[3] ?? '')
  }
  if (word.length > 1 && word.startsWith('+')) return { kind: 'project', value: word.slice(1) }
  if (word.length > 1 && word.startsWith('@')) return { kind: 'context', value: word.slice(1) }
  return { kind: 'text', value: lower }
}

function group(kind: 'and' | 'or', queries: Query[]): Query {
  const [first] = queries
  return queries.length === 1 && first ? first : { kind, queries }
}

// or := and ('|' and)* ; and := unary (['&'] unary)* ; unary := '!' unary | '(' or ')' | term
class Parser {
  private pos = 0

  constructor(private readonly tokens: Token[]) {}

  done(): boolean {
    return this.pos >= this.tokens.length
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos]
  }

  private take(): Token | undefined {
    const token = this.tokens[this.pos]
    this.pos += 1
    return token
  }

  parseOr(): Query {
    const queries = [this.parseAnd()]
    while (this.peek() === '|') {
      this.pos += 1
      queries.push(this.parseAnd())
    }
    return group('or', queries)
  }

  private parseAnd(): Query {
    const queries = [this.parseUnary()]
    for (;;) {
      const next = this.peek()
      if (next === undefined || next === ')' || next === '|') break
      if (next === '&') this.pos += 1
      queries.push(this.parseUnary())
    }
    return group('and', queries)
  }

  private parseUnary(): Query {
    const token = this.take()
    if (token === undefined) throw new Error('Missing a term at the end')
    if (token === '!') return { kind: 'not', query: this.parseUnary() }
    if (token === '(') {
      if (this.peek() === ')') throw new Error('Empty parentheses')
      const query = this.parseOr()
      if (this.take() !== ')') throw new Error('Missing a closing parenthesis')
      return query
    }
    if (typeof token === 'string') throw new Error(`Unexpected ${token}`)
    return term(token.word)
  }
}

/** Null for blank text; throws on a syntax error, never on plain words. */
export function parseQuery(text: string): Query | null {
  const tokens = tokenize(text)
  if (tokens.length === 0) return null
  const parser = new Parser(tokens)
  const query = parser.parseOr()
  // Only a stray `)` can stop parseOr before the end.
  if (!parser.done()) throw new Error('Unexpected )')
  return query
}
