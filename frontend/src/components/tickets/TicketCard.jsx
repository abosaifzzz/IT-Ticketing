import { formatTicketReference } from '../../services/tickets/formatTicketReference.js'
import { ArrowLeft, CalendarDays, Hash, UserRound } from 'lucide-react'
import { StatusBadge } from './StatusBadge'

const dateFormatter = new Intl.DateTimeFormat('ar-EG', { day: 'numeric', month: 'long', year: 'numeric' })

export function TicketCard({ ticket, onOpen, detailed = false }) {
  return <article className="rounded-2xl border border-border bg-surface p-5 transition hover:border-primary-200 hover:shadow-panel dark:hover:border-primary-800">
    <div className="flex flex-wrap items-center justify-between gap-3"><span className="flex items-center gap-1.5 text-xs font-extrabold text-primary-500"><Hash size={14} /><bdi dir="ltr" title={ticket.reference}>{formatTicketReference(ticket)}</bdi></span><StatusBadge status={ticket.status} /></div>
    <h3 className="mt-4 text-base font-extrabold leading-7 text-ink">{ticket.title}</h3>
    {detailed && <><p className="mt-2 line-clamp-2 text-sm leading-6 text-muted">{ticket.description ?? 'لا يوجد وصف متاح.'}</p><div className="mt-3 flex flex-wrap gap-2 text-xs"><span className="rounded-lg bg-canvas px-2.5 py-1.5 text-muted">{ticket.reporterName}</span><span className="rounded-lg bg-canvas px-2.5 py-1.5 text-muted">{ticket.department}</span><span className="rounded-lg bg-canvas px-2.5 py-1.5 text-muted">{ticket.category ?? 'غير مصنف'}</span></div></>}
    <div className="mt-4 space-y-2 text-xs text-muted"><p className="flex items-center gap-2"><CalendarDays size={15} /><span>تاريخ الإنشاء: {dateFormatter.format(new Date(ticket.createdAt))}</span></p><p className="flex items-center gap-2"><UserRound size={15} /><span>المهندس المسؤول: {ticket.assignedTechnician ?? 'لم يتم الإسناد بعد'}</span></p></div>
    <button type="button" onClick={() => onOpen(ticket)} className="mt-5 inline-flex items-center gap-2 text-sm font-extrabold text-primary-500 hover:text-primary-700 dark:hover:text-primary-300">متابعة تفاصيل الطلب <ArrowLeft size={16} /></button>
  </article>
}
