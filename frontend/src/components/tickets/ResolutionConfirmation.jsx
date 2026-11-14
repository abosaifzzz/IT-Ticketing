import { useRef, useState } from 'react'
import { Button } from '../ui/Button'
export function ResolutionConfirmation({ ticket, onConfirm, onReopen }) {
  const [showExplanation, setShowExplanation] = useState(false)
  const [explanation, setExplanation] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const lock = useRef(false)
  if (!['resolved', 'closed'].includes(ticket.status)) return null
  const awaitingConfirmation = !ticket.resolutionConfirmedAt
  const run = async (action) => {
    if (lock.current) return
    lock.current = true; setBusy(true); setError('')
    try { await action() } catch (failure) { setError(failure.message || 'تعذر تحديث الطلب.') } finally { lock.current = false; setBusy(false) }
  }
  return <section aria-busy={busy} className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-900/60 dark:bg-emerald-950/30 sm:p-6">
    <h2 className="text-xl font-extrabold text-ink">{awaitingConfirmation ? 'هل تم حل المشكلة؟' : 'هل عادت المشكلة؟'}</h2>
    <p className="mt-2 text-sm leading-7 text-muted">يمكنك تأكيد نجاح الحل أو إعادة فتح الطلب إذا كانت المشكلة ما زالت موجودة.</p>
    {error && <p role="alert" className="mt-3 text-red-700 dark:text-red-300">{error}</p>}
    {busy && <p role="status" className="mt-3 text-muted">جارٍ تحديث الطلب...</p>}
    {!showExplanation ? <div className="mt-5 flex flex-col gap-3 sm:flex-row">{awaitingConfirmation && <Button disabled={busy} onClick={() => run(onConfirm)}>نعم، تم حل المشكلة</Button>}<Button disabled={busy} variant="secondary" onClick={() => setShowExplanation(true)}>{awaitingConfirmation ? 'لا، المشكلة ما زالت موجودة' : 'إعادة فتح الطلب'}</Button></div> : <div className="mt-5"><label><span className="field-label">اشرح ما زال يحدث — اختياري</span><textarea value={explanation} disabled={busy} maxLength={2000} onChange={(event) => setExplanation(event.target.value)} className="field-textarea" placeholder="أضف توضيحًا يساعد المهندس على استكمال المعالجة" /></label><div className="mt-3 flex flex-col gap-3 sm:flex-row"><Button disabled={busy} onClick={() => run(() => onReopen(explanation))}>إعادة فتح الطلب</Button><Button disabled={busy} variant="secondary" onClick={() => setShowExplanation(false)}>رجوع</Button></div></div>}
  </section>
}
