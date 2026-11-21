import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { authService } from '../../services/auth/authService'
import { AuthContext } from './authContext'

export function AuthProvider({ children }) {
  const [state, setState] = useState({ session: null, status: 'loading', error: '' })
  const generation = useRef(0)
  const mounted = useRef(false)
  const actionPending = useRef(false)
  const restore = useCallback(async ({ background = false } = {}) => {
    const run = ++generation.current
    if (!background) setState({ session: null, status: 'loading', error: '' })
    try {
      const session = await authService.restoreSession()
      if (mounted.current && run === generation.current) setState({ session, status: 'ready', error: '' })
    } catch (error) {
      if (mounted.current && run === generation.current) setState({ session: null, status: 'error', error: error.message })
    }
  }, [])
  useEffect(() => {
    mounted.current = true
    const unsubscribe = authService.subscribeInvalidation(() => {
      generation.current++
      if (mounted.current) setState({ session: null, status: 'ready', error: '' })
    })
    const unsubscribeSetup = authService.subscribeSetupRequired(() => restore({ background: true }))
    restore()
    // Restore server-owned identity on returning to a tab; never read a stored API session.
    const focus = () => { if (authService.mode === 'api' && !actionPending.current) restore({ background: true }) }
    window.addEventListener('focus', focus)
    return () => { mounted.current = false; unsubscribe(); unsubscribeSetup(); window.removeEventListener('focus', focus) }
  }, [restore])
  const value = useMemo(() => ({
    ...state, user: state.session?.user ?? null, isAuthenticated: Boolean(state.session), mode: authService.mode, retry: restore,
    async login(credentials) {
      const run = ++generation.current
      actionPending.current = true
      try {
        const session = await authService.login(credentials)
        if (mounted.current && run === generation.current) setState({ session, status: 'ready', error: '' })
        return session
      } finally { actionPending.current = false }
    },
    async logout() {
      const run = ++generation.current
      // Preserve the current identity on failure so the user can retry server logout.
      actionPending.current = true
      try {
        await authService.logout()
        if (mounted.current && run === generation.current) setState({ session: null, status: 'ready', error: '' })
      } finally { actionPending.current = false }
    },
    clearSession() { generation.current++; setState({ session: null, status: 'ready', error: '' }) },
  }), [state, restore])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
