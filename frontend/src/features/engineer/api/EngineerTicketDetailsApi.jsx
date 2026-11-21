import { formatReporterIp } from '../../../services/tickets/formatReporterIp'
import { formatAnydeskId } from '../../../services/tickets/anydesk'
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
import { buildTicketFeed, feedToneClass } from '../../../services/tickets/ticketFeed'
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
  // Assets come from the asset registry (asset-management/simple), the system's main asset list.
  const assets = useApiQuery(JSON.stringify(['registry', search, page, canEdit]), (signal) => canEdit ? service.registryAssets(search, page, signal) : Promise.resolve({ items: [], total: 0 }))
  const linkKey = useRef(null)
  const linked = useApiQuery(ticket?.relatedAssetId ?? 'no-linked-asset', (signal) => ticket?.relatedAssetId ? service.asset(ticket.relatedAssetId, signal) : Promise.resolve(null))
  useEngineerRefresh(query.refresh, busy)
  useEngineerRefresh(ownQuery.refresh, busy)
  const claimTicket = async () => {
    if (lock.current || !canClaimTicket || ownQuery.data?.isAvailable !== true) return
    lock.current = true; setBusy(true); setMessage(null)
    try {
      const updated = await service.claim(ticket.id)
      query.update(updated)
      setMessage({ success: true, text: 'تم إسناد التذكرة إليك وبدأ العمل عليها (قيد التنفيذ).' })
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
  const submitNote = async (event) => { event.preventDefault(); if (note.trim() && await run(() => service.note(ticket, note, visibility), visibility === 'internal' ? 'تمت إضافة التعليق الداخلي.' : 'تمت إضافة التعليق.')) setNote('') }
  const linkAsset = async (event) => {
    event.preventDefault()
    if (!selected) return
    // One retry key per chosen asset, so a lost response cannot record the link twice.
    if (linkKey.current?.assetId !== selected) linkKey.current = { assetId: selected, key: crypto.randomUUID() }
    if (await run(async () => { await service.linkAsset(ticket, selected, linkKey.current.key); return service.details(ticket.id) }, 'تم ربط الأصل بالتذكرة مع حفظ اسم المهندس ووقت الربط.')) { setSelected(''); linkKey.current = null }
  }
  if (query.status === 'loading') return <p role="status" className="content-card">جارٍ تحميل التذكرة...</p>
  if (!ticket || [403, 404].includes(query.error?.status)) return <section className="content-card text-center"><h1 className="text-2xl font-extrabold text-ink">التذكرة غير متاحة</h1><p role="alert" className="mt-3 text-muted">{query.error && ![403, 404].includes(query.error.status) ? query.error.message : 'لم يتم العثور على التذكرة.'}</p><Button className="mt-4" onClick={() => query.refresh()}>إعادة المحاولة</Button><Link className="mt-4 block text-primary-600" to="/technician/tickets">العودة إلى جميع التذاكر</Link></section>
  const active = canEdit && ['assigned', 'in_progress', 'pending', 'reopened'].includes(ticket.status)
  const canStart = canEdit && ['assigned', 'pending', 'reopened'].includes(ticket.status)
  const feed = buildTicketFeed(ticket)
  const canComment = canEdit && ticket.status !== 'new'
  const linkedAssets = ticket.linkedAssets ?? []
  const canLink = canEdit && !['resolved', 'closed'].includes(ticket.status)
  return <div className="mx-auto min-w-0 max-w-7xl [overflow-wrap:anywhere]">
    <Link to="/technician/tickets" className="mb-5 block font-bold text-primary-600">العودة إلى جميع التذاكر</Link>
    <div className="page-heading"><div><p className="eyebrow break-all"><bdi dir="ltr" title={ticket.reference}>{formatTicketReference(ticket)}</bdi></p><h1>{ticket.title}</h1><p className="whitespace-pre-wrap">{ticket.description}</p></div><StatusBadge status={ticket.status} /></div>
    {!canEdit && (canClaimTicket ? <section className="content-card mb-5"><p className="text-muted">هذه التذكرة غير مسندة. يمكنك إسنادها إلى نفسك إذا كنت متاحًا.</p>{ownQuery.error && <p role="alert" className="mt-3 text-red-700 dark:text-red-300">تعذر التحقق من حالة توفرك: {ownQuery.error.message}</p>}{ownQuery.status === 'ready' && ownQuery.data?.isAvailable !== true && <p className="mt-3 text-sm text-amber-700 dark:text-amber-300">يجب أن يكون حسابك نشطًا ومتاحًا للإسناد أولًا.</p>}<Button type="button" className="mt-4" disabled={busy || ownQuery.data?.isAvailable !== true} onClick={claimTicket}>إسناد لنفسي</Button></section> : <p role="status" className="content-card mb-5 text-muted">هذه التذكرة للعرض فقط. {ticket.assignedTechnician ? `المهندس المسؤول: ${ticket.assignedTechnician}.` : 'لا يمكن تولي هذه التذكرة.'}</p>)}
    <Button variant="secondary" className="mb-5" disabled={busy} onClick={() => query.refresh(true)}>تحديث التذكرة</Button>
    {query.error && <p role="alert" className="content-card mb-4 text-red-700 dark:text-red-300">{query.error.message}</p>}
    {message && <p role={message.success ? 'status' : 'alert'} className={'content-card mb-4 ' + (message.success ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300')}>{message.text}</p>}
    {busy && <p role="status" className="mb-4 text-muted">جارٍ حفظ التحديث...</p>}
    <section className="content-card"><dl className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
      {[['اسم طالب الدعم', ticket.reporterName], ['اسم المستخدم وقت البلاغ', ticket.reporterUsername], ['هاتف مقدم البلاغ وقت البلاغ', ticket.reporterPhone], ['معرّف AnyDesk', formatAnydeskId(ticket.anydeskId)], ...(ticket.source === 'portal' ? [['عنوان IP للجهاز وقت إرسال البلاغ', ticket.reporterIp && <bdi dir="ltr">{formatReporterIp(ticket.reporterIp)}</bdi>]] : []), ...(ticket.requesterType === 'it_internal' ? [['نوع البلاغ', 'بلاغ تقنية المعلومات (مهمة داخلية)']] : ticket.requesterType === 'top_management' ? [['المنصب أو المكتب', ticket.managementPosition]] : [['القسم', ticket.department]]), ['التصنيف', ticket.category + ' / ' + ticket.subcategory], ['الإسناد بواسطة', assignmentSource(ticket)], ['تاريخ الإسناد', ticket.assignedAt ? date.format(new Date(ticket.assignedAt)) : 'لم يتم الإسناد']].map(([label, value]) => <div key={label}><dt className="text-xs text-muted">{label}</dt><dd className="mt-2 font-bold text-ink">{value || 'غير متاح'}</dd></div>)}
    </dl></section>
    <section className="content-card mt-6"><h2 className="text-lg font-extrabold text-ink">الأصول المستخدمة في التذكرة</h2>
      {ticket.relatedAssetId && linked.data && <div className="mt-4 rounded-xl bg-canvas p-4"><p className="text-xs text-muted">سحب سابق من المخزون القديم</p><p className="mt-1 font-bold text-ink">{linked.data.name} · <span className="break-all">{linked.data.assetId}</span></p><p className="mt-2 text-muted">سحبه المهندس: {linked.data.takenByEngineerName}</p></div>}
      {linkedAssets.length > 0 ? <ul className="mt-4 space-y-3">{linkedAssets.map((asset) => <li key={asset.id} className="rounded-xl bg-canvas p-4"><p className="font-bold text-ink"><bdi dir="ltr">{asset.internalAssetId}</bdi> · {asset.assetTypeName}{asset.brand ? ` · ${asset.brand}` : ''}{asset.model ? ` ${asset.model}` : ''}</p>{asset.serialNumber && <p className="mt-1 text-sm text-muted">الرقم التسلسلي: <bdi dir="ltr">{asset.serialNumber}</bdi></p>}<p className="mt-1 text-sm text-muted">ربطه: {asset.linkedByName} · <time>{date.format(new Date(asset.linkedAt))}</time></p></li>)}</ul> : !ticket.relatedAssetId && <p className="mt-3 text-muted">لا توجد أصول مرتبطة بهذه التذكرة.</p>}
      {canLink && <form onSubmit={linkAsset} className="mt-5 border-t border-border pt-5" aria-busy={busy}><fieldset disabled={busy}>
        <label><span className="field-label">ابحث في سجل الأصول</span><input type="search" name="assetSearch" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); setSelected('') }} className="field-input" placeholder="رقم الأصل أو النوع أو الماركة أو الموديل أو الرقم التسلسلي" /></label>
        {assets.error && <p role="alert" className="my-3 text-red-700 dark:text-red-300">{assets.error.message}</p>}
        {assets.status === 'loading' ? <p role="status" className="my-3 text-muted">جارٍ تحميل سجل الأصول...</p> : <label className="mt-4 block"><span className="field-label">اختر الأصل المستخدم</span><select name="assetId" value={selected} onChange={(event) => setSelected(event.target.value)} className="field-input" required><option value="">{assets.data?.items.length ? 'اختر من سجل الأصول' : 'لا توجد أصول مطابقة'}</option>{assets.data?.items.map((asset) => { const already = linkedAssets.some((item) => item.id === asset.id), heldByEmployee = asset.custodianType === 'employee'; return <option key={asset.id} value={asset.id} disabled={already || heldByEmployee}>{asset.internalAssetId} — {asset.assetTypeName}{asset.brand ? ` ${asset.brand}` : ''}{asset.model ? ` ${asset.model}` : ''}{asset.custodianName ? ` — عهدة: ${asset.custodianName}` : ''}{already ? ' — مرتبط' : heldByEmployee ? ' — في عهدة موظف (غير متاح)' : ''}</option> })}</select></label>}
        <div className="mt-4 flex flex-wrap gap-3"><Button type="submit" disabled={busy || !selected || assets.status !== 'ready'}>ربط الأصل بالتذكرة</Button><Button type="button" variant="secondary" disabled={page === 1} onClick={() => { setPage(page - 1); setSelected('') }}>السابق</Button><Button type="button" variant="secondary" disabled={page * 10 >= (assets.data?.total ?? 0)} onClick={() => { setPage(page + 1); setSelected('') }}>التالي</Button></div>
      </fieldset></form>}
    </section>
    {active && <section className="content-card mt-6" aria-busy={busy}><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-extrabold text-ink">إجراءات التذكرة</h2>{canStart && <Button disabled={busy} onClick={() => run(() => service.start(ticket), 'تم بدء العمل وتحديث الحالة.')}>{ticket.status === 'pending' ? 'استئناف العمل' : 'بدء العمل'}</Button>}</div>
      <div className="mt-5 grid gap-5 lg:grid-cols-2"><form onSubmit={submitPending} className="rounded-xl bg-canvas p-4"><label><span className="field-label">سبب التعليق *</span><textarea name="pendingReason" disabled={busy} maxLength={2000} value={pending} onChange={(event) => setPending(event.target.value)} className="field-textarea" required /></label><Button type="submit" variant="secondary" disabled={busy || !pending.trim()} className="mt-3 w-full">تعيين كمعلّقة</Button></form><form onSubmit={submitSolution} className="rounded-xl bg-canvas p-4"><label><span className="field-label">وصف الحل *</span><textarea name="solutionDescription" disabled={busy} maxLength={4000} value={solution} onChange={(event) => setSolution(event.target.value)} className="field-textarea" required /></label><Button type="submit" disabled={busy || !solution.trim()} className="mt-3 w-full">تسجيل المشكلة كمحلولة</Button></form></div>
    </section>}
    <section className="content-card mt-6"><h2 className="text-lg font-extrabold text-ink">التعليقات</h2>
      {canComment && <form onSubmit={submitNote} className="mt-4 rounded-xl bg-canvas p-4"><fieldset disabled={busy}><label className="block"><span className="field-label">إضافة تعليق</span><textarea name="noteText" maxLength={4000} value={note} onChange={(event) => setNote(event.target.value)} className="field-textarea" required /></label>
        <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2" role="radiogroup" aria-label="من يرى التعليق">{[['public', 'يظهر للموظف'], ['internal', 'داخلي — لفريق تكنولوجيا المعلومات فقط']].map(([value, label]) => <label key={value} className="text-sm text-ink"><input type="radio" name="noteVisibility" value={value} checked={visibility === value} onChange={() => setVisibility(value)} className="ml-2 accent-primary-600" />{label}</label>)}</div>
        <Button type="submit" disabled={busy || !note.trim()} className="mt-3">إضافة التعليق</Button></fieldset></form>}
      <div className="mt-5 space-y-3">{feed.map((item) => <article key={item.id} className={`rounded-xl border-s-4 bg-canvas p-4 ${feedToneClass[item.tone]}`}><div className="flex flex-wrap justify-between gap-2"><strong className="text-ink">{item.authorName}</strong><span className="text-sm font-bold text-muted">{item.label}</span></div><p className="mt-2 whitespace-pre-wrap text-ink">{item.text}</p><time className="mt-2 block text-xs text-muted">{date.format(new Date(item.createdAt))}</time></article>)}{!feed.length && <p className="text-muted">لا توجد تعليقات حتى الآن.</p>}</div>
    </section>
    <div className="mt-6"><TicketTimeline ticket={ticket} audience="technician" /></div>
  </div>
}
