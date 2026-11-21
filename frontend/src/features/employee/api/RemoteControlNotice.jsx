import { MonitorSmartphone, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '../../../components/ui/Button'

const SECONDS = 15

// Shown for 15 seconds after an employee submits a ticket: if IT asks to control the PC
// remotely, Windows shows a "Remote Control Request" window and the employee should click Yes.
export function RemoteControlNotice({ onClose }) {
  const [left, setLeft] = useState(SECONDS)
  const closeRef = useRef(null)
  useEffect(() => {
    closeRef.current?.focus()
    const tick = setInterval(() => setLeft((value) => value - 1), 1000)
    const done = setTimeout(onClose, SECONDS * 1000)
    const escape = (event) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', escape)
    return () => { clearInterval(tick); clearTimeout(done); window.removeEventListener('keydown', escape) }
  }, [onClose])
  return <div className="fixed inset-0 z-[150] grid place-items-center bg-black/50 p-4" onClick={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section role="dialog" aria-modal="true" aria-labelledby="remote-notice-title" aria-describedby="remote-notice-text" dir="rtl" className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-surface p-5 shadow-xl sm:p-7">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary-50 text-primary-600 dark:bg-primary-900/30 dark:text-primary-200"><MonitorSmartphone size={22} aria-hidden="true" /></span><h2 id="remote-notice-title" className="text-xl font-extrabold text-ink">تم إرسال طلبك بنجاح</h2></div>
        <button ref={closeRef} type="button" onClick={onClose} className="rounded-lg p-1 text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-primary-500" aria-label="إغلاق"><X size={20} /></button>
      </div>
      <p id="remote-notice-text" className="mt-4 leading-7 text-ink">قد يتصل فريق تكنولوجيا المعلومات بجهازك عن بُعد لحل المشكلة. إذا ظهرت لك هذه النافذة <strong>«Remote Control Request»</strong> اضغط على <strong>Yes</strong> للموافقة.</p>
      <img src="/help/remote-control-request.jpg" alt="نافذة Remote Control Request وعليها سهم يشير إلى زر Yes" className="mt-5 w-full rounded-xl border border-border bg-white object-contain" />
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted" aria-live="off">تُغلق تلقائيًا بعد <bdi>{Math.max(left, 0)}</bdi> ثانية</p><Button type="button" onClick={onClose}>فهمت</Button></div>
      <div className="mt-3 h-1 overflow-hidden rounded-full bg-canvas" aria-hidden="true"><div className="h-full bg-primary-500 transition-[width] duration-1000 ease-linear" style={{ width: `${(Math.max(left, 0) / SECONDS) * 100}%` }} /></div>
    </section>
  </div>
}
