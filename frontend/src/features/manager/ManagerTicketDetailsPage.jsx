import { formatTicketReference } from '../../services/tickets/formatTicketReference.js'
import {authMode} from '../../services/auth/mode'
import {ManagerTicketDetailsApi} from './api/ManagerTicketDetailsApi'
import { ArrowRight, CalendarDays, CircleAlert, Hash, MessageSquareText, PackageOpen, ShieldCheck, UserRound, Wrench } from 'lucide-react'
import { useReducer, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { TicketAssignmentModal } from '../../components/tickets/TicketAssignmentModal'
import { StatusBadge } from '../../components/tickets/StatusBadge'
import { TicketTimeline } from '../../components/tickets/TicketTimeline'
import { Button } from '../../components/ui/Button'
import { mockAssetInventoryService, operationalStatusLabels } from '../../services/mock/mockAssetInventoryService'
import { mockTechnicianService } from '../../services/mock/mockTechnicianService'
import { getAssignmentSourceLabel, mockTicketService } from '../../services/mock/mockTicketService'
import { useAuth } from '../auth/useAuth'

const dateFormatter = new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium', timeStyle: 'short' })
const activeStatuses = new Set(['assigned', 'in_progress', 'pending', 'reopened'])

function MockManagerTicketDetailsPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const [, refresh] = useReducer((value) => value + 1, 0)
  const [assignmentOpen, setAssignmentOpen] = useState(false)
  const [message, setMessage] = useState(null)
  const ticket = mockTicketService.getById(id)
  const technicians = mockTechnicianService.getTechnicians()
  const allTickets = mockTicketService.getAll()
  const workloads = Object.fromEntries(technicians.map((technician) => [technician.id, allTickets.filter((item) => item.assignedTechnicianId === technician.id && activeStatuses.has(item.status)).length]))

  if (!ticket) return <section className="content-card mx-auto max-w-xl text-center"><CircleAlert className="mx-auto text-amber-500" size={42} /><h1 className="mt-4 text-2xl font-extrabold text-ink">التذكرة غير موجودة</h1><p className="mt-3 text-sm text-muted">تعذر العثور على التذكرة المطلوبة في بيانات النظام.</p><Link to="/manager/tickets" className="mt-6 inline-flex items-center gap-2 font-bold text-primary-600"><ArrowRight size={18} />العودة إلى جميع التذاكر</Link></section>

  const saveAssignment = (technicianId) => {
    const updated = mockTicketService.assign(ticket.id, technicianId, { id: user.id, name: user.name })
    if (updated) { setAssignmentOpen(false); setMessage('تم حفظ الإسناد وتحديث سجل النشاط.'); refresh() }
    return Boolean(updated)
  }
  const notes = [...(ticket.publicTechnicianNotes ?? []), ...(ticket.internalTechnicianNotes ?? [])].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  const relatedAsset = ticket.relatedAssetId ? mockAssetInventoryService.getById(ticket.relatedAssetId) : null

  return <div className="mx-auto max-w-7xl">
    <Link to="/manager/tickets" className="mb-5 inline-flex items-center gap-2 text-sm font-bold text-primary-600"><ArrowRight size={17} />العودة إلى جميع التذاكر</Link>
    <div className="page-heading"><div><p className="eyebrow flex items-center gap-1"><Hash size={14} /><bdi dir="ltr" title={ticket.reference}>{formatTicketReference(ticket)}</bdi></p><h1>{ticket.title}</h1><p>{ticket.description}</p></div><div className="flex flex-wrap items-center gap-3"><StatusBadge status={ticket.status} /><Button onClick={() => setAssignmentOpen(true)}>{ticket.assignedTechnicianId ? 'إعادة الإسناد' : 'إسناد التذكرة'}</Button></div></div>
    {message && <div role="status" className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">{message}</div>}

    <section className="content-card"><dl className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4"><div><dt className="text-xs text-muted">اسم طالب الدعم</dt><dd className="mt-1.5 font-bold text-ink">{ticket.reporterName}</dd></div>{ticket.requesterType === 'top_management' ? <div><dt className="text-xs text-muted">المنصب أو المكتب</dt><dd className="mt-1.5 font-bold text-ink">{ticket.managementPosition}</dd></div> : <div><dt className="text-xs text-muted">القسم</dt><dd className="mt-1.5 font-bold text-ink">{ticket.department}</dd></div>}<div><dt className="text-xs text-muted">التصنيف</dt><dd className="mt-1.5 font-bold text-ink">{ticket.category} / {ticket.subcategory}</dd></div><div><dt className="flex items-center gap-2 text-xs text-muted"><CalendarDays size={15} />تاريخ الإنشاء</dt><dd className="mt-1.5 font-bold text-ink">{dateFormatter.format(new Date(ticket.createdAt))}</dd></div><div><dt className="flex items-center gap-2 text-xs text-muted"><UserRound size={15} />المهندس المسؤول</dt><dd className="mt-1.5 font-bold text-ink">{ticket.assignedTechnician ?? 'لم يتم الإسناد'}</dd></div><div className="sm:col-span-2"><dt className="text-xs text-muted">جهة الإسناد الأخيرة</dt><dd className="mt-1.5 font-bold text-ink">{getAssignmentSourceLabel(ticket)}</dd></div><div className="sm:col-span-2 lg:col-span-4"><dt className="text-xs text-muted">الوصف الأصلي</dt><dd className="mt-1.5 whitespace-pre-wrap text-sm leading-7 text-ink">{ticket.description}</dd></div></dl></section>

    {relatedAsset && <section className="content-card mt-6"><h2 className="flex items-center gap-2 text-lg font-extrabold text-ink"><PackageOpen size={20} className="text-primary-600" />الأصل التقني المرتبط</h2><p className="mt-3 font-bold text-ink">{relatedAsset.name} · {relatedAsset.assetId}</p><p className="mt-1 text-sm text-muted">{operationalStatusLabels[relatedAsset.operationalStatus]} · سحبه المهندس: {relatedAsset.takenByEngineerName ?? 'غير مسجل'}</p><Button as={Link} to={`/it/assets/${relatedAsset.assetId}`} variant="secondary" className="mt-4">عرض سجل الأصل</Button></section>}

    {ticket.solutionDescription && <section className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-900 dark:bg-emerald-950/30"><h2 className="flex items-center gap-2 font-extrabold text-emerald-900 dark:text-emerald-200"><Wrench size={19} />مراجعة الحل المسجل</h2><p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-emerald-800 dark:text-emerald-100">{ticket.solutionDescription}</p>{ticket.resolvedAt && <time className="mt-2 block text-xs text-emerald-700 dark:text-emerald-300">وقت الحل: {dateFormatter.format(new Date(ticket.resolvedAt))}</time>}</section>}

    <div className="mt-6 grid gap-6 xl:grid-cols-2">
      <section className="content-card"><h2 className="flex items-center gap-2 text-lg font-extrabold text-ink"><ShieldCheck size={20} className="text-primary-600" />ملاحظات فريق تكنولوجيا المعلومات</h2>{notes.length ? <div className="mt-4 space-y-3">{notes.map((note) => <article key={note.id} className="rounded-xl border border-border bg-canvas p-4"><div className="flex items-center justify-between gap-3"><strong className="text-sm text-ink">{note.authorName}</strong><span className={`rounded-full px-2.5 py-1 text-[11px] font-extrabold ${note.visibility === 'internal' ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200' : 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200'}`}>{note.visibility === 'internal' ? 'داخلية' : 'عامة'}</span></div><p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-muted">{note.text}</p><time className="mt-2 block text-xs text-muted">{dateFormatter.format(new Date(note.createdAt))}</time></article>)}</div> : <p className="mt-4 rounded-xl border border-dashed border-border p-5 text-center text-sm text-muted">لا توجد ملاحظات معالجة حتى الآن.</p>}</section>
      <section className="content-card"><h2 className="flex items-center gap-2 text-lg font-extrabold text-ink"><MessageSquareText size={20} className="text-primary-600" />تعليقات الموظف</h2>{ticket.comments?.length ? <div className="mt-4 space-y-3">{ticket.comments.map((comment) => <article key={comment.id} className="rounded-xl bg-canvas p-4"><strong className="text-sm text-ink">{comment.authorName}</strong><p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-muted">{comment.text}</p><time className="mt-2 block text-xs text-muted">{dateFormatter.format(new Date(comment.createdAt))}</time></article>)}</div> : <p className="mt-4 rounded-xl border border-dashed border-border p-5 text-center text-sm text-muted">لا توجد تعليقات من الموظف.</p>}</section>
    </div>
    <div className="mt-6"><TicketTimeline ticket={ticket} audience="manager" /></div>
    {assignmentOpen && <TicketAssignmentModal ticket={ticket} technicians={technicians} workloads={workloads} onClose={() => setAssignmentOpen(false)} onSave={saveAssignment} />}
  </div>
}

export function ManagerTicketDetailsPage(){return authMode === 'api' ? <ManagerTicketDetailsApi/> : <MockManagerTicketDetailsPage/>}
