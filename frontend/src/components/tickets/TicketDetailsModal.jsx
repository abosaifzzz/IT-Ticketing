import { formatTicketReference } from '../../services/tickets/formatTicketReference.js'
import { CalendarDays, Hash, UserRound, X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { ResolutionConfirmation } from './ResolutionConfirmation'
import { StatusBadge } from './StatusBadge'
import { TicketComments } from './TicketComments'
import { TicketTimeline } from './TicketTimeline'

const dateFormatter = new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium', timeStyle: 'short' })

export function TicketDetailsModal({ ticket, onClose, onStatusChange, onAddComment }) {
  const dialog = useRef(null), close = useRef(onClose)
  close.current = onClose
  const ticketId = ticket?.id
  useEffect(() => {
    if (!ticketId) return
    const previous = document.activeElement, overflow = document.body.style.overflow, root = dialog.current
    document.body.style.overflow = 'hidden'
    root?.querySelector('button')?.focus()
    const keyboard = (event) => {
      if (event.key === 'Escape') { event.preventDefault(); close.current(); return }
      if (event.key !== 'Tab') return
      const controls = [...root.querySelectorAll('button:not(:disabled), a[href], textarea:not(:disabled), input:not(:disabled)')]
      const first = controls[0], last = controls.at(-1)
      if (event.shiftKey && (document.activeElement === first || !root.contains(document.activeElement))) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && (document.activeElement === last || !root.contains(document.activeElement))) { event.preventDefault(); first?.focus() }
    }
    document.addEventListener('keydown', keyboard)
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', keyboard); if (previous?.isConnected) previous.focus() }
  }, [ticketId])

  if (!ticket) return null
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/55 p-0 sm:items-center sm:p-5" onMouseDown={onClose} role="presentation">
    <section ref={dialog} className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl border border-border bg-surface p-5 shadow-2xl sm:rounded-3xl sm:p-7" role="dialog" aria-modal="true" aria-labelledby="ticket-modal-title" onMouseDown={(event) => event.stopPropagation()}>
      <div className="flex items-start justify-between gap-4"><div className="min-w-0 break-all"><p className="flex items-center gap-1.5 text-xs font-extrabold text-primary-500"><Hash size={14} /><bdi dir="ltr" title={ticket.reference}>{formatTicketReference(ticket)}</bdi></p><h2 id="ticket-modal-title" className="mt-2 text-xl font-extrabold text-ink sm:text-2xl">{ticket.title}</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="إغلاق"><X size={19} /></button></div>
      <div className="mt-5"><StatusBadge status={ticket.status} /></div>

      <dl className="mt-6 grid gap-4 rounded-2xl bg-canvas p-4 sm:grid-cols-2">
        <div><dt className="flex items-center gap-2 text-xs text-muted"><CalendarDays size={15} />تاريخ الإنشاء</dt><dd className="mt-1.5 text-sm font-bold text-ink">{dateFormatter.format(new Date(ticket.createdAt))}</dd></div>
        <div><dt className="flex items-center gap-2 text-xs text-muted"><UserRound size={15} />المهندس المسؤول</dt><dd className="mt-1.5 text-sm font-bold text-ink">{ticket.assignedTechnician ?? 'لم يتم الإسناد بعد'}</dd></div>
        <div><dt className="text-xs text-muted">القسم</dt><dd className="mt-1.5 text-sm font-bold text-ink">{ticket.department}</dd></div>
        <div><dt className="text-xs text-muted">مقدم الطلب</dt><dd className="mt-1.5 text-sm font-bold text-ink">{ticket.reporterName}</dd></div>
        <div><dt className="text-xs text-muted">تصنيف العطل</dt><dd className="mt-1.5 text-sm font-bold text-ink">{ticket.category ?? 'غير مصنف'}</dd></div>
      </dl>
      <div className="mt-5"><h3 className="text-sm font-extrabold text-ink">وصف العطل</h3><p className="mt-2 text-sm leading-7 text-muted">{ticket.description ?? 'لا يوجد وصف متاح.'}</p></div>

      {onAddComment && <div className="mt-5"><TicketComments ticket={ticket} onAddComment={onAddComment} /></div>}
      <div className="mt-7"><TicketTimeline ticket={ticket} audience="employee" /></div>

      <div className="mt-7"><ResolutionConfirmation ticket={ticket} onConfirm={() => onStatusChange('closed')} onReopen={(reason) => onStatusChange('reopened', reason)} /></div>
      <Link to={`/employee/tickets/${ticket.id}`} onClick={onClose} className="mt-6 inline-flex text-sm font-extrabold text-primary-500 hover:text-primary-700">فتح صفحة التفاصيل الكاملة</Link>
    </section>
  </div>
}
