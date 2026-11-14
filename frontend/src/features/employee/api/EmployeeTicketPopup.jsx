import { useEffect, useRef } from 'react'
import { TicketDetailsModal } from '../../../components/tickets/TicketDetailsModal'
import { employeeTicketService as service } from '../../../services/tickets/employeeTicketService'
import { useApiQuery } from '../../../services/http/useApiQuery'

export function EmployeeTicketPopup({ id, onClose, onChanged }) {
  const returnFocus = useRef(document.activeElement)
  useEffect(() => { const previous = returnFocus.current; return () => queueMicrotask(() => { if (previous?.isConnected) previous.focus() }) }, [])
  const query = useApiQuery(id, (signal) => service.details(id, signal))
  const run = async (action) => {
    try { const item = await action(query.data); query.update(item); onChanged(); return item }
    catch (error) { if (error.status === 409) await query.refresh(true); throw error }
  }
  if (!query.data) return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/55 p-4"><section onKeyDown={(event) => { if (event.key === 'Escape') onClose() }} role="dialog" aria-modal="true" aria-label="متابعة الطلب" className="content-card w-full max-w-lg">
    {query.error ? <><p role="alert">{query.error.status === 404 ? 'الطلب غير متاح لحسابك.' : query.error.message}</p><button className="mt-4 text-primary-600" onClick={() => query.refresh()}>إعادة المحاولة</button></> : <p role="status" className="text-ink">جارٍ تحميل تفاصيل الطلب...</p>}
    <button autoFocus className="mr-4 mt-4 text-primary-600" onClick={onClose}>إغلاق</button>
  </section></div>
  return <TicketDetailsModal key={id} ticket={query.data} onClose={onClose}
    onStatusChange={(status, reason = '') => run((ticket) => status === 'closed' ? service.confirm(ticket) : service.reopen(ticket, reason))}
    onAddComment={(text) => run((ticket) => service.comment(ticket, text))} />
}
