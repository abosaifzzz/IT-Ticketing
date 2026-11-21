import { CheckCircle2, Clock3, Plus, TicketCheck } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { RemoteControlNotice } from './RemoteControlNotice'
import { TicketCard } from '../../../components/tickets/TicketCard'
import { Button } from '../../../components/ui/Button'
import { useAuth } from '../../auth/useAuth'
import { EmployeeTicketPopup } from './EmployeeTicketPopup'
import { employeeTicketService as service } from '../../../services/tickets/employeeTicketService'
import { useApiQuery } from '../../../services/http/useApiQuery'
export function EmployeeDashboardApi() {
  const { user } = useAuth()
  const [page, setPage] = useState(1)
  const [selectedTicket, setSelectedTicket] = useState(null)
  // After a new ticket is submitted, show the remote-control instructions once (not again on refresh).
  const location = useLocation(), navigate = useNavigate()
  const [remoteNotice, setRemoteNotice] = useState(Boolean(location.state?.ticketSubmitted))
  useEffect(() => { if (location.state?.ticketSubmitted) navigate(location.pathname, { replace: true, state: null }) }, [location.state, location.pathname, navigate])
  const closeRemoteNotice = useCallback(() => setRemoteNotice(false), [])
  const query = useApiQuery('dashboard-'+page, async (signal) => { const [summary, list] = await Promise.all([service.summary(signal), service.list({page,pageSize:12}, signal)]); return {summary:summary.tickets,...list} })
  const tickets = query.data?.items ?? [], total = query.data?.total ?? 0
  const openCount = query.data?.summary.unsolved ?? '—', inProgressCount = query.data?.summary.byStatus.in_progress ?? '—', resolvedCount = query.data?.summary.solved ?? '—'
  return <div className="mx-auto max-w-6xl">
    <section className="flex flex-col gap-5 rounded-2xl border border-border bg-surface p-5 sm:flex-row sm:items-center sm:justify-between sm:p-7">
      <div><p className="text-sm font-bold text-primary-500">مرحبًا، {user.name}</p><h1 className="mt-2 text-2xl font-extrabold text-ink sm:text-3xl">نقدر نساعدك ازاي انهاردة ؟</h1><p className="mt-2 text-sm leading-7 text-muted">أنشئ طلب دعم جديد أو تابع حالة طلباتك الحالية بسهولة.</p></div>
    </section>

    <Button as={Link} to="new-ticket" className="mt-5 w-full py-4 text-base sm:w-auto sm:min-w-64"><Plus size={21} />انشئ طلب دعم جديد</Button>

    <Button type="button" variant="secondary" className="my-4" disabled={query.status === 'loading'} onClick={() => query.refresh(true)}>تحديث الطلبات</Button>
    <section className="mt-7 grid gap-4 sm:grid-cols-3" aria-label="ملخص الطلبات">
      <article className="rounded-2xl border border-border bg-surface p-5"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-primary-50 text-primary-600 dark:bg-primary-900/30 dark:text-primary-200"><TicketCheck size={20} /></span><span className="text-sm font-bold text-muted">طلباتي المفتوحة</span></div><strong className="mt-4 block text-3xl font-extrabold text-ink">{openCount}</strong></article>
      <article className="rounded-2xl border border-border bg-surface p-5"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-200"><Clock3 size={20} /></span><span className="text-sm font-bold text-muted">قيد التنفيذ</span></div><strong className="mt-4 block text-3xl font-extrabold text-ink">{inProgressCount}</strong></article>
      <article className="rounded-2xl border border-border bg-surface p-5"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-200"><CheckCircle2 size={20} /></span><span className="text-sm font-bold text-muted">تم حلها</span></div><strong className="mt-4 block text-3xl font-extrabold text-ink">{resolvedCount}</strong></article>
    </section>

    <section className="mt-9">
      <div className="mb-4"><h2 className="text-xl font-extrabold text-ink">طلباتي</h2><p className="mt-1 text-sm text-muted">افتح أي طلب لمتابعة التغييرات واتخاذ الإجراء المناسب.</p></div>
      {query.status === 'loading' ? <p role="status" className="content-card text-ink">جارٍ تحميل الطلبات...</p> : query.error ? <section className="content-card"><p role="alert" className="text-red-700 dark:text-red-300">{query.error.message}</p><Button variant="secondary" className="mt-3" onClick={() => query.refresh()}>إعادة المحاولة</Button></section> : tickets.length > 0 ? <div className="grid gap-4 md:grid-cols-2">{tickets.map((ticket) => <TicketCard key={ticket.id} ticket={ticket} onOpen={setSelectedTicket} />)}</div> : <div className="rounded-2xl border border-dashed border-border bg-surface p-8 text-center sm:p-12"><TicketCheck className="mx-auto text-primary-300" size={38} /><h3 className="mt-4 text-lg font-extrabold text-ink">لا توجد طلبات حتى الآن</h3><p className="mt-2 text-sm text-muted">عند إنشاء أول طلب سيظهر هنا لتتمكن من متابعته.</p><Button as={Link} to="new-ticket" className="mt-5"><Plus size={18} />إنشاء أول طلب</Button></div>}
    </section>
    <nav aria-label="صفحات الطلبات" className="mt-6 flex flex-wrap items-center justify-center gap-4"><Button variant="secondary" disabled={page <= 1 || query.status === 'loading'} onClick={() => setPage((value) => value - 1)}>السابق</Button><span className="text-sm text-muted">الصفحة {page} من {Math.max(1, Math.ceil(total / 12))}</span><Button variant="secondary" disabled={page * 12 >= total || query.status === 'loading'} onClick={() => setPage((value) => value + 1)}>التالي</Button></nav>
    {remoteNotice && <RemoteControlNotice onClose={closeRemoteNotice} />}
    {selectedTicket && <EmployeeTicketPopup key={selectedTicket.id} id={selectedTicket.id} onClose={() => setSelectedTicket(null)} onChanged={() => query.refresh(true)} />}
  </div>
}
