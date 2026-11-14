import { formatTicketReference } from '../../../services/tickets/formatTicketReference.js'
import { useRef,useState } from 'react'
import { Link,useParams } from 'react-router-dom'
import { Button } from '../../../components/ui/Button'
import { StatusBadge } from '../../../components/tickets/StatusBadge'
import { TicketTimeline } from '../../../components/tickets/TicketTimeline'
import { managerService as service } from '../../../services/manager/managerService'
import { engineerLabel } from '../../../services/manager/managerApi'
import { assignmentSource } from '../../../services/tickets/engineerTicketApi'
import { useApiQuery } from '../../../services/http/useApiQuery'
import { useEngineerRefresh } from '../../engineer/api/useEngineerRefresh'
export function ManagerTicketDetailsApi(){
 const {id}=useParams(),query=useApiQuery(id,signal=>service.details(id,signal))
 const engineers=useApiQuery('assignment-engineers',signal=>service.records('it-users',{role:'technician',activeOnly:true},signal))
 const [selected,setSelected]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[success,setSuccess]=useState('')
 const lock=useRef(false)
 useEngineerRefresh(query.refresh,busy);useEngineerRefresh(engineers.refresh,busy)
 const assign=async event=>{event.preventDefault();if(lock.current||!selected)return;lock.current=true;setBusy(true);setError('');setSuccess('');try{query.update(await service.assign(query.data,selected));setSelected('');setSuccess('تم تحديث الإسناد.');await engineers.refresh(true)}catch(failure){setError(failure.message);if([403,404,409].includes(failure.status))await query.refresh();await engineers.refresh(true)}finally{lock.current=false;setBusy(false)}}
 if(query.status==='loading')return <p role="status" className="content-card">جارٍ تحميل التذكرة...</p>
 if(query.error)return <section className="content-card"><p role="alert">{query.error.message}</p><Button onClick={()=>query.refresh()}>إعادة المحاولة</Button></section>
 const ticket=query.data,notes=[...(ticket.publicTechnicianNotes??[]),...(ticket.internalTechnicianNotes??[])]
 return <div className="mx-auto max-w-7xl [overflow-wrap:anywhere]"><Link to="/manager/tickets" className="mb-5 block text-primary-600">العودة إلى جميع التذاكر</Link><div className="page-heading"><div><p className="eyebrow break-all"><bdi dir="ltr" title={ticket.reference}>{formatTicketReference(ticket)}</bdi></p><h1>{ticket.title}</h1><p className="whitespace-pre-wrap">{ticket.description}</p></div><StatusBadge status={ticket.status}/></div>
 <Button variant="secondary" disabled={busy} onClick={()=>{query.refresh(true);engineers.refresh(true)}}>تحديث التذكرة</Button>
 <section className="content-card mt-5"><dl className="grid gap-5 sm:grid-cols-2">{[['اسم طالب الدعم',ticket.reporterName],...(ticket.requesterType === 'top_management' ? [['المنصب أو المكتب',ticket.managementPosition]] : [['القسم',ticket.department]]),['التصنيف',ticket.category],['التصنيف الفرعي',ticket.subcategory||'بدون'],['المهندس',ticket.assignedTechnician||'غير مسندة'],['الإسناد بواسطة',assignmentSource(ticket)],['سبب التعليق',ticket.pendingReason||'—'],['وصف الحل',ticket.solutionDescription||'—']].map(([label,value])=><div key={label}><dt className="text-muted">{label}</dt><dd className="mt-2 whitespace-pre-wrap font-bold text-ink">{value}</dd></div>)}</dl></section>
 <section className="content-card mt-5"><h2 className="text-lg font-bold text-ink">إسناد / إعادة إسناد التذكرة</h2><p className="mt-2 text-muted">يمكن الإسناد لمهندس نشط حتى لو كان غير متاح مؤقتًا.</p>
 {error&&<p role="alert" className="mt-3">{error}</p>}{success&&<p role="status" className="mt-3">{success}</p>}{engineers.error&&<p role="alert">{engineers.error.message}</p>}
 {['resolved','closed'].includes(ticket.status)?<p className="mt-4 text-muted">لا يمكن إسناد تذكرة محلولة أو مغلقة.</p>:<form onSubmit={assign} className="mt-4"><label><span className="field-label">المهندس النشط</span><select name="technicianId" className="field-input" value={selected} disabled={busy||engineers.status!=='ready'||!!engineers.error} onChange={event=>setSelected(event.target.value)} required><option value="">اختر المهندس</option>{engineers.data?.items.map(user=><option key={user.id} value={user.id}>{engineerLabel(user)}</option>)}</select></label><Button className="mt-4" type="submit" disabled={busy||!selected||!!engineers.error||engineers.status!=='ready'}>{busy?'جارٍ حفظ الإسناد...':'حفظ الإسناد'}</Button></form>}</section>
 <div className="mt-6 grid gap-6 lg:grid-cols-2"><section className="content-card"><h2 className="font-bold text-ink">ملاحظات المعالجة العامة والداخلية</h2>{notes.map(note=><article className="mt-4 rounded-xl bg-canvas p-4" key={note.id}><strong className="text-ink">{note.authorName} · {note.visibility==='internal'?'داخلية':'عامة'}</strong><p className="mt-2 whitespace-pre-wrap text-muted">{note.text}</p></article>)}{!notes.length&&<p className="mt-4 text-muted">لا توجد ملاحظات.</p>}</section><section className="content-card"><h2 className="font-bold text-ink">تعليقات الموظف</h2>{ticket.comments?.map(comment=><article key={comment.id} className="mt-4 rounded-xl bg-canvas p-4"><strong className="text-ink">{comment.authorName}</strong><p className="mt-2 whitespace-pre-wrap text-muted">{comment.text}</p></article>)}</section></div><div className="mt-6"><TicketTimeline ticket={ticket} audience="manager"/></div></div>
}
