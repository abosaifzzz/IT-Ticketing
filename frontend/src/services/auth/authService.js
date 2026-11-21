import { createHttpClient } from '../http/client.js'
import { createApiAuthProvider } from './apiAuthProvider.js'
import { createAccountProfileApi } from './accountProfileApi.js'
import { authMode } from './mode.js'

const invalidationListeners = new Set()
const setupListeners = new Set()
export const httpClient = createHttpClient({
  baseUrl: import.meta.env?.VITE_API_BASE_URL ?? '/api',
  onUnauthorized: () => { for (const listener of invalidationListeners) listener() },
  onSetupRequired: () => { for (const listener of setupListeners) listener() },
})
// Production never selects or falls back to a mock provider.
const provider = import.meta.env?.DEV === true && authMode === 'mock'
  ? (await import('./mockAuthProvider.js')).mockAuthProvider
  : createApiAuthProvider(httpClient)
const profileApi = createAccountProfileApi(httpClient)

export const authService = {
  mode: authMode,
  login(credentials) { return provider.login(credentials) },
  logout() { return provider.logout() },
  restoreSession() { return provider.restoreSession() },
  setupOptions: profileApi.setupOptions,
  profile: profileApi.profile,
  completeSetup: profileApi.completeSetup,
  updateProfile: profileApi.updateProfile,
  subscribeInvalidation(listener) { invalidationListeners.add(listener); return () => invalidationListeners.delete(listener) },
  subscribeSetupRequired(listener) { setupListeners.add(listener); return () => setupListeners.delete(listener) },
}
