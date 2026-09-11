import { describe, expect, test } from 'vitest'
import { buildPrompt, retryPrompt } from './nlPrompt'

const TODAY = '2026-09-10'

describe('buildPrompt', () => {
  test('carries the date, the labels and the one-line rule', () => {
    const prompt = buildPrompt({ projects: ['work', 'house'], contexts: ['phone'] }, TODAY)
    expect(prompt).toContain('Today is 2026-09-10')
    expect(prompt).toContain('Projects: +work +house')
    expect(prompt).toContain('Contexts: @phone')
    expect(prompt).toContain('exactly one line')
  })

  test('omits the label lines when there are no labels', () => {
    const prompt = buildPrompt({ projects: [], contexts: [] }, TODAY)
    expect(prompt).not.toContain('Projects:')
    expect(prompt).not.toContain('Contexts:')
  })

  test('resolves the week example against today', () => {
    expect(buildPrompt({ projects: [], contexts: [] }, TODAY)).toContain('deadline before:2026-09-17')
  })
})

describe('retryPrompt', () => {
  test('quotes the answer and the error', () => {
    expect(retryPrompt('+home |', 'Missing a term at the end')).toBe(
      'That answer, "+home |", is not valid: Missing a term at the end. Reply with only the corrected query.',
    )
  })
})
