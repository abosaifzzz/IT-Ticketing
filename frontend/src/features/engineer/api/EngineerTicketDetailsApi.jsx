import { formatTicketReference } from '../../../services/tickets/formatTicketReference.js'
import { useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Button } from '../../../components/ui/Button'
import { StatusBadge } from '../../../components/tickets/StatusBadge'
import { TicketTimeline } from '../../../components/tickets/TicketTimeline'
import { engineerTicketService as service } from '../../../services/tickets/engineerTicketService'
import { assignmentSource } from '../../../services/tickets/engineerTicketApi'
import { useApiQuery } from '../../../services/http/useApiQuery'
import { useEngineerRefresh } from './useEngineerRefresh'
import { useAuth } from '../../auth/useAuth'

const date = new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium', timeStyle: 'short' })
export function EngineerTicketDetailsApi() {
  const { id } = useParams()
  const { user } = useAuth()
  const query = useApiQuery(id, (signal) => service.details(id, signal))
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(null)
  const [pending, setPending] = useState(''), [solution, setSolution] = useState(''), [note, setNote] = useState(''), [visibility, setVisibility] = useState('public')
  const [search, setSearch] = useState(''), [page, setPage] = useState(1), [selected, setSelected] = useState('')
  const lock = useRef(false)
  const ticket = query.data
  const canEdit = ticket?.assignedTechnicianId === user.id
  const canClaimTicket = ticket?.status === 'new' && !ticket.assignedTechnicianId
  const ownQuery = useApiQuery(`engineer-detail-own-state-${user.id}`, (signal) => service.ownState(user.id, signal))
  const assets = useApiQuery(JSON.stringify([search, page, canEdit]), (signal) => canEdit ? service.assets(search, page, signal) : Promise.resolve({ items: [], total: 0 }))
  const linked = useApiQuery(ticket?.relatedAssetId ?? 'no-linked-asset', (signal) => ticket?.relatedAssetId ? service.asset(ticket.relatedAssetId, signal) : Promise.resolve(null))
  useEngineerRefresh(query.refresh, busy)
  useEngineerRefresh(ownQuery.refresh, busy)
  const claimTicket = async () => {
    if (lock.current || !canClaimTicket || ownQuery.data?.isAvailable !== true) return
    lock.current = true; setBusy(true); setMessage(null)
    try {
      const updated = await service.claim(ticket.id)
      query.update(updated)
      setMessage({ success: true, text: 'تم إسناد التذكرة إليك. يمكنك الآن بدء العمل عليها.' })
    } catch (error) {
      setMessage({ success: false, text: error.message })
      await query.refresh(true)
      await ownQuery.refresh(true)
    } finally { lock.current = false; setBusy(false) }
  }
  const run = async (action, success) => {
    if (lock.current || !canEdit) return false
    lock.current = true; setBusy(true); setMessage(null)
    try { const updated = await action(); query.update(updated); setMessage({ success: true, text: success }); return true }
    catch (error) {
      setMessage({ success: false, text: error.message })
      if ([403, 404].includes(error.status)) await query.refresh()
      else if (error.status === 409) { await query.refresh(true); await assets.refresh(true); setSelected('') }
      return false
    } finally { lock.current = false; setBusy(false) }
  }
  const submitPending = async (event) => { event.preventDefault(); if (pending.trim() && await run(() => service.pending(ticket, pending), 'تم تعليق التذكرة وتسجيل السبب.')) setPending('') }
  const submitSolution = async (event) => { event.preventDefault(); if (solution.trim() && await run(() => service.resolve(ticket, solution), 'تم تسجيل الحل وإرسال التذكرة للموظف لتأكيد النتيجة.')) setSolution('') }
  const submitNote = async (event) => { event.preventDefault(); if (note.trim() && await run(() => service.note(ticket, note, visibility), visibility === 'internal' ? 'تمت إضافة الملاحظة الداخلية.' : 'تمت إضافة الملاحظة العامة.')) setNote('') }
  const withdraw = async (event) => {
    event.preventDefault()
    const asset = assets.data?.items.find((item) => item.assetId === selected)
    if (!asset) return
    await run(async () => { const result = await service.withdraw(ticket, asset); setSelected(''); linked.update(result.asset); await assets.refresh(true); return result.ticket }, 'تم سحب وحدة واحدة وربطها بالتذكرة مع حفظ هوية المهندس.')
  }
  if (query.status === 'loading') return <p role="status" className="content-card">جارٍ تحميل التذكرة...</p>
  if (!ticket || [403, 404].includes(query.error?.status)) return <section className="content-card text-center"><h1 className="text-2xl font-extrabold text-ink">التذكرة غير متاحة</h1><p role="alert" className="mt-3 text-muted">{query.error && ![403,404].includes(query.error.status) ? query.error.message : 'لم يتم العثور على التذكرة.'}</p><Button className="mt-4" onClick={() => query.refresh()}>إعادة المحاولة</Button><Link className="mt-4 block text-primary-600" to="/technician/tickets">العودة إلى جميع التذاكر</Link></section>
  const active = canEdit && ['assigned', 'in_progress', 'pending', 'reopened'].includes(ticket.status)
  const canStart = canEdit && ['assigned', 'pending', 'reopened'].includes(ticket.status)
  const notes = [...(ticket.publicTechnicianNotes ?? []), ...(ticket.internalTechnicianNotes ?? [])].sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt))
  return <div className="mx-auto min-w-0 max-w-7xl [overflow-wrap:anywhere]">
    <Link to="/technician/tickets" className="mb-5 block font-bold text-primary-600">العودة إلى جميع التذاكر</Link>
    <div className="page-heading"><div><p className="eyebrow break-all"><bdi dir="ltr" title={ticket.reference}>{formatTicketReference(ticket)}</bdi></p><h1>{ticket.title}</h1><p className="whitespace-pre-wrap">{ticket.description}</p></div><StatusBadge status={ticket.status} /></div>
    {!canEdit && (canClaimTicket ? <section className="content-card mb-5"><p className="text-muted">هذه التذكرة غير مسندة. يمكنك إسنادها إلى نفسك إذا كنت متاحًا.</p>{ownQuery.error && <p role="alert" className="mt-3 text-red-700 dark:text-red-300">تعذر التحقق من حالة توفرك: {ownQuery.error.message}</p>}{ownQuery.status === 'ready' && ownQuery.data?.isAvailable !== true && <p className="mt-3 text-sm text-amber-700 dark:text-amber-300">يجب أن يكون حسابك نشطًا ومتاحًا للإسناد أولًا.</p>}<Button type="button" className="mt-4" disabled={busy || ownQuery.data?.isAvailable !== true} onClick={claimTicket}>إسناد لنفسي</Button></section> : <p role="status" className="content-card mb-5 text-muted">هذه التذكرة للعرض فقط. {ticket.assignedTechnician ? `المهندس المسؤول: ${ticket.assignedTechnician}.` : 'لا يمكن تولي هذه التذكرة.'}</p>)}
    <Button variant="secondary" className="mb-5" disabled={busy} onClick={() => query.refresh(true)}>تحديث التذكرة</Button>
    {query.error && <p role="alert" className="content-card mb-4 text-red-700 dark:text-red-300">{query.error.message}</p>}
    {message && <p role={message.success ? 'status' : 'alert'} className={'content-card mb-4 ' + (message.success ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300')}>{message.text}</p>}
    {busy && <p role="status" className="mb-4 text-muted">جارٍ حفظ التحديث...</p>}
    <section className="content-card"><dl className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
      {[['اسم طالب الدعم',ticket.reporterName],...(ticket.requesterType === 'top_management' ? [['المنصب أو المكتب',ticket.managementPosition]] : [['القسم',ticket.department]]),['التصنيف',ticket.category + ' / ' + ticket.subcategory],['الإسناد بواسطة',assignmentSource(ticket)],['تاريخ الإسناد',ticket.assignedAt ? date.format(new Date(ticket.assignedAt)) : 'لم يتم الإسناد']].map(([label,value]) => <div key={label}><dt className="text-xs text-muted">{label}</dt><dd className="mt-2 font-bold text-ink">{value}</dd></div>)}
    </dl></section>
    {ticket.pendingReason && <section className="content-card mt-5"><h2 className="font-bold text-ink">سبب التعليق</h2><p className="mt-2 whitespace-pre-wrap text-muted">{ticket.pendingReason}</p></section>}
    {ticket.solutionDescription && <section className="content-card mt-5"><h2 className="font-bold text-ink">وصف الحل المسجل</h2><p className="mt-2 whitespace-pre-wrap text-muted">{ticket.solutionDescription}</p></section>}
    <section className="content-card mt-6"><h2 className="text-lg font-extrabold text-ink">سحب أصل تقني للتذكرة</h2>
      {ticket.relatedAssetId ? linked.data ? <div className="mt-4 rounded-xl bg-canvas p-4"><p className="font-bold text-ink">{linked.data.name} · <span className="break-all">{linked.data.assetId}</span></p><p className="mt-2 text-muted">الحالة: تم السحب · الكمية: {linked.data.quantity}</p><p className="mt-2 text-ink">سحبه المهندس: {linked.data.takenByEngineerName}</p><time className="mt-2 block text-sm text-muted">{date.format(new Date(linked.data.withdrawnAt))}</time></div> : <div className="mt-3">{linked.error ? <><p role="alert">{linked.error.message}</p><Button variant="secondary" onClick={() => linked.refresh()}>إعادة تحميل الأصل</Button></> : <p role="status">جارٍ تحميل الأصل المرتبط...</p>}</div> : active ? <form onSubmit={withdraw} className="mt-4" aria-busy={busy}><fieldset disabled={busy}>
        <label><span className="field-label">ابحث في الأصول التقنية</span><input type="search" name="assetSearch" value={search} onChange={(event) => {setSearch(event.target.value);setPage(1);setSelected('')}} className="field-input" placeholder="اسم الجهاز أو الموديل أو رقم الأصل" /></label>
        {assets.error && <p role="alert" className="my-3 text-red-700 dark:text-red-300">{assets.error.message}</p>}
        {assets.status === 'loading' ? <p role="status" className="my-3 text-muted">جارٍ تحميل المخزون...</p> : <label className="mt-4 block"><span className="field-label">اختر جهازًا أو ملحقًا متاحًا</span><select name="assetId" value={selected} onChange={(event) => setSelected(event.target.value)} className="field-input" required><option value="">اختر من سجل الأصول</option>{assets.data?.items.map((asset) => <option key={asset.assetId} value={asset.assetId}>{asset.name} — {asset.assetId} — {asset.quantity} متاح</option>)}</select></label>}
        <div className="mt-4 flex flex-wrap gap-3"><Button type="submit" disabled={busy || !selected || assets.status !== 'ready'}>سحب وحدة للتذكرة</Button><Button type="button" variant="secondary" disabled={page === 1} onClick={() => {setPage(page-1);setSelected('')}}>الأصول السابقة</Button><Button type="button" variant="secondary" disabled={page*10 >= (assets.data?.total ?? 0)} onClick={() => {setPage(page+1);setSelected('')}}>الأصول التالية</Button></div>
      </fieldset></form> : <p className="mt-3 text-muted">لا يوجد أصل مرتبط بهذه التذكرة.</p>}
    </section>
    {active && <section className="content-card mt-6" aria-busy={busy}><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-extrabold text-ink">إجراءات التذكرة</h2>{canStart && <Button disabled={busy} onClick={() => run(() => service.start(ticket), 'تم بدء العمل وتحديث الحالة.')}>{ticket.status === 'pending' ? 'استئناف العمل' : 'بدء العمل'}</Button>}</div>
      <div className="mt-5 grid gap-5 lg:grid-cols-2"><form onSubmit={submitPending} className="rounded-xl bg-canvas p-4"><label><span className="field-label">سبب التعليق *</span><textarea name="pendingReason" disabled={busy} maxLength={2000} value={pending} onChange={(event) => setPending(event.target.value)} className="field-textarea" required /></label><Button type="submit" variant="secondary" disabled={busy || !pending.trim()} className="mt-3 w-full">تعيين كمعلّقة</Button></form><form onSubmit={submitSolution} className="rounded-xl bg-canvas p-4"><label><span className="field-label">وصف الحل *</span><textarea name="solutionDescription" disabled={busy} maxLength={4000} value={solution} onChange={(event) => setSolution(event.target.value)} className="field-textarea" required /></label><Button type="submit" disabled={busy || !solution.trim()} className="mt-3 w-full">تسجيل المشكلة كمحلولة</Button></form></div>
    </section>}
    <div className="mt-6 grid gap-6 xl:grid-cols-2"><section className="content-card"><h2 className="text-lg font-extrabold text-ink">ملاحظات المعالجة</h2>
      {active && <form onSubmit={submitNote} className="mt-4"><fieldset disabled={busy}><label><span className="field-label">نوع الملاحظة</span><select name="noteVisibility" value={visibility} onChange={(event) => setVisibility(event.target.value)} className="field-input"><option value="public">عامة — تظهر للموظف</option><option value="internal">داخلية — لفريق تكنولوجيا المعلومات فقط</option></select></label><label className="mt-4 block"><span className="field-label">نص الملاحظة</span><textarea name="noteText" maxLength={4000} value={note} onChange={(event) => setNote(event.target.value)} className="field-textarea" required /></label><Button type="submit" disabled={busy || !note.trim()} className="mt-3">إضافة الملاحظة</Button></fieldset></form>}
      <div className="mt-5 space-y-3">{notes.map((item) => <article key={item.id} className="rounded-xl bg-canvas p-4"><div className="flex flex-wrap justify-between gap-2"><strong className="text-ink">{item.authorName}</strong><span className="text-sm text-muted">{item.visibility === 'internal' ? 'داخلية' : 'عامة'}</span></div><p className="mt-2 whitespace-pre-wrap text-muted">{item.text}</p><time className="mt-2 block text-xs text-muted">{date.format(new Date(item.createdAt))}</time></article>)}{!notes.length && <p className="text-muted">لا توجد ملاحظات معالجة حتى الآن.</p>}</div>
    </section><section className="content-card"><h2 className="text-lg font-extrabold text-ink">تعليقات الموظف</h2><div className="mt-4 space-y-3">{ticket.comments?.map((comment) => <article key={comment.id} className="rounded-xl bg-canvas p-4"><strong className="text-ink">{comment.authorName}</strong><p className="mt-2 whitespace-pre-wrap text-muted">{comment.text}</p><time className="mt-2 block text-xs text-muted">{date.format(new Date(comment.createdAt))}</time></article>)}{!ticket.comments?.length && <p className="text-muted">لم يضف الموظف تعليقات حتى الآن.</p>}</div></section></div>
    <div className="mt-6"><TicketTimeline ticket={ticket} audience="technician" /></div>
  </div>
}
