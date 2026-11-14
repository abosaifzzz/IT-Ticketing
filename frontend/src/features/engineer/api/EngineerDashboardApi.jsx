import { formatTicketReference } from '../../../services/tickets/formatTicketReference.js'
import { ArrowLeft, BriefcaseBusiness, CircleCheckBig, Clock3, PauseCircle, Repeat2, Sparkles, UserRoundCheck, UserRoundX } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { StatusBadge } from '../../../components/tickets/StatusBadge'
import { Button } from '../../../components/ui/Button'
import { useAuth } from '../../auth/useAuth'

const dateFormatter = new Intl.DateTimeFormat('ar-EG', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

import { engineerTicketService as service } from '../../../services/tickets/engineerTicketService'
import { assignmentSource as getAssignmentSourceLabel } from '../../../services/tickets/engineerTicketApi'
import { useApiQuery } from '../../../services/http/useApiQuery'
import { useEngineerRefresh } from './useEngineerRefresh'
const getEngineerAvailabilityLabel = (engineer) => engineer?.available ? 'متاح لاستقبال التذاكر' : 'غير متاح حاليًا'
export function EngineerDashboardApi() {
  const { user } = useAuth()
  const [busy, setBusy] = useState(false), [error, setError] = useState(''); const lock = useRef(false)
  const query = useApiQuery(user.id, async (signal) => { const [summary, list, recurring, own] = await Promise.all([service.summary(signal), service.list({ page: 1, pageSize: 5 }, signal), service.recurring(signal), service.ownState(user.id, signal)]); return { summary: summary.tickets, tickets: list.items, recurring: recurring.items, own } })
  const allQuery = useApiQuery('engineer-dashboard-all-tickets', (signal) => service.allTickets({ page: 1, pageSize: 8 }, signal))
  useEngineerRefresh(query.refresh, busy)
  useEngineerRefresh(allQuery.refresh, busy)
  const engineer = query.data ? { active: true, available: query.data.own.isAvailable } : null, isAvailable = engineer?.available === true
  const tickets = query.data?.tickets ?? [], recurringProblems = query.data?.recurring ?? []
  const count = (status) => query.data?.summary.byStatus[status] ?? '—'
  const toggleAvailability = async () => { if (lock.current || !engineer) return; lock.current = true; setBusy(true); setError(''); try { await service.availability(!isAvailable); await query.refresh(true) } catch (failure) { setError(failure.message) } finally { lock.current = false; setBusy(false) } }
  const metrics = [{ label: 'إجمالي التذاكر المسندة', value: query.data?.summary.total ?? '—', icon: BriefcaseBusiness }, { label: 'إسنادات جديدة', value: count('assigned'), icon: Sparkles }, { label: 'قيد التنفيذ', value: count('in_progress'), icon: Clock3 }, { label: 'معلّقة', value: count('pending'), icon: PauseCircle }, { label: 'تم حلها', value: query.data?.summary.solved ?? '—', icon: CircleCheckBig }]
  return <div className="mx-auto max-w-[1500px] [overflow-wrap:anywhere]">
    <div className="page-heading"><div><p className="eyebrow">بوابة مهندس تكنولوجيا المعلومات</p><h1>مرحبًا، {user.name}</h1><p>ملخص واضح للتذاكر المسندة إليك وآخر المهام التي تحتاج إلى متابعة.</p></div><Button as={Link} to="tickets">عرض جميع التذاكر</Button></div>

    {query.status === 'loading' && <p role="status" className="content-card mb-4">جارٍ تحميل لوحة المهندس...</p>}
    {(error || query.error) && <p role="alert" className="content-card mb-4 text-red-700 dark:text-red-300">{error || query.error?.message}</p>}
    <Button variant="secondary" className="mb-4" disabled={busy} onClick={() => { query.refresh(true); allQuery.refresh(true) }}>تحديث البيانات</Button>
    <section className="content-card mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between" aria-label="حالة التوفر للإسناد"><div><h2 className="text-lg font-extrabold text-ink">حالة التوفر</h2><p role="status" className={`mt-1 text-sm font-bold ${isAvailable ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300'}`}>{getEngineerAvailabilityLabel(engineer)}</p><p className="mt-1 text-xs leading-6 text-muted">عند إيقاف التوفر لن تتمكن من تولي تذكرة بنفسك، لكن يمكن للمدير إسناد تذكرة إليك. تذاكرك الحالية تبقى معك.</p></div><Button type="button" variant="secondary" onClick={toggleAvailability} disabled={busy || !engineer?.active} aria-pressed={!isAvailable} className="shrink-0">{isAvailable ? <><UserRoundX size={18} />لست متاحًا الآن</> : <><UserRoundCheck size={18} />أنا متاح الآن</>}</Button></section>

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">{metrics.map(({ label, value, icon: Icon }) => <article key={label} className="metric-card"><div className="mb-4 grid size-10 place-items-center rounded-xl bg-primary-50 text-primary-600 dark:bg-primary-900/30 dark:text-primary-200"><Icon size={20} /></div><strong>{value}</strong><span>{label}</span></article>)}</div>

    <section className="content-card mt-6"><div className="flex items-center justify-between gap-4"><div><h2 className="text-lg font-extrabold text-ink">المسندة حديثًا</h2></div><Link to="tickets" className="text-sm font-extrabold text-primary-600">عرض الكل</Link></div>
      {tickets.length ? <div className="mt-5 divide-y divide-border">{tickets.slice(0, 5).map((ticket) => <Link key={ticket.id} to={`tickets/${ticket.id}`} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="text-xs font-extrabold text-primary-600"><bdi dir="ltr" title={ticket.reference}>{formatTicketReference(ticket)}</bdi></p><h3 className="mt-1 truncate text-sm font-extrabold text-ink">{ticket.title}</h3><p className="mt-1 text-xs text-muted">{ticket.reporterName} · {ticket.department} · {dateFormatter.format(new Date(ticket.assignedAt))}</p><p className="mt-1 text-xs font-bold text-ink">الإسناد بواسطة: {getAssignmentSourceLabel(ticket)}</p></div><div className="flex items-center justify-between gap-3"><StatusBadge status={ticket.status} /><ArrowLeft size={17} className="text-muted" /></div></Link>)}</div> : <div className="py-10 text-center"><CircleCheckBig className="mx-auto text-primary-300" size={40} /><h3 className="mt-3 font-extrabold text-ink">لا توجد تذاكر مسندة إليك</h3><p className="mt-1 text-sm text-muted">ستظهر الإسنادات الجديدة هنا فور إضافتها.</p></div>}
    </section>

    <section className="content-card mt-6" aria-labelledby="engineer-all-tickets-heading"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 id="engineer-all-tickets-heading" className="text-lg font-extrabold text-ink">آخر البلاغات</h2><p className="mt-1 text-sm text-muted">أحدث البلاغات من جميع الأقسام، بما فيها غير المسندة.</p></div><Button as={Link} to="tickets" variant="secondary">عرض جميع التذاكر</Button></div>
      {allQuery.status === 'loading' && <p role="status" className="mt-5 text-muted">جارٍ تحميل البلاغات...</p>}
      {allQuery.error && <div className="mt-5"><p role="alert" className="text-red-700 dark:text-red-300">{allQuery.error.message}</p><Button type="button" variant="secondary" className="mt-2" onClick={() => allQuery.refresh()}>إعادة المحاولة</Button></div>}
      {allQuery.status === 'ready' && !allQuery.data?.items.length && <p className="mt-5 rounded-xl border border-dashed border-border p-5 text-center text-sm text-muted">لا توجد بلاغات حتى الآن.</p>}
      {allQuery.data?.items.length > 0 && <div className="mt-5 divide-y divide-border">{allQuery.data.items.map((ticket) => <Link key={ticket.id} to={`tickets/${ticket.id}`} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="text-xs font-extrabold text-primary-600"><bdi dir="ltr" title={ticket.reference}>{formatTicketReference(ticket)}</bdi></p><h3 className="mt-1 truncate font-bold text-ink">{ticket.title}</h3><p className="mt-1 text-xs text-muted">{ticket.department} · {ticket.assignedTechnician || 'غير مسند'} · {dateFormatter.format(new Date(ticket.createdAt))}</p></div><StatusBadge status={ticket.status} /></Link>)}</div>}
    </section>

    <section className="content-card mt-6"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-200"><Repeat2 size={20} /></span><div><h2 className="text-lg font-extrabold text-ink">المشكلات المتكررة</h2><p className="mt-1 text-sm text-muted">أنماط الأعطال المتكررة في القسم نفسه ضمن التذاكر المسندة إليك.</p></div></div>{recurringProblems.length ? <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{recurringProblems.map((problem) => <Link key={problem.key} to={`tickets/${problem.latestTicketId}`} className="rounded-2xl border border-amber-200 bg-amber-50 p-4 transition hover:border-amber-400 dark:border-amber-900 dark:bg-amber-950/30"><div className="flex items-start justify-between gap-3"><div><h3 className="font-extrabold text-ink">{problem.category}</h3><p className="mt-1 text-sm text-muted">{problem.department}</p></div><span className="rounded-full bg-amber-200 px-2.5 py-1 text-xs font-extrabold text-amber-900 dark:bg-amber-900 dark:text-amber-100">{problem.count} مرات</span></div><p className="mt-3 text-xs text-muted">{problem.openCount} قيد المتابعة · {(problem.ticketReferences ?? problem.ticketIds).map(formatTicketReference).join('، ')}</p></Link>)}</div> : <p className="mt-5 rounded-xl border border-dashed border-border p-5 text-center text-sm text-muted">لا توجد أنماط متكررة ضمن تذاكرك الحالية.</p>}</section>
  </div>
}
