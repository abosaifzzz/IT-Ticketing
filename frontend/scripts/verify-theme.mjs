const storage = new Map()
const classes = new Set()
globalThis.window = { localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) } }
globalThis.document = { documentElement: { classList: { toggle(name, enabled) { if (enabled) classes.add(name); else classes.delete(name) }, contains: (name) => classes.has(name) }, dataset: {} } }

const { themeService } = await import('../src/services/preferences/themeService.js')
if (themeService.initialize() !== 'light' || classes.has('dark')) throw new Error('First visit must use the light theme')
if (themeService.toggle() !== 'dark' || !classes.has('dark') || globalThis.document.documentElement.dataset.theme !== 'dark') throw new Error('Night mode did not activate')
if (storage.get('hospital-helpdesk:theme') !== '"dark"' || themeService.initialize() !== 'dark') throw new Error('Night mode did not persist across initialization')
if (themeService.toggle() !== 'light' || classes.has('dark') || themeService.initialize() !== 'light') throw new Error('Returning to light mode failed')
console.log('PASS light default, night toggle, preference persistence, and return to light')
