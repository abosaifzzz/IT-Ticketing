import { createHttpClient } from '../http/client.js'
import { createApiAuthProvider } from './apiAuthProvider.js'
import { authMode } from './mode.js'

const invalidationListeners = new Set()
export const httpClient = createHttpClient({
  baseUrl: import.meta.env?.VITE_API_BASE_URL ?? '/api',
  onUnauthorized: () => { for (const listener of invalidationListeners) listener() },
})
// Production never selects or falls back to a mock provider.
const provider = import.meta.env?.DEV === true && authMode === 'mock'
  ? (await import('./mockAuthProvider.js')).mockAuthProvider
  : createApiAuthProvider(httpClient)

export const authService = {
  mode: authMode,
  login(credentials) { return provider.login(credentials) },
  logout() { return provider.logout() },
  restoreSession() { return provider.restoreSession() },
  subscribeInvalidation(listener) { invalidationListeners.add(listener); return () => invalidationListeners.delete(listener) },
}
