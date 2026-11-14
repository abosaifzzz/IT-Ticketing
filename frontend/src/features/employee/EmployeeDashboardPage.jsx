import { authMode } from '../../services/auth/mode'
import { EmployeeDashboardApi } from './api/EmployeeDashboardApi'
import { CheckCircle2, Clock3, Plus, TicketCheck } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { TicketCard } from '../../components/tickets/TicketCard'
import { TicketDetailsModal } from '../../components/tickets/TicketDetailsModal'
import { Button } from '../../components/ui/Button'
import { mockTicketService } from '../../services/mock/mockTicketService'
import { useAuth } from '../auth/useAuth'

const OPEN_STATUSES = new Set(['new', 'assigned', 'in_progress', 'pending', 'reopened'])

function MockEmployeeDashboardPage() {
  const { user } = useAuth()
  const [tickets, setTickets] = useState(() => mockTicketService.getByReporterAccountId(user.id))
  const [selectedTicket, setSelectedTicket] = useState(null)
  const openCount = tickets.filter((ticket) => OPEN_STATUSES.has(ticket.status)).length
  const inProgressCount = tickets.filter((ticket) => ticket.status === 'in_progress').length
  const resolvedCount = tickets.filter((ticket) => ticket.status === 'resolved' || ticket.status === 'closed').length

  const handleStatusChange = (status, reason = '') => {
    const updatedTicket = status === 'closed' ? mockTicketService.confirmResolution(selectedTicket.id, user.id) : mockTicketService.reopen(selectedTicket.id, user.id, reason)
    if (!updatedTicket) return
    setTickets(mockTicketService.getByReporterAccountId(user.id))
    setSelectedTicket(updatedTicket)
  }

  return <div className="mx-auto max-w-6xl">
    <section className="flex flex-col gap-5 rounded-2xl border border-border bg-surface p-5 sm:flex-row sm:items-center sm:justify-between sm:p-7">
      <div><p className="text-sm font-bold text-primary-500">مرحبًا، {user.name}</p><h1 className="mt-2 text-2xl font-extrabold text-ink sm:text-3xl">نقدر نساعدك ازاي انهاردة ؟</h1><p className="mt-2 text-sm leading-7 text-muted">أنشئ طلب دعم جديد أو تابع حالة طلباتك الحالية بسهولة.</p></div>
    </section>

    <Button as={Link} to="new-ticket" className="mt-5 w-full py-4 text-base sm:w-auto sm:min-w-64"><Plus size={21} />انشئ طلب دعم جديد</Button>

    <section className="mt-7 grid gap-4 sm:grid-cols-3" aria-label="ملخص الطلبات">
      <article className="rounded-2xl border border-border bg-surface p-5"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-primary-50 text-primary-600 dark:bg-primary-900/30 dark:text-primary-200"><TicketCheck size={20} /></span><span className="text-sm font-bold text-muted">طلباتي المفتوحة</span></div><strong className="mt-4 block text-3xl font-extrabold text-ink">{openCount}</strong></article>
      <article className="rounded-2xl border border-border bg-surface p-5"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-200"><Clock3 size={20} /></span><span className="text-sm font-bold text-muted">قيد التنفيذ</span></div><strong className="mt-4 block text-3xl font-extrabold text-ink">{inProgressCount}</strong></article>
      <article className="rounded-2xl border border-border bg-surface p-5"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-200"><CheckCircle2 size={20} /></span><span className="text-sm font-bold text-muted">تم حلها</span></div><strong className="mt-4 block text-3xl font-extrabold text-ink">{resolvedCount}</strong></article>
    </section>

    <section className="mt-9">
      <div className="mb-4"><h2 className="text-xl font-extrabold text-ink">طلباتي</h2><p className="mt-1 text-sm text-muted">افتح أي طلب لمتابعة التغييرات واتخاذ الإجراء المناسب.</p></div>
      {tickets.length > 0 ? <div className="grid gap-4 md:grid-cols-2">{tickets.map((ticket) => <TicketCard key={ticket.id} ticket={ticket} onOpen={setSelectedTicket} />)}</div> : <div className="rounded-2xl border border-dashed border-border bg-surface p-8 text-center sm:p-12"><TicketCheck className="mx-auto text-primary-300" size={38} /><h3 className="mt-4 text-lg font-extrabold text-ink">لا توجد طلبات حتى الآن</h3><p className="mt-2 text-sm text-muted">عند إنشاء أول طلب سيظهر هنا لتتمكن من متابعته.</p><Button as={Link} to="new-ticket" className="mt-5"><Plus size={18} />إنشاء أول طلب</Button></div>}
    </section>
    <TicketDetailsModal ticket={selectedTicket} onClose={() => setSelectedTicket(null)} onStatusChange={handleStatusChange} />
  </div>
}

export function EmployeeDashboardPage() { return authMode === 'api' ? <EmployeeDashboardApi /> : <MockEmployeeDashboardPage /> }
