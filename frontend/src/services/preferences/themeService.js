import { localStorageAdapter } from '../storage/localStorageAdapter.js'

const STORAGE_KEY = 'hospital-helpdesk:theme'

function preferredTheme() {
  const storedTheme = localStorageAdapter.get(STORAGE_KEY)
  if (storedTheme === 'light' || storedTheme === 'dark') return storedTheme
  return 'light'
}

function applyTheme(theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  document.documentElement.dataset.theme = theme
  return theme
}

export const themeService = {
  initialize() { return applyTheme(preferredTheme()) },
  getActiveTheme() { return document.documentElement.classList.contains('dark') ? 'dark' : 'light' },
  set(theme) { localStorageAdapter.set(STORAGE_KEY, theme); return applyTheme(theme) },
  toggle() { return this.set(this.getActiveTheme() === 'dark' ? 'light' : 'dark') },
}
