import { formatTicketReference } from '../../services/tickets/formatTicketReference.js'
import {authMode} from '../../services/auth/mode'
import {AllTicketsApi} from './api/AllTicketsApi'
import { Search, SlidersHorizontal, TicketCheck } from 'lucide-react'
import { useReducer, useState } from 'react'
import { Link } from 'react-router-dom'
import { TicketAssignmentModal } from '../../components/tickets/TicketAssignmentModal'
import { StatusBadge } from '../../components/tickets/StatusBadge'
import { Button } from '../../components/ui/Button'
import { mockTechnicianService } from '../../services/mock/mockTechnicianService'
import { mockTicketService } from '../../services/mock/mockTicketService'
import { statusLabels, ticketStatuses } from '../../services/mock/statuses'
import { useAuth } from '../auth/useAuth'

const dateFormatter = new Intl.DateTimeFormat('ar-EG', { day: 'numeric', month: 'short', year: 'numeric' })
const activeStatuses = new Set(['assigned', 'in_progress', 'pending', 'reopened'])
const defaultFilters = { search: '', status: 'all', sort: 'newest' }

function MockAllTicketsPage() {
  const { user } = useAuth()
  const [filters, setFilters] = useState(defaultFilters)
  const [assignmentTicket, setAssignmentTicket] = useState(null)
  const [, refresh] = useReducer((value) => value + 1, 0)
  const tickets = mockTicketService.queryForManager(filters)
  const totalTickets = mockTicketService.getAll().length
  const technicians = mockTechnicianService.getTechnicians()
  const allTickets = mockTicketService.getAll()
  const workloads = Object.fromEntries(technicians.map((technician) => [technician.id, allTickets.filter((ticket) => ticket.assignedTechnicianId === technician.id && activeStatuses.has(ticket.status)).length]))
  const updateFilter = ({ target }) => setFilters((current) => ({ ...current, [target.name]: target.value }))
  const saveAssignment = (technicianId) => {
    const updated = mockTicketService.assign(assignmentTicket.id, technicianId, { id: user.id, name: user.name })
    if (updated) { setAssignmentTicket(null); refresh() }
    return Boolean(updated)
  }

  return <div className="mx-auto max-w-[1500px]">
    <div className="page-heading"><div><p className="eyebrow">إدارة الطلبات</p><h1>جميع التذاكر</h1><p>ابحث في جميع طلبات النظام، راجع حالتها، وافتح أدوات الإسناد والمتابعة.</p></div><span className="status-pill">{totalTickets} تذكرة</span></div>
    <section className="content-card mb-6" aria-label="البحث والتصفية"><div className="mb-4 flex items-center gap-2"><SlidersHorizontal size={18} className="text-primary-600" /><h2 className="text-sm font-extrabold text-ink">البحث والتصفية</h2></div><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-[1.5fr_1fr_1fr_auto]">
      <label><span className="field-label">بحث</span><span className="relative block"><Search size={18} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-muted" /><input name="search" value={filters.search} onChange={updateFilter} className="field-input pr-11" placeholder="المرجع، العطل، الموظف، القسم أو المهندس" /></span></label>
      <label><span className="field-label">الحالة</span><select name="status" value={filters.status} onChange={updateFilter} className="field-input"><option value="all">كل الحالات</option>{ticketStatuses.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}</select></label>
      <label><span className="field-label">الترتيب</span><select name="sort" value={filters.sort} onChange={updateFilter} className="field-input"><option value="newest">الأحدث أولًا</option><option value="oldest">الأقدم أولًا</option></select></label>
      <Button type="button" variant="secondary" onClick={() => setFilters(defaultFilters)} className="self-end">مسح التصفية</Button>
    </div></section>

    {tickets.length ? <><div className="table-wrap hidden xl:block"><table className="data-table min-w-[1100px]"><thead><tr><th>المرجع</th><th>العطل</th><th>الموظف والقسم</th><th>المهندس</th><th>الإنشاء</th><th>الحالة</th><th>الإجراءات</th></tr></thead><tbody>{tickets.map((ticket) => <tr key={ticket.id}><td className="!text-primary-600"><bdi dir="ltr" title={ticket.reference}>{formatTicketReference(ticket)}</bdi></td><td className="max-w-xs"><p className="truncate font-bold text-ink">{ticket.title}</p></td><td><p className="font-bold text-ink">{ticket.reporterName}</p><p className="mt-1 text-xs">{ticket.department}</p></td><td>{ticket.assignedTechnician ?? 'غير مسندة'}</td><td>{dateFormatter.format(new Date(ticket.createdAt))}</td><td><StatusBadge status={ticket.status} /></td><td><div className="flex items-center gap-3"><Link className="font-extrabold text-primary-600" to={`/manager/tickets/${ticket.id}`}>التفاصيل</Link><button type="button" onClick={() => setAssignmentTicket(ticket)} className="font-extrabold text-primary-600">{ticket.assignedTechnicianId ? 'إعادة الإسناد' : 'إسناد'}</button></div></td></tr>)}</tbody></table></div>
      <div className="grid gap-4 sm:grid-cols-2 xl:hidden">{tickets.map((ticket) => <article key={ticket.id} className="content-card"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-extrabold text-primary-600"><bdi dir="ltr" title={ticket.reference}>{formatTicketReference(ticket)}</bdi></p><h2 className="mt-1 font-extrabold text-ink">{ticket.title}</h2></div><StatusBadge status={ticket.status} /></div><dl className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-xs text-muted">الموظف</dt><dd className="mt-1 font-bold text-ink">{ticket.reporterName}</dd></div><div><dt className="text-xs text-muted">القسم</dt><dd className="mt-1 font-bold text-ink">{ticket.department}</dd></div><div className="col-span-2"><dt className="text-xs text-muted">المهندس</dt><dd className="mt-1 font-bold text-ink">{ticket.assignedTechnician ?? 'غير مسندة'}</dd></div></dl><div className="mt-5 grid grid-cols-2 gap-3"><Button as={Link} to={`/manager/tickets/${ticket.id}`}>التفاصيل</Button><Button variant="secondary" onClick={() => setAssignmentTicket(ticket)}>{ticket.assignedTechnicianId ? 'إعادة الإسناد' : 'إسناد'}</Button></div></article>)}</div></> : <section className="rounded-2xl border border-dashed border-border bg-surface p-10 text-center"><TicketCheck className="mx-auto text-primary-300" size={40} /><h2 className="mt-4 text-lg font-extrabold text-ink">لا توجد نتائج مطابقة</h2><p className="mt-2 text-sm text-muted">جرّب تعديل كلمات البحث أو خيارات التصفية.</p><Button variant="secondary" onClick={() => setFilters(defaultFilters)} className="mt-5">عرض جميع التذاكر</Button></section>}

    {assignmentTicket && <TicketAssignmentModal ticket={assignmentTicket} technicians={technicians} workloads={workloads} onClose={() => setAssignmentTicket(null)} onSave={saveAssignment} />}
  </div>
}

export function AllTicketsPage(){return authMode === 'api' ? <AllTicketsApi/> : <MockAllTicketsPage/>}
