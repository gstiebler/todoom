// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { syncFilterHistory } from './urlHistory'
import { emptyFilter } from '../core/query'

beforeEach(() => {
  window.history.replaceState(null, '', '/todoom/')
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('syncFilterHistory', () => {
  it('pushes one entry per navigable filter change', () => {
    const pushSpy = vi.spyOn(window.history, 'pushState')

    const base = emptyFilter()
    const overdue = { ...base, dueView: 'overdue' as const }
    const today = { ...base, dueView: 'today' as const }

    syncFilterHistory(base, overdue)
    expect(pushSpy).toHaveBeenCalledTimes(1)

    syncFilterHistory(overdue, today)
    expect(pushSpy).toHaveBeenCalledTimes(2)

    syncFilterHistory(today, { ...today, sort: 'manual' })
    expect(pushSpy).toHaveBeenCalledTimes(3)
  })

  it('replaces rather than pushes for repeated search-box changes', () => {
    const pushSpy = vi.spyOn(window.history, 'pushState')
    const replaceSpy = vi.spyOn(window.history, 'replaceState')

    const base = emptyFilter()
    const search1 = { ...base, search: 'p' }
    const search2 = { ...base, search: 'pl' }
    const search3 = { ...base, search: 'plu' }

    syncFilterHistory(base, search1)
    syncFilterHistory(search1, search2)
    syncFilterHistory(search2, search3)

    expect(pushSpy).not.toHaveBeenCalled()
    expect(replaceSpy).toHaveBeenCalledTimes(3)
  })

  it('pushes nothing when re-syncing an unchanged filter', () => {
    const pushSpy = vi.spyOn(window.history, 'pushState')

    const base = emptyFilter()
    const sameAgain = { ...base }

    syncFilterHistory(base, sameAgain)

    expect(pushSpy).not.toHaveBeenCalled()
  })
})
