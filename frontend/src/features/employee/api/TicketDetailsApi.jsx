import { formatTicketReference } from '../../../services/tickets/formatTicketReference.js'
import { ArrowRight, CalendarDays, Hash, UserRound } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { ResolutionConfirmation } from '../../../components/tickets/ResolutionConfirmation'
import { StatusBadge } from '../../../components/tickets/StatusBadge'
import { TicketComments } from '../../../components/tickets/TicketComments'
import { Button } from '../../../components/ui/Button'
import { TicketTimeline } from '../../../components/tickets/TicketTimeline'
import { employeeTicketService as service } from '../../../services/tickets/employeeTicketService'
import { useApiQuery } from '../../../services/http/useApiQuery'
const dateFormatter = new Intl.DateTimeFormat('ar-EG', { dateStyle: 'full', timeStyle: 'short' })
export function TicketDetailsApi() {
 const{id}=useParams();const query=useApiQuery(id,(signal)=>service.details(id,signal));const ticket=query.data
 const run=async(action)=>{try{const item=await action(ticket);query.update(item);return item}catch(error){if(error.status===409)await query.refresh(true);throw error}}
 const addComment=(text)=>run((item)=>service.comment(item,text))
 const confirmResolution=()=>run((item)=>service.confirm(item))
 const reopen=(reason)=>run((item)=>service.reopen(item,reason))
 if(query.status==='loading')return <p role="status" className="content-card text-ink">جارٍ تحميل الطلبات...</p>
 if(!ticket)return <section className="content-card mx-auto max-w-xl text-center"><h1 className="text-2xl font-extrabold text-ink">الطلب غير متاح</h1><p role="alert" className="mt-3 text-muted">{query.error?.status===404?'لم يتم العثور على الطلب أو أنه لا يتبع حسابك الحالي.':query.error?.message}</p>{query.error?.status!==404&&<Button onClick={()=>query.refresh()}>إعادة المحاولة</Button>}<Link to="/employee/tickets" className="mt-6 block text-primary-600">العودة إلى طلباتي</Link></section>
  return <div className="mx-auto max-w-6xl">
    <Link to="/employee/tickets" className="mb-5 inline-flex items-center gap-2 text-sm font-bold text-primary-500"><ArrowRight size={17} />العودة إلى طلباتي</Link>
    <div className="page-heading"><div><p className="eyebrow flex items-center gap-1"><Hash size={14} /><bdi dir="ltr" title={ticket.reference}>{formatTicketReference(ticket)}</bdi></p><h1>{ticket.title}</h1><p>{ticket.description}</p></div><StatusBadge status={ticket.status} /></div>

    <section className="content-card"><dl className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4"><div><dt className="text-xs text-muted">اسم الموظف</dt><dd className="mt-1.5 font-bold text-ink">{ticket.reporterName}</dd></div><div><dt className="text-xs text-muted">القسم</dt><dd className="mt-1.5 font-bold text-ink">{ticket.department}</dd></div><div><dt className="text-xs text-muted">التصنيف</dt><dd className="mt-1.5 font-bold text-ink">{ticket.category}</dd></div><div><dt className="text-xs text-muted">التصنيف الفرعي</dt><dd className="mt-1.5 font-bold text-ink">{ticket.subcategory}</dd></div><div className="sm:col-span-2"><dt className="flex items-center gap-2 text-xs text-muted"><CalendarDays size={15} />التاريخ والوقت</dt><dd className="mt-1.5 font-bold text-ink">{dateFormatter.format(new Date(ticket.createdAt))}</dd></div><div className="sm:col-span-2"><dt className="flex items-center gap-2 text-xs text-muted"><UserRound size={15} />المهندس المسؤول</dt><dd className="mt-1.5 font-bold text-ink">{ticket.assignedTechnician ?? 'لم يتم الإسناد بعد'}</dd></div></dl></section>

    <section className="content-card mt-6"><h2 className="text-lg font-extrabold text-ink">ملاحظات المهندس العامة</h2>{ticket.publicTechnicianNotes?.length ? <div className="mt-4 space-y-3">{ticket.publicTechnicianNotes.map((note) => <article key={note.id} className="rounded-xl bg-canvas p-4"><p className="text-sm leading-7 text-muted">{note.text}</p><time className="mt-2 block text-xs text-muted">{dateFormatter.format(new Date(note.createdAt))}</time></article>)}</div> : <p className="mt-3 text-sm text-muted">لم يضف المهندس ملاحظات عامة بعد.</p>}</section>

    <div className="mt-6"><ResolutionConfirmation ticket={ticket} onConfirm={confirmResolution} onReopen={reopen} /></div>
    <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]"><TicketTimeline ticket={ticket} /><TicketComments ticket={ticket} onAddComment={addComment} /></div>
  </div>
}
