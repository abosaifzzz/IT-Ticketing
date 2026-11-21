import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, Info, X, XCircle } from 'lucide-react'
import { appEvents, EVENT_NAMES } from '../../services/events/eventBus'
import { CONNECTION_LOST_MESSAGE, IT_SUPPORT_PHONE } from '../../services/http/client'
import { toast } from '../../services/feedback/toastService'

const styles = {
  success: { icon: CheckCircle2, accent: 'border-s-green-600 text-green-700 dark:text-green-300', label: 'تم بنجاح' },
  error: { icon: XCircle, accent: 'border-s-red-600 text-red-700 dark:text-red-300', label: 'خطأ' },
  info: { icon: Info, accent: 'border-s-primary-500 text-primary-600 dark:text-primary-200', label: 'تنبيه' },
}

// The IT support number becomes a WhatsApp link wherever it appears in a toast.
function withSupportLink(message) {
  const parts = message.split(IT_SUPPORT_PHONE)
  if (parts.length === 1) return message
  return parts.flatMap((part, index) => index === 0 ? [part] : [<a key={index} href={`https://wa.me/2${IT_SUPPORT_PHONE}`} target="_blank" rel="noreferrer" className="text-primary-600 underline dark:text-primary-200"><bdi dir="ltr">{IT_SUPPORT_PHONE}</bdi></a>, part])
}

// Single app-level toast region. Success uses a polite live region; errors use an assertive alert.
export function Toaster() {
  const [items, setItems] = useState([])
  const timers = useRef(new Map())
  const dismiss = (id) => { clearTimeout(timers.current.get(id)); timers.current.delete(id); setItems((current) => current.filter((item) => item.id !== id)) }
  useEffect(() => {
    const active = timers.current
    const unsubscribe = appEvents.subscribe(EVENT_NAMES.TOAST_SHOWN, (item) => {
      setItems((current) => [...current.filter((existing) => !(existing.message === item.message && existing.type === item.type)), item].slice(-4))
      active.set(item.id, setTimeout(() => { active.delete(item.id); setItems((current) => current.filter((existing) => existing.id !== item.id)) }, item.duration))
    })
    return () => { unsubscribe(); active.forEach(clearTimeout); active.clear() }
  }, [])
  // The device itself lost its network: tell the user immediately, in any feature.
  useEffect(() => {
    const offline = () => toast.error(CONNECTION_LOST_MESSAGE, { duration: 15000 })
    const online = () => toast.success('عاد الاتصال بالشبكة.')
    window.addEventListener('offline', offline); window.addEventListener('online', online)
    return () => { window.removeEventListener('offline', offline); window.removeEventListener('online', online) }
  }, [])
  const polite = items.filter((item) => item.type !== 'error'), urgent = items.filter((item) => item.type === 'error')
  const render = (item) => {
    const { icon: Icon, accent, label } = styles[item.type] ?? styles.info
    return <div key={item.id} data-toast={item.type} role={item.type === 'error' ? 'alert' : 'status'} className={`pointer-events-auto flex items-start gap-3 rounded-xl border border-border border-s-4 bg-surface p-4 text-ink shadow-xl ${accent}`}>
      <Icon size={20} className="mt-0.5 shrink-0" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-sm font-bold text-ink"><span className="sr-only">{label}: </span>{withSupportLink(item.message)}</p>
      <button type="button" onClick={() => dismiss(item.id)} className="shrink-0 rounded-lg p-1 text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-primary-500" aria-label="إغلاق الإشعار"><X size={16} /></button>
    </div>
  }
  return <div dir="rtl" className="pointer-events-none fixed inset-x-4 top-4 z-[200] flex flex-col gap-2 sm:inset-x-auto sm:start-4 sm:w-96">
    <div aria-live="polite" className="flex flex-col gap-2">{polite.map(render)}</div>
    <div aria-live="assertive" className="flex flex-col gap-2">{urgent.map(render)}</div>
  </div>
}
