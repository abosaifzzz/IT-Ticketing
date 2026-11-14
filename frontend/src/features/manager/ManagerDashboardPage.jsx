import { formatTicketReference } from '../../services/tickets/formatTicketReference.js'
import { authMode } from '../../services/auth/mode'
import { ManagerDashboardApi } from './api/ManagerDashboardApi'
import { ArrowLeft, BriefcaseBusiness, CircleCheckBig, Clock3, Inbox, Layers3, PauseCircle, Repeat2, UserRoundCheck, UsersRound } from 'lucide-react'
import { useReducer, useState } from 'react'
import { Link } from 'react-router-dom'
import { StatusBadge } from '../../components/tickets/StatusBadge'
import { TicketAssignmentModal } from '../../components/tickets/TicketAssignmentModal'
import { Button } from '../../components/ui/Button'
import { getEngineerAvailabilityLabel, mockTechnicianService } from '../../services/mock/mockTechnicianService'
import { mockTicketService } from '../../services/mock/mockTicketService'
import { statusLabels, ticketStatuses } from '../../services/mock/statuses'
import { useAuth } from '../auth/useAuth'

const dateFormatter = new Intl.DateTimeFormat('ar-EG', { day: 'numeric', month: 'short', year: 'numeric' })
const activeStatuses = new Set(['assigned', 'in_progress', 'pending', 'reopened'])

function MockManagerDashboardPage() {
  const { user } = useAuth()
  const [assignmentTicket, setAssignmentTicket] = useState(null)
  const [, refresh] = useReducer((value) => value + 1, 0)
  const tickets = mockTicketService.queryForManager()
  const technicians = mockTechnicianService.getTechnicians()
  const count = (status) => tickets.filter((ticket) => ticket.status === status).length
  const unassigned = tickets.filter((ticket) => !ticket.assignedTechnicianId)
  const recurringProblems = mockTicketService.getRecurringProblems()
  const workloads = Object.fromEntries(technicians.map((technician) => [technician.id, tickets.filter((ticket) => ticket.assignedTechnicianId === technician.id && activeStatuses.has(ticket.status)).length]))
  const saveAssignment = (technicianId) => {
    const updated = mockTicketService.assign(assignmentTicket.id, technicianId, { id: user.id, name: user.name })
    if (updated) { setAssignmentTicket(null); refresh() }
    return Boolean(updated)
  }
  const metrics = [
    { label: 'إجمالي التذاكر', value: tickets.length, icon: Layers3 },
    { label: 'تذاكر جديدة', value: count('new'), icon: Inbox },
    { label: 'غير مسندة', value: unassigned.length, icon: UsersRound },
    { label: 'مسندة', value: tickets.filter((ticket) => ticket.assignedTechnicianId).length, icon: UserRoundCheck },
    { label: 'قيد التنفيذ', value: count('in_progress'), icon: Clock3 },
    { label: 'معلّقة', value: count('pending'), icon: PauseCircle },
    { label: 'تم حلها', value: count('resolved') + count('closed'), icon: CircleCheckBig },
    { label: 'مغلقة', value: count('closed'), icon: BriefcaseBusiness },
  ]

  return <div className="mx-auto max-w-[1500px]">
    <div className="page-heading"><div><p className="eyebrow">بوابة الإدارة</p><h1>لوحة تحكم مدير تكنولوجيا المعلومات</h1><p>نظرة تشغيلية موحدة على التذاكر غير المسندة، مهام المهندسين، الحالات، وتقدم العمل.</p></div><Button as={Link} to="tickets">إدارة جميع التذاكر</Button></div>
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{metrics.map(({ label, value, icon: Icon }) => <article key={label} className="metric-card"><div className="mb-4 grid size-10 place-items-center rounded-xl bg-primary-50 text-primary-600 dark:bg-primary-900/30 dark:text-primary-200"><Icon size={20} /></div><strong>{value}</strong><span>{label}</span></article>)}</div>

    <div className="mt-6 grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
      <section className="content-card"><div className="flex items-center justify-between gap-4"><div><h2 className="text-lg font-extrabold text-ink">أحدث التذاكر</h2><p className="mt-1 text-sm text-muted">آخر الطلبات المسجلة في النظام.</p></div><Link to="tickets" className="text-sm font-extrabold text-primary-600">عرض الكل</Link></div><div className="mt-5 divide-y divide-border">{tickets.slice(0, 5).map((ticket) => <article key={ticket.id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="text-xs font-extrabold text-primary-600"><bdi dir="ltr" title={ticket.reference}>{formatTicketReference(ticket)}</bdi></p><Link to={`tickets/${ticket.id}`} className="mt-1 block truncate text-sm font-extrabold text-ink hover:text-primary-600">{ticket.title}</Link><p className="mt-1 text-xs text-muted">{ticket.reporterName} · {ticket.department} · {dateFormatter.format(new Date(ticket.createdAt))}</p></div><div className="flex flex-wrap items-center gap-3"><StatusBadge status={ticket.status} />{!['resolved', 'closed'].includes(ticket.status) && <Button type="button" variant="secondary" onClick={() => setAssignmentTicket(ticket)}>{ticket.assignedTechnicianId ? 'إعادة الإسناد' : 'إسناد لمهندس'}</Button>}<Link to={`tickets/${ticket.id}`} aria-label="عرض تفاصيل التذكرة"><ArrowLeft size={17} className="text-muted" /></Link></div></article>)}</div></section>
      <section className="content-card"><h2 className="text-lg font-extrabold text-ink">نظرة عامة على الحالات</h2><div className="mt-5 space-y-4">{ticketStatuses.map((status) => { const value = count(status); const width = tickets.length ? Math.max((value / tickets.length) * 100, value ? 6 : 0) : 0; return <div key={status}><div className="mb-2 flex items-center justify-between text-sm"><span className="font-bold text-ink">{statusLabels[status]}</span><span className="font-extrabold text-primary-600">{value}</span></div><div className="h-2 overflow-hidden rounded-full bg-primary-100 dark:bg-primary-900/30"><div className="h-full rounded-full bg-primary-600" style={{ width: `${width}%` }} /></div></div> })}</div></section>
    </div>

    <div className="mt-6 grid gap-6 lg:grid-cols-2">
      <section className="content-card"><div className="flex items-center justify-between"><h2 className="text-lg font-extrabold text-ink">غير المسندة</h2><span className="status-pill">{unassigned.length}</span></div>{unassigned.length ? <div className="mt-4 space-y-3">{unassigned.slice(0, 4).map((ticket) => <article key={ticket.id} className="rounded-xl bg-canvas p-4"><p className="text-xs font-extrabold text-primary-600"><bdi dir="ltr" title={ticket.reference}>{formatTicketReference(ticket)}</bdi></p><Link to={`tickets/${ticket.id}`} className="mt-1 block text-sm font-bold text-ink hover:text-primary-600">{ticket.title}</Link><p className="mt-1 text-xs text-muted">{ticket.department}</p>{!['resolved', 'closed'].includes(ticket.status) && <Button type="button" variant="secondary" className="mt-3" onClick={() => setAssignmentTicket(ticket)}>إسناد لمهندس</Button>}</article>)}</div> : <p className="mt-6 text-center text-sm text-muted">تم إسناد جميع التذاكر الحالية.</p>}</section>
      <section className="content-card"><h2 className="text-lg font-extrabold text-ink">مسند للمهندسين</h2><div className="mt-4 space-y-3">{technicians.map((technician) => <div key={technician.id} className="flex items-center justify-between gap-3 rounded-xl bg-canvas p-4"><div><p className="text-sm font-extrabold text-ink">{technician.name}</p><p className="mt-1 text-xs text-muted">{getEngineerAvailabilityLabel(technician)}</p></div><div className="text-left"><strong className="block text-xl text-primary-600">{workloads[technician.id]}</strong><span className="text-[11px] text-muted">مهام حالية</span></div></div>)}</div></section>
    </div>

    <section className="content-card mt-6"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-amber-100 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200"><Repeat2 size={20} /></span><div><h2 className="text-lg font-extrabold text-ink">المشكلات المتكررة</h2><p className="mt-1 text-sm text-muted">تجميع تلقائي لتكرار تصنيف العطل داخل القسم نفسه لمساعدة الإدارة على اكتشاف الأنماط.</p></div></div>{recurringProblems.length ? <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{recurringProblems.map((problem) => <Link key={problem.key} to={`tickets/${problem.latestTicketId}`} className="rounded-2xl border border-amber-200 bg-amber-50 p-4 transition hover:border-amber-400 dark:border-amber-900 dark:bg-amber-950/30"><div className="flex items-start justify-between gap-3"><div><h3 className="font-extrabold text-ink">{problem.category}</h3><p className="mt-1 text-sm text-muted">{problem.department}</p></div><span className="rounded-full bg-amber-200 px-2.5 py-1 text-xs font-extrabold text-amber-900 dark:bg-amber-900 dark:text-amber-100">{problem.count} مرات</span></div><p className="mt-3 text-xs text-muted">{problem.openCount} قيد المتابعة · {(problem.ticketReferences ?? problem.ticketIds).map(formatTicketReference).join('، ')}</p></Link>)}</div> : <p className="mt-5 rounded-xl border border-dashed border-border p-5 text-center text-sm text-muted">لا توجد أنماط مشكلات متكررة في البيانات الحالية.</p>}</section>
    {assignmentTicket && <TicketAssignmentModal ticket={assignmentTicket} technicians={technicians} workloads={workloads} onClose={() => setAssignmentTicket(null)} onSave={saveAssignment} />}
  </div>
}

export function ManagerDashboardPage() { return authMode === 'api' ? <ManagerDashboardApi /> : <MockManagerDashboardPage /> }
