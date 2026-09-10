/** The look: 'auto' follows the system's light/dark, 'terminal' is the green-on-black skin. */
export type Theme = 'auto' | 'terminal'

const KEY = 'todoom.theme'

export function loadTheme(): Theme {
  return localStorage.getItem(KEY) === 'terminal' ? 'terminal' : 'auto'
}

/** Puts the theme on the document, where the stylesheet reads it, and remembers it. */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement
  if (theme === 'terminal') root.setAttribute('data-theme', 'terminal')
  else root.removeAttribute('data-theme')
  localStorage.setItem(KEY, theme)
}
