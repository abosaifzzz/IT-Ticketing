import { Check, MessageCircle, RotateCcw } from 'lucide-react'
import { statusLabels } from '../../services/mock/statuses'

const baseSteps = ['new', 'assigned', 'in_progress', 'resolved', 'closed']
const dateFormatter = new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium', timeStyle: 'short' })

function eventLabel(event) {
  if (event.type === 'reopened') return 'أُعيد فتح الطلب'
  if (event.type === 'confirmation') return 'أكد الموظف حل المشكلة'
  if (event.type === 'comment') return 'أضاف الموظف تعليقًا'
  if (event.type === 'technician_note') return event.visibility === 'internal' ? 'أضاف المهندس ملاحظة داخلية' : 'أضاف المهندس ملاحظة عامة'
  if (event.type === 'assignment') return 'تم تحديث إسناد التذكرة'
  if (event.type === 'asset_withdrawal') return 'تم سحب أصل تقني للتذكرة'
  return `تم تغيير الحالة إلى ${statusLabels[event.status] ?? event.status}`
}

export function TicketTimeline({ ticket, audience = 'employee' }) {
  const history = (ticket.history ?? []).filter((event) => audience !== 'employee' || event.visibility !== 'internal')
  const includesPending = history.some((event) => event.status === 'pending')
  const steps = includesPending ? ['new', 'assigned', 'in_progress', 'pending', 'resolved', 'closed'] : baseSteps
  const lastReopening = history.findLastIndex((event) => event.type === 'reopened' || event.status === 'reopened')
  const lastResolution = history.findLastIndex((event) => event.type === 'resolution' || event.status === 'resolved')
  const hasUnresolvedReopening = ticket.status === 'reopened' || (lastReopening > lastResolution && !['resolved', 'closed'].includes(ticket.status))

  return <section className="content-card">
    <h2 className="text-lg font-extrabold text-ink">مسار الطلب</h2>
    {hasUnresolvedReopening && <p className="mt-2 rounded-xl bg-amber-50 p-3 text-sm font-bold text-amber-800 dark:bg-amber-950/40 dark:text-amber-200"><RotateCcw className="ml-2 inline" size={17} />تمت إعادة فتح هذا الطلب؛ الحل السابق ليس نهائيًا.</p>}

    <div className="mt-6 grid gap-2 sm:grid-flow-col sm:auto-cols-fr" aria-label="تقدم حالة الطلب">
      {steps.map((status) => {
        const visited = history.some((event) => event.status === status)
        const active = ticket.status === status
        const overturned = hasUnresolvedReopening && visited && ['resolved', 'closed'].includes(status)
        return <div key={status} className={`rounded-xl border p-3 text-center text-xs font-bold ${active ? 'border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-200' : overturned ? 'border-amber-300 bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-200' : visited ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-200' : 'border-border bg-canvas text-muted'}`}><span className="mx-auto mb-2 grid size-6 place-items-center rounded-full border border-current">{visited ? <Check size={14} /> : ''}</span>{statusLabels[status]}{overturned && <span className="mt-1 block text-[10px]">حل سابق</span>}</div>
      })}
    </div>

    <h3 className="mt-8 text-base font-extrabold text-ink">سجل النشاط</h3>
    <div className="mt-4 space-y-5 border-r-2 border-primary-200 pr-5">
      {[...history].reverse().map((event) => <article key={event.id} className="relative"><span className="absolute -right-[1.62rem] top-1 grid size-5 place-items-center rounded-full bg-primary-100 text-primary-600 dark:bg-primary-900 dark:text-primary-200">{event.type === 'comment' ? <MessageCircle size={11} /> : <Check size={11} />}</span><p className="text-sm font-bold text-ink">{eventLabel(event)}</p>{event.note && !(audience === 'employee' && event.type === 'resolution') && <p className="mt-1 text-sm leading-6 text-muted">{event.note}</p>}<time className="mt-1 block text-xs text-muted">{dateFormatter.format(new Date(event.timestamp))}</time></article>)}
    </div>
  </section>
}
