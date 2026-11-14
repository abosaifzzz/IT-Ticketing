import { useCallback, useEffect, useRef, useState } from 'react'

export function useApiQuery(key, loader) {
  const current = useRef({ key, loader })
  current.current = { key, loader }
  const mounted = useRef(false)
  const controller = useRef(null)
  const [state, setState] = useState({ key, data: null, status: 'loading', error: null })
  const refresh = useCallback(async (background = false) => {
    const requestKey = current.current.key
    controller.current?.abort()
    const request = new AbortController()
    controller.current = request
    if (mounted.current) setState((old) => ({ key: requestKey, data: background && old.key === requestKey ? old.data : null, status: background && old.data && old.key === requestKey ? 'ready' : 'loading', error: null }))
    try {
      const data = await current.current.loader(request.signal)
      if (mounted.current && !request.signal.aborted && requestKey === current.current.key) setState({ key: requestKey, data, status: 'ready', error: null })
    } catch (error) {
      if (mounted.current && !request.signal.aborted && requestKey === current.current.key) setState((old) => ({ ...old, status: old.data ? 'ready' : 'error', error }))
    }
  }, [])
  useEffect(() => {
    mounted.current = true
    refresh()
    return () => { mounted.current = false; controller.current?.abort() }
  }, [key, refresh])
  const update = useCallback((data) => {
    if (mounted.current && current.current.key === key) { controller.current?.abort(); setState({ key, data, status: 'ready', error: null }) }
  }, [key])
  return { ...(state.key === key ? state : { data: null, status: 'loading', error: null }), refresh, update }
}
