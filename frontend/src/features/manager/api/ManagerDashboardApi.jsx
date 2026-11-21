import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../../../components/ui/Button'
import { StatusBadge } from '../../../components/tickets/StatusBadge'
import { TicketAssignmentModal } from '../../../components/tickets/TicketAssignmentModal'
import { formatTicketReference } from '../../../services/tickets/formatTicketReference.js'
import { managerService as service } from '../../../services/manager/managerService'
import { engineerLabel } from '../../../services/manager/managerApi'
import { useApiQuery } from '../../../services/http/useApiQuery'
import { useEngineerRefresh } from '../../engineer/api/useEngineerRefresh'
import { statusLabels, ticketStatuses } from '../../../services/mock/statuses'
export function ManagerDashboardApi() {
  const [assignmentTicket, setAssignmentTicket] = useState(null)
  const [busy, setBusy] = useState(false)
  const query = useApiQuery('manager-dashboard', async signal => {
    const [summary, recent, users, recurring, unassigned] = await Promise.all([service.summary(signal), service.list({ pageSize: 5 }, signal), service.records('it-users', { role: 'technician' }, signal), service.recurring(signal), service.list({ assignment: 'unassigned', pageSize: 1 }, signal)])
    return { summary: summary.tickets, recent: recent.items, users: users.items, recurring: recurring.items, unassigned: unassigned.total }
  })
  useEngineerRefresh(query.refresh, busy)
  const saveAssignment = async (engineerId) => {
    setBusy(true)
    try {
      await service.assign(assignmentTicket, engineerId)
      setAssignmentTicket(null)
      await query.refresh(true)
      return true
    } catch (failure) {
      if (failure.status === 409) setAssignmentTicket(await service.details(assignmentTicket.id))
      throw failure
    } finally { setBusy(false) }
  }
  const engineers = query.data?.users.map((user) => ({ id: user.id, name: user.fullName, active: user.isActive, available: user.isAvailable, jobTitle: user.jobTitle })) ?? []
  const workloads = Object.fromEntries((query.data?.users ?? []).map((user) => [user.id, user.activeTicketCount]))
  return <div className="mx-auto max-w-[1500px] [overflow-wrap:anywhere]"><div className="page-heading"><div><p className="eyebrow">بوابة الإدارة</p><h1>لوحة تحكم مدير تكنولوجيا المعلومات</h1><p>متابعة التذاكر و مهام المهندسين والمشكلات المتكررة.</p></div><Button as={Link} to="/manager/tickets">إدارة جميع التذاكر</Button></div>
    <Button variant="secondary" onClick={() => query.refresh(true)}>تحديث البيانات</Button>
    {query.error && <p role="alert" className="content-card my-4">{query.error.message}</p>}
    {query.status === 'loading' ? <p role="status" className="content-card mt-4">جارٍ تحميل لوحة التحكم...</p> : query.data && <>
      <section className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[['إجمالي التذاكر', query.data.summary.total], ['تم حلها', query.data.summary.solved], ['لم تُحل بعد', query.data.summary.unsolved], ['غير مسندة', query.data.unassigned], ...ticketStatuses.map(status => [statusLabels[status], query.data.summary.byStatus[status] ?? 0])].map(([label, value]) => <article className="metric-card" key={label}><strong>{value}</strong><span>{label}</span></article>)}</section>
      <div className="mt-6 grid gap-6 lg:grid-cols-2"><section className="content-card"><h2 className="text-lg font-bold text-ink">أحدث التذاكر</h2>{query.data.recent.map(ticket => <article className="my-4 rounded-xl bg-canvas p-4" key={ticket.id}><p className="text-xs font-bold text-primary-600"><bdi dir="ltr" title={ticket.reference}>{formatTicketReference(ticket)}</bdi></p><Link className="mt-1 block font-bold text-ink hover:text-primary-600" to={'/manager/tickets/' + ticket.id}>{ticket.title}</Link><p className="my-2 text-sm text-muted">{ticket.reporterName || 'غير متاح'} · {ticket.department || 'غير متاح'} · {ticket.assignedTechnician || 'غير مسندة'}</p><p className="text-xs text-muted">اسم المستخدم: {ticket.reporterUsername || 'غير متاح'} · الهاتف: {ticket.reporterPhone || 'غير متاح'}</p><div className="flex flex-wrap items-center justify-between gap-3"><StatusBadge status={ticket.status} />{!['resolved', 'closed'].includes(ticket.status) && <Button type="button" variant="secondary" onClick={() => setAssignmentTicket(ticket)}>{ticket.assignedTechnicianId ? 'إعادة الإسناد' : 'إسناد لمهندس'}</Button>}</div></article>)}{!query.data.recent.length && <p className="mt-4 text-muted">لا توجد تذاكر.</p>}</section>
        <section className="content-card"><h2 className="text-lg font-bold text-ink">مهام المهندسين</h2>{query.data.users.map(user => <p key={user.id} className="my-4 rounded-xl bg-canvas p-4 text-ink">{engineerLabel(user)}{!user.isActive && ' — حساب معطل'}</p>)}{!query.data.users.length && <p className="mt-4 text-muted">لا يوجد مهندسون.</p>}</section></div>
      <section className="content-card mt-6"><h2 className="font-bold text-ink">المشكلات المتكررة</h2>{query.data.recurring?.map(problem => <p key={problem.key} className="mt-4 text-muted">{problem.department} · {problem.category} · {problem.count} بلاغ · {problem.openCount} نشط</p>)}{!query.data.recurring?.length && <p className="mt-4 text-muted">لا توجد مشكلات متكررة.</p>}</section></>}
    {assignmentTicket && <TicketAssignmentModal ticket={assignmentTicket} technicians={engineers} workloads={workloads} onClose={() => setAssignmentTicket(null)} onSave={saveAssignment} />}
  </div>
}
