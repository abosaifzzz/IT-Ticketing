import { MessageCircle } from 'lucide-react'
import { useRef, useState } from 'react'
import { Button } from '../ui/Button'

const dateFormatter = new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium', timeStyle: 'short' })

export function TicketComments({ ticket, onAddComment }) {
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const lock = useRef(false)
  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!comment.trim() || lock.current) return
    lock.current = true; setBusy(true); setError('')
    try { const saved = await onAddComment(comment); if (saved) setComment('') } catch (failure) { setError(failure.message || 'تعذر إرسال التعليق.') } finally { lock.current = false; setBusy(false) }
  }

  return <section className="content-card">
    <div className="flex items-center gap-2"><MessageCircle size={19} className="text-primary-500" /><h2 className="text-lg font-extrabold text-ink">تعليقات الموظف</h2></div>
    <div className="mt-5 space-y-3">{ticket.comments?.length ? ticket.comments.map((item) => <article key={item.id} className="rounded-xl bg-canvas p-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-bold text-ink">{item.authorName}</p><time className="text-xs text-muted">{dateFormatter.format(new Date(item.createdAt))}</time></div><p className="mt-2 text-sm leading-7 text-muted">{item.text}</p></article>) : <p className="rounded-xl border border-dashed border-border p-5 text-center text-sm text-muted">لا توجد تعليقات مضافة.</p>}</div>
    {error && <p role="alert" className="mt-3 text-red-700 dark:text-red-300">{error}</p>}
    <form aria-busy={busy} onSubmit={handleSubmit} className="mt-5"><label><span className="field-label">إضافة تعليق</span><textarea maxLength={4000} disabled={busy} value={comment} onChange={(event) => setComment(event.target.value)} className="field-textarea" placeholder="أضف معلومات أو تحديثًا يساعد فريق الدعم" /></label><Button type="submit" className="mt-3" disabled={busy || !comment.trim()}>إرسال التعليق</Button></form>
  </section>
}
