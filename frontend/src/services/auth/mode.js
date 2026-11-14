export function authenticationMode({ mode = 'api', development = false } = {}) {
  if (mode === 'api') return 'api'
  if (mode === 'mock' && development) return 'mock'
  throw new Error('Mock authentication requires explicit development mode')
}
export const authMode = authenticationMode({ mode: import.meta.env?.VITE_AUTH_MODE ?? 'api', development: import.meta.env?.DEV === true })
