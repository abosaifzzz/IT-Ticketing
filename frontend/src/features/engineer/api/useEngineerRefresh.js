import { useEffect, useRef } from 'react'
export function useEngineerRefresh(refresh, busy = false) {
  const pending = useRef(busy)
  pending.current = busy
  useEffect(() => {
    const update = () => { if (!pending.current && document.visibilityState === 'visible') refresh(true) }
    window.addEventListener('focus', update)
    const timer = setInterval(update, 15000)
    return () => { clearInterval(timer); window.removeEventListener('focus', update) }
  }, [refresh])
}
