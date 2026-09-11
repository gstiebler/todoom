// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { loadLocale, pluralOf, saveLocale, STRINGS, t } from './i18n'

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('loadLocale', () => {
  it('prefers a stored choice', () => {
    saveLocale('pt-BR')
    expect(loadLocale()).toBe('pt-BR')
  })

  it('ignores a stored value it does not know', () => {
    localStorage.setItem('todoom.locale', 'fr')
    expect(loadLocale()).toBe('en')
  })

  it('falls back to the browser language', () => {
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('pt-PT')
    expect(loadLocale()).toBe('pt-BR')
  })

  it('defaults to English', () => {
    expect(loadLocale()).toBe('en')
  })
})

describe('t', () => {
  it('returns the string for the locale', () => {
    expect(t('en', 'sidebar.saved')).toBe('Saved')
    expect(t('pt-BR', 'sidebar.saved')).toBe('Salvo')
  })

  it('replaces params', () => {
    expect(t('en', 'task.waitingOn', { title: 'Call plumber' })).toBe('Waiting on Call plumber')
  })

  it('leaves a placeholder alone when the param is missing', () => {
    expect(t('en', 'task.waitingOn')).toBe('Waiting on {title}')
  })

  it('has every English key in Portuguese', () => {
    expect(Object.keys(STRINGS['pt-BR']).sort()).toEqual(Object.keys(STRINGS.en).sort())
  })
})

describe('pluralOf', () => {
  it('picks one or other', () => {
    expect(pluralOf('en', 1)).toBe('one')
    expect(pluralOf('en', 2)).toBe('other')
    expect(pluralOf('pt-BR', 0)).toBe('one')
  })
})
