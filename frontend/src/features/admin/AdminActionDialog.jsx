import { useEffect, useId, useRef, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { toast } from '../../services/feedback/toastService'

export function AdminActionDialog({ title, description, confirmLabel = 'تأكيد', destructive = false, onConfirm, onClose }) {
  const titleId = useId()
  const descriptionId = useId()
  const dialogRef = useRef(null)
  const inputRef = useRef(null)
  const busyRef = useRef(false)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const [password, setPassword] = useState('')
  const [acknowledged, setAcknowledged] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const previous = document.activeElement
    inputRef.current?.focus()
    const keydown = (event) => {
      if (event.key === 'Escape') { if (!busyRef.current) closeRef.current(); return }
      if (event.key !== 'Tab') return
      const focusable = [...dialogRef.current.querySelectorAll('input:not(:disabled),button:not(:disabled)')]
      if (!focusable.length) return
      const first = focusable[0], last = focusable.at(-1)
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', keydown)
    return () => { document.removeEventListener('keydown', keydown); previous?.focus?.() }
  }, [])

  const submit = async (event) => {
    event.preventDefault()
    if (busyRef.current) return
    if (!password) { toast.error('أدخل كلمة مرور حساب مسؤول النظام الحالي.'); return }
    if (destructive && !acknowledged) { toast.error('أكد أنك راجعت أثر هذا الإجراء.'); return }
    busyRef.current = true; setBusy(true)
    const secret = password
    setPassword('')
    try { await onConfirm(secret) }
    catch (failure) {
      // Errors are reported as toasts; the dialog stays open so the draft can be retried.
      toast.error(/\p{Script=Arabic}/u.test(failure.message ?? '') ? failure.message : failure.status === 401 ? 'تعذر إعادة التحقق. تأكد من كلمة المرور وحاول مجددًا.' : failure.status === 429 ? 'محاولات كثيرة. انتظر قليلًا ثم حاول مجددًا.' : failure.status === 409 ? 'تغيرت بيانات السجل أو تعارض الإجراء. حدّث الصفحة وحاول مجددًا.' : failure.status === 403 ? 'ليست لديك صلاحية تنفيذ هذا الإجراء.' : 'تعذر تنفيذ الإجراء. تحقق من البيانات ثم حاول مجددًا.')
      inputRef.current?.focus()
    }
    finally { busyRef.current = false; setBusy(false) }
  }

  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !busyRef.current) onClose() }}>
    <form ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} onSubmit={submit} className="max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-surface p-5 text-ink shadow-2xl sm:p-7" dir="rtl" aria-busy={busy}>
      <h2 id={titleId} className="text-xl font-extrabold">{title}</h2>
      <p id={descriptionId} className="mt-3 text-sm text-muted">{description}</p>
      {destructive && <label className="mt-4 flex items-start gap-2 rounded-xl border border-amber-500/40 p-3 text-sm"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} />أفهم أثر هذا الإجراء وأؤكد تنفيذه.</label>}
      <label className="mt-4 block"><span className="field-label">كلمة مرور حسابك الحالي لإعادة التحقق *</span><input ref={inputRef} className="field-input" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} disabled={busy} required /></label>
      <div className="mt-5 flex flex-wrap gap-2"><Button type="submit" disabled={busy}>{busy ? 'جارٍ التنفيذ...' : confirmLabel}</Button><Button type="button" variant="secondary" disabled={busy} onClick={onClose}>إلغاء</Button></div>
    </form>
  </div>
}
