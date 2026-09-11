// @vitest-environment jsdom
import { afterEach, describe, it, expect } from 'vitest'
import { loadSort, saveSort } from './sortPref'

describe('sort preference', () => {
  afterEach(() => localStorage.clear())

  it('is smart until something is stored', () => {
    expect(loadSort()).toBe('smart')
  })

  it('round trips manual and ignores junk', () => {
    saveSort('manual')
    expect(loadSort()).toBe('manual')
    localStorage.setItem('todoom.sort', 'nonsense')
    expect(loadSort()).toBe('smart')
  })
})
