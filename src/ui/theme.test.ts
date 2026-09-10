// @vitest-environment jsdom
import { beforeEach, expect, test } from 'vitest'
import { applyTheme, loadTheme } from './theme'

beforeEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
})

test('defaults to the system look', () => {
  expect(loadTheme()).toBe('auto')
})

test('applying the terminal look marks the document and is remembered', () => {
  applyTheme('terminal')
  expect(document.documentElement.getAttribute('data-theme')).toBe('terminal')
  expect(loadTheme()).toBe('terminal')
})

test('going back to auto clears the mark', () => {
  applyTheme('terminal')
  applyTheme('auto')
  expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
  expect(loadTheme()).toBe('auto')
})
