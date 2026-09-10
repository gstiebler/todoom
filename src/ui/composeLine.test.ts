import { describe, it, expect } from 'vitest'
import { composeLine, emptyDraft } from './composeLine'

describe('composeLine', () => {
  it('passes plain text through', () => {
    expect(composeLine({ ...emptyDraft(), text: 'Buy milk' })).toBe('Buy milk')
  })

  it('prepends the chosen priority', () => {
    expect(composeLine({ ...emptyDraft(), text: 'Buy milk', priority: 'A' })).toBe('(A) Buy milk')
  })

  it('appends the chosen due date', () => {
    expect(composeLine({ ...emptyDraft(), text: 'Buy milk', due: '2026-09-12' })).toBe(
      'Buy milk due:2026-09-12',
    )
  })

  it('appends the chosen labels', () => {
    expect(composeLine({ ...emptyDraft(), text: 'Buy milk', labels: ['+groceries', '@shop'] })).toBe(
      'Buy milk +groceries @shop',
    )
  })

  it('appends the chosen repeat', () => {
    expect(composeLine({ ...emptyDraft(), text: 'Pay rent', rec: '1m' })).toBe('Pay rent rec:1m')
  })

  it('lets a typed priority win over the chip', () => {
    expect(composeLine({ ...emptyDraft(), text: '(B) Buy milk', priority: 'A' })).toBe(
      '(B) Buy milk',
    )
  })

  it('lets a typed due date win over the chip', () => {
    expect(composeLine({ ...emptyDraft(), text: 'Buy milk due:2026-10-01', due: '2026-09-12' })).toBe(
      'Buy milk due:2026-10-01',
    )
  })

  it('does not repeat a label already typed', () => {
    expect(composeLine({ ...emptyDraft(), text: 'Buy milk +groceries', labels: ['+groceries'] })).toBe(
      'Buy milk +groceries',
    )
  })

  it('trims surrounding whitespace', () => {
    expect(composeLine({ ...emptyDraft(), text: '  Buy milk  ' })).toBe('Buy milk')
  })
})

describe('attachments', () => {
  it('appends each attachment id', () => {
    expect(composeLine({ ...emptyDraft(), text: 'Buy milk', attachments: ['aaa', 'bbb'] })).toBe(
      'Buy milk file:aaa file:bbb',
    )
  })

  it('does not duplicate an id the text already carries', () => {
    expect(composeLine({ ...emptyDraft(), text: 'Buy milk file:aaa', attachments: ['aaa'] })).toBe(
      'Buy milk file:aaa',
    )
  })
})

describe('description', () => {
  it('appends the note as a quoted desc word', () => {
    expect(composeLine({ ...emptyDraft(), text: 'Buy milk', note: 'from the corner shop' })).toBe(
      'Buy milk desc:"from the corner shop"',
    )
  })

  it('leaves a desc the text already carries alone', () => {
    expect(composeLine({ ...emptyDraft(), text: 'Buy milk desc:"typed"', note: 'chip' })).toBe(
      'Buy milk desc:"typed"',
    )
  })
})
