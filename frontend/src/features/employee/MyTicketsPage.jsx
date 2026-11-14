import { formatTicketReference } from '../../services/tickets/formatTicketReference.js'
import { authMode } from '../../services/auth/mode'
import { MyTicketsApi } from './api/MyTicketsApi'
import { Search, SlidersHorizontal, TicketCheck } from 'lucide-react'
import { useState } from 'react'
import { TicketCard } from '../../components/tickets/TicketCard'
import { TicketDetailsModal } from '../../components/tickets/TicketDetailsModal'
import { StatusBadge } from '../../components/tickets/StatusBadge'
import { Button } from '../../components/ui/Button'
import { mockTicketService } from '../../services/mock/mockTicketService'
import { statusLabels, ticketStatuses } from '../../services/mock/statuses'
import { useAuth } from '../auth/useAuth'

const dateFormatter = new Intl.DateTimeFormat('ar-EG', { day: 'numeric', month: 'short', year: 'numeric' })
const defaultFilters = { search: '', status: 'all', creationDate: '', sort: 'newest' }

function MockMyTicketsPage() {
  const { user } = useAuth()
  const [filters, setFilters] = useState(defaultFilters)
  const [selectedTicket, setSelectedTicket] = useState(null)
  const tickets = mockTicketService.queryByReporterAccountId(user.id, filters)
  const totalTickets = mockTicketService.getByReporterAccountId(user.id).length

  const updateFilter = (event) => setFilters((current) => ({ ...current, [event.target.name]: event.target.value }))
  const resetFilters = () => setFilters(defaultFilters)
  const handleStatusChange = (status, reason = '') => {
    const updatedTicket = status === 'closed' ? mockTicketService.confirmResolution(selectedTicket.id, user.id) : mockTicketService.reopen(selectedTicket.id, user.id, reason)
    if (updatedTicket) setSelectedTicket(updatedTicket)
  }

  return <div className="mx-auto max-w-[1500px]">
    <div className="page-heading"><div><p className="eyebrow">متابعة الدعم</p><h1>طلباتي</h1><p>جميع الطلبات المرتبطة بحسابك التجريبي، بما فيها الطلبات المسجلة بالنيابة عن موظف آخر.</p></div><span className="status-pill">{totalTickets} طلب</span></div>

    <section className="content-card mb-6" aria-label="البحث والتصفية">
      <div className="mb-4 flex items-center gap-2"><SlidersHorizontal size={18} className="text-primary-500" /><h2 className="text-sm font-extrabold text-ink">البحث والتصفية</h2></div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-[1.5fr_1fr_1fr_1fr_auto]">
        <label><span className="field-label">رقم الطلب أو اسم العطل</span><span className="relative block"><Search size={18} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-muted" /><input name="search" value={filters.search} onChange={updateFilter} className="field-input pr-11" placeholder="مثال: IT-1048 أو الطابعة" /></span></label>
        <label><span className="field-label">الحالة</span><select name="status" value={filters.status} onChange={updateFilter} className="field-input"><option value="all">جميع الحالات</option>{ticketStatuses.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}</select></label>
        <label><span className="field-label">تاريخ الإنشاء</span><input type="date" name="creationDate" value={filters.creationDate} onChange={updateFilter} className="field-input" /></label>
        <label><span className="field-label">الترتيب</span><select name="sort" value={filters.sort} onChange={updateFilter} className="field-input"><option value="newest">الأحدث أولًا</option><option value="oldest">الأقدم أولًا</option></select></label>
        <Button type="button" variant="secondary" onClick={resetFilters} className="self-end">مسح التصفية</Button>
      </div>
    </section>

    {tickets.length > 0 ? <>
      <div className="hidden overflow-x-auto rounded-2xl border border-border bg-surface lg:block"><table className="w-full min-w-[1180px] text-right text-sm"><thead className="bg-primary-50/70 text-xs text-muted dark:bg-primary-900/20"><tr><th className="px-4 py-3 font-bold">المرجع</th><th className="px-4 py-3 font-bold">الموظف</th><th className="px-4 py-3 font-bold">القسم</th><th className="px-4 py-3 font-bold">التصنيف</th><th className="px-4 py-3 font-bold">ملخص العطل</th><th className="px-4 py-3 font-bold">تاريخ الإنشاء</th><th className="px-4 py-3 font-bold">المهندس</th><th className="px-4 py-3 font-bold">الحالة</th><th className="px-4 py-3 font-bold">الإجراء</th></tr></thead><tbody className="divide-y divide-border">{tickets.map((ticket) => <tr key={ticket.id} className="hover:bg-primary-50/30 dark:hover:bg-primary-900/10"><td className="whitespace-nowrap px-4 py-4 font-extrabold text-primary-500"><bdi dir="ltr" title={ticket.reference}>{formatTicketReference(ticket)}</bdi></td><td className="whitespace-nowrap px-4 py-4 font-bold text-ink">{ticket.reporterName}</td><td className="whitespace-nowrap px-4 py-4 text-muted">{ticket.department}</td><td className="whitespace-nowrap px-4 py-4 text-muted">{ticket.category ?? 'غير مصنف'}</td><td className="max-w-xs px-4 py-4 text-muted"><span className="line-clamp-2">{ticket.description ?? 'لا يوجد وصف متاح.'}</span></td><td className="whitespace-nowrap px-4 py-4 text-muted">{dateFormatter.format(new Date(ticket.createdAt))}</td><td className="whitespace-nowrap px-4 py-4 text-muted">{ticket.assignedTechnician ?? 'لم يتم الإسناد'}</td><td className="whitespace-nowrap px-4 py-4"><StatusBadge status={ticket.status} /></td><td className="px-4 py-4"><button type="button" onClick={() => setSelectedTicket(ticket)} className="whitespace-nowrap font-extrabold text-primary-500 hover:text-primary-700">فتح التفاصيل</button></td></tr>)}</tbody></table></div>
      <div className="grid gap-4 sm:grid-cols-2 lg:hidden">{tickets.map((ticket) => <TicketCard key={ticket.id} ticket={ticket} onOpen={setSelectedTicket} detailed />)}</div>
    </> : <section className="rounded-2xl border border-dashed border-border bg-surface p-8 text-center sm:p-12"><TicketCheck className="mx-auto text-primary-300" size={40} /><h2 className="mt-4 text-lg font-extrabold text-ink">{totalTickets === 0 ? 'لا توجد طلبات حتى الآن' : 'لا توجد نتائج مطابقة'}</h2><p className="mt-2 text-sm text-muted">{totalTickets === 0 ? 'ستظهر الطلبات الجديدة هنا فور إنشائها.' : 'جرّب تغيير كلمات البحث أو خيارات التصفية.'}</p>{totalTickets > 0 && <Button type="button" variant="secondary" onClick={resetFilters} className="mt-5">عرض كل الطلبات</Button>}</section>}

    <TicketDetailsModal ticket={selectedTicket} onClose={() => setSelectedTicket(null)} onStatusChange={handleStatusChange} />
  </div>
}

export function MyTicketsPage() { return authMode === 'api' ? <MyTicketsApi /> : <MockMyTicketsPage /> }
