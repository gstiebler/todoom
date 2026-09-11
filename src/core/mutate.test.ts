import { describe, it, expect } from 'vitest'
import {
  complete,
  uncomplete,
  createTask,
  setPairValue,
  removePair,
  addAttachment,
  removeAttachment,
  setNote,
  setDue,
  setDeadline,
  setRec,
  setPriority,
  toggleLabel,
} from './mutate'
import { parseLine } from './parse'
import { formatTask } from './format'

describe('setPairValue', () => {
  it('appends a pair that is not present', () => {
    expect(setPairValue('Buy milk', 'due', '2026-09-12')).toBe('Buy milk due:2026-09-12')
  })

  it('replaces a pair in place', () => {
    expect(setPairValue('Buy milk due:2026-09-01 @store', 'due', '2026-09-12')).toBe(
      'Buy milk due:2026-09-12 @store',
    )
  })
})

describe('removePair', () => {
  it('removes a pair and leaves single spacing', () => {
    expect(removePair('Buy milk pri:A @store', 'pri')).toBe('Buy milk @store')
  })

  it('leaves the description alone when the key is absent', () => {
    expect(removePair('Buy milk', 'pri')).toBe('Buy milk')
  })
})

describe('complete', () => {
  it('marks the task done and stamps the completion date', () => {
    const t = complete(parseLine('Buy milk'), '2026-09-10')
    expect(formatTask(t)).toBe('x 2026-09-10 Buy milk')
  })

  it('preserves the creation date', () => {
    const t = complete(parseLine('2026-09-09 Buy milk'), '2026-09-10')
    expect(formatTask(t)).toBe('x 2026-09-10 2026-09-09 Buy milk')
  })

  it('moves the priority into a pri pair', () => {
    const t = complete(parseLine('(A) Buy milk'), '2026-09-10')
    expect(formatTask(t)).toBe('x 2026-09-10 Buy milk pri:A')
    expect(t.priority).toBeUndefined()
  })

  it('does not change an already completed task', () => {
    const done = parseLine('x 2026-09-10 Buy milk')
    expect(formatTask(complete(done, '2026-09-11'))).toBe('x 2026-09-10 Buy milk')
  })
})

describe('uncomplete', () => {
  it('clears the marker and the completion date', () => {
    const t = uncomplete(parseLine('x 2026-09-10 2026-09-09 Buy milk'))
    expect(formatTask(t)).toBe('2026-09-09 Buy milk')
  })

  it('restores the priority from the pri pair', () => {
    const t = uncomplete(parseLine('x 2026-09-10 Buy milk pri:A'))
    expect(formatTask(t)).toBe('(A) Buy milk')
  })

  it('does not change an incomplete task', () => {
    const t = parseLine('Buy milk')
    expect(formatTask(uncomplete(t))).toBe('Buy milk')
  })
})

describe('createTask', () => {
  it('stamps a creation date', () => {
    expect(formatTask(createTask('Buy milk', '2026-09-09'))).toBe('2026-09-09 Buy milk')
  })

  it('keeps a creation date the user typed', () => {
    expect(formatTask(createTask('2026-01-01 Buy milk', '2026-09-09'))).toBe('2026-01-01 Buy milk')
  })

  it('keeps a typed priority ahead of the stamped date', () => {
    expect(formatTask(createTask('(A) Buy milk +house', '2026-09-09'))).toBe(
      '(A) 2026-09-09 Buy milk +house',
    )
  })
})

describe('raw field consistency', () => {
  it('complete updates raw to reflect the mutated task', () => {
    const t = complete(parseLine('Buy milk'), '2026-09-10')
    expect(t.raw).toBe(formatTask(t))
  })

  it('uncomplete updates raw to reflect the mutated task', () => {
    const t = uncomplete(parseLine('x 2026-09-10 2026-09-09 Buy milk'))
    expect(t.raw).toBe(formatTask(t))
  })

  it('complete with priority restores it as a pair and updates raw', () => {
    const t = complete(parseLine('(A) Buy milk'), '2026-09-10')
    expect(t.raw).toBe(formatTask(t))
    expect(t.raw).toBe('x 2026-09-10 Buy milk pri:A')
  })
})

describe('attachments', () => {
  it('appends a file id once', () => {
    const once = addAttachment(parseLine('Buy milk'), 'aaa')
    expect(addAttachment(once, 'aaa').raw).toBe('Buy milk file:aaa')
  })

  it('removes only the named file id', () => {
    const task = parseLine('Buy milk file:aaa file:bbb')
    expect(removeAttachment(task, 'aaa').raw).toBe('Buy milk file:bbb')
  })
})

describe('setNote', () => {
  it('adds a quoted desc word', () => {
    expect(setNote(parseLine('Buy milk'), 'Ask about the boiler').raw).toBe(
      'Buy milk desc:"Ask about the boiler"',
    )
  })

  it('replaces the note it already had', () => {
    expect(setNote(parseLine('Buy milk desc:"old" due:2026-09-12'), 'new').raw).toBe(
      'Buy milk due:2026-09-12 desc:"new"',
    )
  })

  it('drops the word when the note is emptied', () => {
    expect(setNote(parseLine('Buy milk desc:"old"'), '  ').raw).toBe('Buy milk')
  })

  it('replaces a quote inside the note so the word still parses', () => {
    expect(parseLine(setNote(parseLine('Buy milk'), 'the "big" one').raw).note).toBe(
      "the 'big' one",
    )
  })
})

describe('field mutations', () => {
  it('sets a due date', () => {
    expect(setDue(parseLine('Buy milk'), '2026-09-12').raw).toBe('Buy milk due:2026-09-12')
  })

  it('clears a due date', () => {
    expect(setDue(parseLine('Buy milk due:2026-09-12'), null).raw).toBe('Buy milk')
  })

  it('sets and clears a deadline', () => {
    const hard = setDeadline(parseLine('Buy milk'), '2026-09-20')
    expect(hard.raw).toBe('Buy milk deadline:2026-09-20')
    expect(setDeadline(hard, null).raw).toBe('Buy milk')
  })

  it('sets and clears a recurrence', () => {
    const every = setRec(parseLine('Buy milk'), '1w')
    expect(every.raw).toBe('Buy milk rec:1w')
    expect(setRec(every, null).raw).toBe('Buy milk')
  })

  it('sets a priority on an open task', () => {
    expect(setPriority(parseLine('Buy milk'), 'B').raw).toBe('(B) Buy milk')
  })

  it('clears a priority', () => {
    expect(setPriority(parseLine('(B) Buy milk'), null).raw).toBe('Buy milk')
  })

  it('adds and removes a label', () => {
    const tagged = toggleLabel(parseLine('Buy milk'), '+groceries')
    expect(tagged.projects).toEqual(['groceries'])
    expect(toggleLabel(tagged, '+groceries').raw).toBe('Buy milk')
  })
})
