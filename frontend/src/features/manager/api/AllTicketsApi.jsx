import { formatTicketReference } from '../../../services/tickets/formatTicketReference.js'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../../../components/ui/Button'
import { StatusBadge } from '../../../components/tickets/StatusBadge'
import { TicketAssignmentModal } from '../../../components/tickets/TicketAssignmentModal'
import { managerService as service } from '../../../services/manager/managerService'
import { useApiQuery } from '../../../services/http/useApiQuery'
import { useEngineerRefresh } from '../../engineer/api/useEngineerRefresh'
import { statusLabels,ticketStatuses } from '../../../services/mock/statuses'
import { assignmentSource } from '../../../services/tickets/engineerTicketApi'
const initial={search:'',status:'all',creationDate:'',sort:'newest',departmentId:'',categoryId:''}
export function AllTicketsApi(){
 const [filters,setFilters]=useState(initial),[page,setPage]=useState(1)
 const [assignmentTicket,setAssignmentTicket]=useState(null),[busy,setBusy]=useState(false)
 const query=useApiQuery(JSON.stringify([filters,page]),signal=>service.list({...filters,page,pageSize:20},signal))
 const options=useApiQuery('manager-ticket-options',async signal=>{const [departments,categories]=await Promise.all([service.records('departments',{},signal),service.records('fault-categories',{},signal)]);return{departments:departments.items,categories:categories.items}})
 const engineersQuery=useApiQuery('manager-assignment-engineers',signal=>service.records('it-users',{role:'technician'},signal))
 useEngineerRefresh(query.refresh,busy)
 useEngineerRefresh(engineersQuery.refresh,busy)
 const engineers=engineersQuery.data?.items.map(user=>({id:user.id,name:user.fullName,active:user.isActive,available:user.isAvailable,jobTitle:user.jobTitle}))??[]
 const workloads=Object.fromEntries((engineersQuery.data?.items??[]).map(user=>[user.id,user.activeTicketCount]))
 const saveAssignment=async(engineerId)=>{setBusy(true);try{await service.assign(assignmentTicket,engineerId);setAssignmentTicket(null);await Promise.all([query.refresh(true),engineersQuery.refresh(true)]);return true}catch(failure){if(failure.status===409)setAssignmentTicket(await service.details(assignmentTicket.id));throw failure}finally{setBusy(false)}}
 const change=({target})=>{setFilters(old=>({...old,[target.name]:target.value}));setPage(1)}
 return <div className="mx-auto max-w-[1500px] [overflow-wrap:anywhere]"><div className="page-heading"><div><p className="eyebrow">إدارة الدعم</p><h1>جميع التذاكر</h1><p>البحث والمتابعة والإسناد من تفاصيل التذكرة.</p></div><Button as={Link} to="/manager/manual-ticket">بلاغ يدوي</Button></div>
 <section className="content-card mb-5"><div className="form-grid"><label><span className="field-label">البحث</span><input className="field-input" name="search" maxLength={200} value={filters.search} onChange={change}/></label>
 <label><span className="field-label">الحالة</span><select name="status" className="field-input" value={filters.status} onChange={change}><option value="all">جميع الحالات</option>{ticketStatuses.map(status=><option key={status} value={status}>{statusLabels[status]}</option>)}</select></label>
 <label><span className="field-label">تاريخ الإنشاء</span><input className="field-input" type="date" name="creationDate" value={filters.creationDate} onChange={change}/></label>
 <label><span className="field-label">الترتيب</span><select className="field-input" name="sort" value={filters.sort} onChange={change}><option value="newest">الأحدث أولًا</option><option value="oldest">الأقدم أولًا</option></select></label>
 {[['departmentId','القسم',options.data?.departments],['categoryId','التصنيف',options.data?.categories]].map(([name,label,records])=><label key={name}><span className="field-label">{label}</span><select name={name} className="field-input" value={filters[name]} onChange={change}><option value="">الكل</option>{records?.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>)}</div>
 {options.error&&<p role="alert">{options.error.message}</p>}<div className="mt-4 flex gap-3"><Button variant="secondary" onClick={()=>{setFilters(initial);setPage(1)}}>مسح التصفية</Button><Button variant="secondary" onClick={()=>{query.refresh(true);options.refresh(true)}}>تحديث التذاكر</Button></div></section>
 {engineersQuery.error&&<p role="alert" className="content-card mb-4 text-red-700 dark:text-red-300">تعذر تحميل المهندسين: {engineersQuery.error.message} <Button type="button" variant="secondary" onClick={()=>engineersQuery.refresh()}>إعادة المحاولة</Button></p>}
 {query.error?<p role="alert" className="content-card">{query.error.message}</p>:query.status==='loading'?<p role="status" className="content-card">جارٍ تحميل التذاكر...</p>:<><p className="my-4 text-muted">{query.data.total} تذكرة</p><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{query.data.items.map(ticket=><article key={ticket.id} className="content-card min-w-0"><p className="break-all text-xs text-muted"><bdi dir="ltr" title={ticket.reference}>{formatTicketReference(ticket)}</bdi></p><h2 className="my-3 text-lg font-bold text-ink">{ticket.title}</h2><StatusBadge status={ticket.status}/><p className="mt-3 text-muted">{ticket.reporterName} · {ticket.department}</p><p className="mt-2 text-muted">{ticket.category}</p><p className="mt-2 text-ink">المهندس: {ticket.assignedTechnician||'غير مسندة'}</p><p className="mt-2 text-muted">الإسناد بواسطة: {assignmentSource(ticket)}</p><div className="mt-4 flex flex-wrap items-center gap-3"><Link className="font-bold text-primary-600" to={'/manager/tickets/'+ticket.id}>التفاصيل</Link>{!['resolved','closed'].includes(ticket.status)&&<Button type="button" variant="secondary" disabled={engineersQuery.status!=='ready'||busy} onClick={()=>setAssignmentTicket(ticket)}>{ticket.assignedTechnicianId?'إعادة الإسناد':'إسناد لمهندس'}</Button>}</div></article>)}</div>{!query.data.items.length&&<p className="content-card">لا توجد تذاكر مطابقة.</p>}</>}
 {assignmentTicket&&<TicketAssignmentModal ticket={assignmentTicket} technicians={engineers} workloads={workloads} onClose={()=>setAssignmentTicket(null)} onSave={saveAssignment}/>}
 <nav className="mt-5 flex flex-wrap items-center gap-4" aria-label="صفحات التذاكر"><Button variant="secondary" disabled={page===1||query.status==='loading'} onClick={()=>setPage(page-1)}>السابق</Button><span className="text-muted">الصفحة {page}</span><Button variant="secondary" disabled={page*20>=(query.data?.total??0)||query.status==='loading'} onClick={()=>setPage(page+1)}>التالي</Button></nav></div>
}
