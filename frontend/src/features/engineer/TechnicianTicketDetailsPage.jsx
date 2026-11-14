import { formatTicketReference } from '../../services/tickets/formatTicketReference.js'
import { authMode } from '../../services/auth/mode'
import { EngineerTicketDetailsApi } from './api/EngineerTicketDetailsApi'
import { ArrowRight, CalendarDays, CircleAlert, Clock3, Hash, MessageSquareText, PackageOpen, UserRound, Wrench } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { StatusBadge } from '../../components/tickets/StatusBadge'
import { TicketTimeline } from '../../components/tickets/TicketTimeline'
import { Button } from '../../components/ui/Button'
import { mockAssetInventoryService, operationalStatusLabels } from '../../services/mock/mockAssetInventoryService'
import { getAssignmentSourceLabel, mockTicketService } from '../../services/mock/mockTicketService'
import { mockTechnicianService } from '../../services/mock/mockTechnicianService'
import { useAuth } from '../auth/useAuth'

const dateFormatter = new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium', timeStyle: 'short' })
function MockTechnicianTicketDetailsPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const [ticket, setTicket] = useState(() => mockTicketService.getById(id))
  const [pendingReason, setPendingReason] = useState('')
  const [solution, setSolution] = useState('')
  const [noteText, setNoteText] = useState('')
  const [noteVisibility, setNoteVisibility] = useState('public')
  const [message, setMessage] = useState(null)
  const [selectedAssetId, setSelectedAssetId] = useState('')
  const [assetSearch, setAssetSearch] = useState('')

  if (!ticket) return <section className="content-card mx-auto max-w-xl text-center"><CircleAlert className="mx-auto text-amber-500" size={42} /><h1 className="mt-4 text-2xl font-extrabold text-ink">التذكرة غير متاحة</h1><p className="mt-3 text-sm leading-7 text-muted">لم يتم العثور على التذكرة.</p><Link to="/technician/tickets" className="mt-6 inline-flex items-center gap-2 font-bold text-primary-600"><ArrowRight size={18} />العودة إلى جميع التذاكر</Link></section>

  const applyUpdate = (updated, successMessage) => {
    if (!updated) return setMessage({ type: 'error', text: 'تعذر تنفيذ الإجراء. تحقق من حالة التذكرة والبيانات المطلوبة.' })
    setTicket(updated)
    setMessage({ type: 'success', text: successMessage })
  }
  const startWork = () => applyUpdate(mockTicketService.startWork(ticket.id, user.id), ticket.status === 'pending' ? 'تم استئناف العمل على التذكرة.' : 'تم بدء العمل وتحديث الحالة إلى قيد التنفيذ.')
  const markPending = (event) => {
    event.preventDefault()
    const updated = mockTicketService.setPending(ticket.id, user.id, pendingReason)
    applyUpdate(updated, 'تم تعليق التذكرة وتسجيل السبب.')
    if (updated) setPendingReason('')
  }
  const resolveTicket = (event) => {
    event.preventDefault()
    const updated = mockTicketService.resolve(ticket.id, user.id, solution)
    applyUpdate(updated, 'تم تسجيل الحل وإرسال التذكرة للموظف لتأكيد النتيجة.')
    if (updated) setSolution('')
  }
  const addNote = (event) => {
    event.preventDefault()
    const updated = mockTicketService.addTechnicianNote(ticket.id, { technicianId: user.id, technicianName: user.name, text: noteText, visibility: noteVisibility })
    applyUpdate(updated, noteVisibility === 'public' ? 'تمت إضافة الملاحظة العامة.' : 'تمت إضافة الملاحظة الداخلية.')
    if (updated) setNoteText('')
  }
  const isOwnTicket = ticket.assignedTechnicianId === user.id
  const canClaimTicket = ticket.status === 'new' && !ticket.assignedTechnicianId
  const engineer = mockTechnicianService.getById(user.id)
  const canClaim = engineer?.active && engineer.available !== false
  const claimTicket = () => {
    if (!canClaimTicket || !canClaim) return
    const claimed = mockTicketService.selfAssign(ticket.id, user)
    if (claimed) applyUpdate(claimed, 'تم إسناد التذكرة إليك. يمكنك الآن بدء العمل عليها.')
    else {
      setTicket(mockTicketService.getById(ticket.id))
      setMessage({ type: 'error', text: 'تعذر إسناد التذكرة. ربما أسندت بالفعل إلى مهندس آخر.' })
    }
  }
  const canStart = isOwnTicket && ['assigned', 'pending', 'reopened'].includes(ticket.status)
  const canUpdate = isOwnTicket && ['assigned', 'in_progress', 'pending', 'reopened'].includes(ticket.status)
  const availableAssets = mockAssetInventoryService.query({ search: assetSearch, operationalStatus: 'working' })
  const linkedAsset = ticket.relatedAssetId ? mockAssetInventoryService.getById(ticket.relatedAssetId) : null
  const withdrawAsset = (event) => {
    event.preventDefault()
    const result = mockAssetInventoryService.withdrawForTicket(selectedAssetId, ticket.id, user)
    if (!result) return setMessage({ type: 'error', text: 'تعذر سحب الأصل. تحقق من توفره وأن التذكرة ما زالت مسندة إليك.' })
    setTicket(result.ticket)
    setSelectedAssetId('')
    setMessage({ type: 'success', text: `تم سحب ${result.asset.name} وربطه بالتذكرة باسم ${result.asset.takenByEngineerName}.` })
  }

  return <div className="mx-auto max-w-7xl">
    <Link to="/technician/tickets" className="mb-5 inline-flex items-center gap-2 text-sm font-bold text-primary-600"><ArrowRight size={17} />العودة إلى جميع التذاكر</Link>
    <div className="page-heading"><div><p className="eyebrow flex items-center gap-1"><Hash size={14} /><bdi dir="ltr" title={ticket.reference}>{formatTicketReference(ticket)}</bdi></p><h1>{ticket.title}</h1><p>{ticket.description}</p></div><StatusBadge status={ticket.status} /></div>
    {!isOwnTicket && (canClaimTicket ? <section className="content-card mb-5"><p className="text-muted">هذه التذكرة غير مسندة. يمكنك إسنادها إلى نفسك إذا كنت متاحًا.</p>{!canClaim && <p className="mt-3 text-sm text-amber-700 dark:text-amber-300">يجب أن يكون حسابك نشطًا ومتاحًا للإسناد أولًا.</p>}<Button type="button" className="mt-4" disabled={!canClaim} onClick={claimTicket}>إسناد لنفسي</Button></section> : <p role="status" className="content-card mb-5 text-muted">هذه التذكرة للعرض فقط. {ticket.assignedTechnician ? `المهندس المسؤول: ${ticket.assignedTechnician}.` : 'لا يمكن تولي هذه التذكرة.'}</p>)}

    {message && <div role="status" className={`mb-6 rounded-xl border p-4 text-sm font-bold ${message.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200' : 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200'}`}>{message.text}</div>}

    <section className="content-card"><dl className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4"><div><dt className="text-xs text-muted">اسم طالب الدعم</dt><dd className="mt-1.5 font-bold text-ink">{ticket.reporterName}</dd></div>{ticket.requesterType === 'top_management' ? <div><dt className="text-xs text-muted">المنصب أو المكتب</dt><dd className="mt-1.5 font-bold text-ink">{ticket.managementPosition}</dd></div> : <div><dt className="text-xs text-muted">القسم</dt><dd className="mt-1.5 font-bold text-ink">{ticket.department}</dd></div>}<div><dt className="text-xs text-muted">التصنيف</dt><dd className="mt-1.5 font-bold text-ink">{ticket.category} / {ticket.subcategory}</dd></div><div><dt className="flex items-center gap-2 text-xs text-muted"><CalendarDays size={15} />تاريخ الإنشاء</dt><dd className="mt-1.5 font-bold text-ink">{dateFormatter.format(new Date(ticket.createdAt))}</dd></div><div><dt className="flex items-center gap-2 text-xs text-muted"><UserRound size={15} />المهندس المسؤول</dt><dd className="mt-1.5 font-bold text-ink">{ticket.assignedTechnician}</dd></div><div className="sm:col-span-2"><dt className="text-xs text-muted">جهة الإسناد</dt><dd className="mt-1.5 font-bold text-ink">{getAssignmentSourceLabel(ticket)}</dd></div><div className="sm:col-span-2 lg:col-span-4"><dt className="text-xs text-muted">وصف المشكلة الأصلي</dt><dd className="mt-1.5 whitespace-pre-wrap text-sm leading-7 text-ink">{ticket.description}</dd></div></dl></section>

    <section className="content-card mt-6"><h2 className="flex items-center gap-2 text-lg font-extrabold text-ink"><PackageOpen size={20} className="text-primary-600" />الأصل التقني المرتبط</h2>
      {linkedAsset ? <div className="mt-4 rounded-xl border border-border bg-canvas p-4"><p className="font-extrabold text-ink">{linkedAsset.name} · {linkedAsset.assetId}</p><p className="mt-1 text-sm text-muted">الحالة: {operationalStatusLabels[linkedAsset.operationalStatus]} · سحبه المهندس: {linkedAsset.takenByEngineerName ?? 'غير مسجل'}</p><Button as={Link} to={`/it/assets/${linkedAsset.assetId}`} variant="secondary" className="mt-4">عرض سجل الأصل</Button></div> : canUpdate ? <form onSubmit={withdrawAsset} className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]"><label className="sm:col-span-2"><span className="field-label">ابحث في الأصول التقنية</span><input type="search" value={assetSearch} onChange={(event) => { setAssetSearch(event.target.value); setSelectedAssetId('') }} className="field-input" placeholder="اسم الجهاز أو الموديل أو رقم الأصل" /></label><label><span className="field-label">اختر جهازًا أو ملحقًا متاحًا</span><select value={selectedAssetId} onChange={(event) => setSelectedAssetId(event.target.value)} className="field-input" required><option value="">اختر من سجل الأصول</option>{availableAssets.map((asset) => <option key={asset.assetId} value={asset.assetId}>{asset.name} — {asset.assetId} — {asset.quantity} متاح</option>)}</select></label><Button type="submit" disabled={!selectedAssetId || !availableAssets.length} className="self-end"><PackageOpen size={17} />سحب وحدة للتذكرة</Button></form> : <p className="mt-4 text-sm text-muted">لا يوجد أصل مرتبط بهذه التذكرة.</p>}
      {!linkedAsset && canUpdate && !availableAssets.length && <p className="mt-3 text-sm text-muted">لا توجد أصول متاحة مطابقة للبحث بحالة «يعمل».</p>}
    </section>

    {ticket.pendingReason && <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-900 dark:bg-amber-950/30"><h2 className="flex items-center gap-2 font-extrabold text-amber-900 dark:text-amber-200"><Clock3 size={19} />سبب التعليق</h2><p className="mt-2 text-sm leading-7 text-amber-800 dark:text-amber-100">{ticket.pendingReason}</p></section>}
    {ticket.solutionDescription && <section className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-900 dark:bg-emerald-950/30"><h2 className="flex items-center gap-2 font-extrabold text-emerald-900 dark:text-emerald-200"><Wrench size={19} />وصف الحل</h2><p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-emerald-800 dark:text-emerald-100">{ticket.solutionDescription}</p>{ticket.resolvedAt && <time className="mt-2 block text-xs text-emerald-700 dark:text-emerald-300">وقت الحل: {dateFormatter.format(new Date(ticket.resolvedAt))}</time>}</section>}

    {canUpdate && <section className="content-card mt-6"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-lg font-extrabold text-ink">إجراءات التذكرة</h2><p className="mt-1 text-sm text-muted">حدّث الحالة مع توثيق السبب أو الحل المطلوب.</p></div>{canStart && <Button onClick={startWork}>{ticket.status === 'pending' ? 'استئناف العمل' : 'بدء العمل'}</Button>}</div><div className="mt-5 grid gap-5 lg:grid-cols-2">
      <form onSubmit={markPending} className="rounded-2xl border border-border bg-canvas p-4"><label><span className="field-label">سبب التعليق <span className="text-red-600">*</span></span><textarea value={pendingReason} onChange={(event) => setPendingReason(event.target.value)} className="field-textarea" placeholder="مثال: انتظار قطعة بديلة أو حضور الموظف" required /></label><Button type="submit" variant="secondary" disabled={!pendingReason.trim()} className="mt-3 w-full">تعيين كمعلّقة</Button></form>
      <form onSubmit={resolveTicket} className="rounded-2xl border border-border bg-canvas p-4"><label><span className="field-label">وصف الحل <span className="text-red-600">*</span></span><textarea value={solution} onChange={(event) => setSolution(event.target.value)} className="field-textarea" placeholder="اشرح الإجراء الذي حل المشكلة بوضوح" required /></label><Button type="submit" disabled={!solution.trim()} className="mt-3 w-full">تسجيل المشكلة كمحلولة</Button></form>
    </div></section>}

    <div className="mt-6 grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
      <section className="content-card"><h2 className="flex items-center gap-2 text-lg font-extrabold text-ink"><MessageSquareText size={20} className="text-primary-600" />ملاحظات المعالجة</h2>{canUpdate ? <form onSubmit={addNote} className="mt-4"><label><span className="field-label">نوع الملاحظة</span><select value={noteVisibility} onChange={(event) => setNoteVisibility(event.target.value)} className="field-input"><option value="public">عامة — تظهر للموظف</option><option value="internal">داخلية — لفريق تكنولوجيا المعلومات فقط</option></select></label><label className="mt-4 block"><span className="field-label">نص الملاحظة</span><textarea value={noteText} onChange={(event) => setNoteText(event.target.value)} className="field-textarea" placeholder="سجّل خطوات الفحص أو نتيجة المعالجة" required /></label><Button type="submit" disabled={!noteText.trim()} className="mt-3 w-full sm:w-auto">إضافة الملاحظة</Button></form> : <p className="mt-4 rounded-xl border border-dashed border-border p-4 text-sm text-muted">لا يمكن إضافة ملاحظات جديدة بعد خروج التذكرة من مرحلة المعالجة.</p>}
        <div className="mt-6 space-y-3">{[...(ticket.publicTechnicianNotes ?? []), ...(ticket.internalTechnicianNotes ?? [])].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).map((note) => <article key={note.id} className="rounded-xl border border-border bg-canvas p-4"><div className="flex items-center justify-between gap-3"><strong className="text-sm text-ink">{note.authorName}</strong><span className={`rounded-full px-2.5 py-1 text-[11px] font-extrabold ${note.visibility === 'internal' ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200' : 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200'}`}>{note.visibility === 'internal' ? 'داخلية' : 'عامة'}</span></div><p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-muted">{note.text}</p><time className="mt-2 block text-xs text-muted">{dateFormatter.format(new Date(note.createdAt))}</time></article>)}{!(ticket.publicTechnicianNotes?.length || ticket.internalTechnicianNotes?.length) && <p className="rounded-xl border border-dashed border-border p-5 text-center text-sm text-muted">لا توجد ملاحظات معالجة حتى الآن.</p>}</div>
      </section>

      <section className="content-card"><h2 className="text-lg font-extrabold text-ink">تعليقات الموظف</h2>{ticket.comments?.length ? <div className="mt-4 space-y-3">{ticket.comments.map((comment) => <article key={comment.id} className="rounded-xl bg-canvas p-4"><strong className="text-sm text-ink">{comment.authorName}</strong><p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-muted">{comment.text}</p><time className="mt-2 block text-xs text-muted">{dateFormatter.format(new Date(comment.createdAt))}</time></article>)}</div> : <p className="mt-4 rounded-xl border border-dashed border-border p-5 text-center text-sm text-muted">لم يضف الموظف تعليقات على هذه التذكرة.</p>}</section>
    </div>

    <div className="mt-6"><TicketTimeline ticket={ticket} audience="technician" /></div>
  </div>
}

export function TechnicianTicketDetailsPage(){return authMode === 'api' ? <EngineerTicketDetailsApi /> : <MockTechnicianTicketDetailsPage />}
