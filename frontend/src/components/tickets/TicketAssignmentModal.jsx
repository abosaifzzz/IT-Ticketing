import { formatTicketReference } from '../../services/tickets/formatTicketReference.js'
import { BriefcaseBusiness, CheckCircle2, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { Button } from '../ui/Button'

export function TicketAssignmentModal({ ticket, technicians, workloads, onClose, onSave }) {
  const [selectedId, setSelectedId] = useState(ticket.assignedTechnicianId ?? '')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)
  const selectedEngineer = technicians.find((technician) => technician.id === selectedId)
  const canAssign = Boolean(selectedEngineer?.active)

  const submit = async (event) => {
    event.preventDefault()
    if (!canAssign || lock.current) return
    lock.current = true
    setBusy(true)
    setError('')
    try {
      if (!await onSave(selectedId)) setError('تعذر الإسناد. تحقق من حالة حساب المهندس وحدّث الصفحة ثم حاول مرة أخرى.')
    } catch (failure) { setError(failure.message || 'تعذر حفظ الإسناد. حدّث الصفحة وحاول مرة أخرى.') }
    finally { lock.current = false; setBusy(false) }
  }

  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/55 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="assignment-title" onMouseDown={(event) => !busy && event.target === event.currentTarget && onClose()}>
    <section className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl border border-border bg-surface p-5 shadow-2xl sm:max-w-2xl sm:rounded-3xl sm:p-6">
      <div className="flex items-start justify-between gap-4"><div><p className="eyebrow"><bdi dir="ltr" title={ticket.reference}>{formatTicketReference(ticket)}</bdi></p><h2 id="assignment-title" className="mt-1 text-xl font-extrabold text-ink">{ticket.assignedTechnicianId ? 'إعادة إسناد التذكرة' : 'إسناد التذكرة'}</h2><p className="mt-2 text-sm text-muted">{ticket.title}</p></div><button type="button" className="icon-button" onClick={onClose} disabled={busy} aria-label="إغلاق نافذة الإسناد"><X size={20} /></button></div>

      <form onSubmit={submit} className="mt-6" aria-busy={busy}><fieldset disabled={busy}><legend className="field-label">اختر مهندس تكنولوجيا المعلومات</legend><div className="space-y-3">{technicians.map((technician) => {
        const disabled = !technician.active
        const status = !technician.active ? 'غير نشط' : technician.available === false ? 'غير متاح مؤقتًا' : 'متاح للإسناد'
        return <label key={technician.id} className={`flex items-center gap-3 rounded-2xl border p-4 transition ${disabled ? 'cursor-not-allowed border-border bg-canvas opacity-60' : selectedId === technician.id ? 'cursor-pointer border-primary-500 bg-primary-50 dark:bg-primary-900/20' : 'cursor-pointer border-border hover:border-primary-300'}`}><input type="radio" name="technician" value={technician.id} checked={selectedId === technician.id} onChange={(event) => { setSelectedId(event.target.value); setError('') }} disabled={disabled} className="size-4 accent-primary-600" /><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-100 text-primary-700 dark:bg-primary-900 dark:text-primary-200"><BriefcaseBusiness size={19} /></span><span className="min-w-0 flex-1"><span className="block font-extrabold text-ink">{technician.name}</span><span className="mt-1 block text-xs text-muted">{technician.jobTitle ?? technician.specialty}</span></span><span className="text-left"><span className="block text-sm font-extrabold text-ink">{workloads[technician.id] ?? 0}</span><span className="block text-[11px] text-muted">مهام حالية</span></span><span className={`rounded-full px-2.5 py-1 text-[11px] font-extrabold ${!technician.active ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200' : technician.available === false ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200' : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'}`}>{status}</span></label>
      })}</div>{!technicians.length && <p className="mt-4 text-sm text-muted">لا يوجد مهندسون متاحون للإسناد.</p>}</fieldset>{selectedEngineer?.active && selectedEngineer.available === false && <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">هذا المهندس غير متاح مؤقتًا، لكن يمكنك إسناد التذكرة إليه بقرار المدير.</p>}{error && <p role="alert" className="mt-4 text-sm font-bold text-red-700 dark:text-red-300">{error}</p>}<div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><Button type="button" variant="secondary" disabled={busy} onClick={onClose}>إلغاء</Button><Button type="submit" disabled={!canAssign || busy}><CheckCircle2 size={18} />{busy ? 'جارٍ حفظ الإسناد...' : 'حفظ الإسناد'}</Button></div></form>
    </section>
  </div>
}
