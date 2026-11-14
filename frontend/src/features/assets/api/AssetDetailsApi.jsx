import{useState}from'react'
import{Link,useParams}from'react-router-dom'
import{Button}from'../../../components/ui/Button'
import{useAuth}from'../../auth/useAuth'
import{assetService as service}from'../../../services/assets/assetService'
import{assetStatusLabels}from'../../../services/assets/assetApi'
import{useApiQuery}from'../../../services/http/useApiQuery'
import{useEngineerRefresh}from'../../engineer/api/useEngineerRefresh'
const date=new Intl.DateTimeFormat('ar-EG',{dateStyle:'medium',timeStyle:'short'})
const labels={created:'إنشاء الأصل',updated:'تعديل الأصل',archived:'أرشفة الأصل',withdrawn:'سحب وحدة',stock_decremented:'خصم وحدة من المخزون'}
const fieldLabels={name:'اسم الأصل',quantity:'الكمية',manufacturer:'الشركة المصنعة',model:'الموديل',serialNumber:'الرقم المسلسل',holdingType:'نوع العهدة',department:'القسم',departmentId:'معرف القسم',location:'الموقع',purchaseDate:'تاريخ الشراء',operationalStatus:'الحالة التشغيلية',conditionDescription:'وصف الحالة',maintenanceNotes:'ملاحظات الصيانة',lastMaintenanceDate:'آخر صيانة'}
const value=(field,input)=>field==='operationalStatus'?assetStatusLabels[input]??input:field==='holdingType'?input==='it_storage'?'مخزن تكنولوجيا المعلومات':'عهدة قسم':input??'—'
export function AssetDetailsApi(){
 const{id}=useParams(),{user}=useAuth(),[page,setPage]=useState(1)
 const query=useApiQuery(id,signal=>service.details(id,signal)),tickets=useApiQuery(JSON.stringify([id,page]),signal=>service.relatedTickets(id,page,signal))
 useEngineerRefresh(query.refresh,false);useEngineerRefresh(tickets.refresh,false)
 if(query.error)return <section className="content-card"><p role="alert">{query.error.message}</p><Button onClick={()=>query.refresh()}>إعادة المحاولة</Button></section>
 if(query.status==='loading')return <p className="content-card" role="status">جارٍ تحميل الأصل...</p>
 const asset=query.data
return <div className="mx-auto max-w-6xl [overflow-wrap:anywhere]"><div className="page-heading"><div><p className="eyebrow">{asset.assetId}</p><h1>{asset.name}</h1><p>{asset.manufacturer} · {asset.model}</p></div><div className="flex flex-wrap gap-3"><Button as={Link} to="/it/assets" variant="secondary">العودة للأصول</Button>{!asset.archivedAt&&<Button as={Link} to={'/it/assets/'+asset.assetId+'/edit'}>تعديل الأصل</Button>}</div></div>
 <Button variant="secondary" onClick={()=>{query.refresh(true);tickets.refresh(true)}}>تحديث الأصل</Button>{asset.archivedAt&&<p className="content-card mt-4">هذا الأصل مؤرشف؛ بياناته وتاريخه محفوظان.</p>}
 <section className="content-card mt-5"><dl className="grid gap-5 sm:grid-cols-2">{Object.entries(fieldLabels).filter(([field])=>field!=='departmentId').map(([field,label])=><div key={field}><dt className="text-muted">{label}</dt><dd className="mt-2 whitespace-pre-wrap font-bold text-ink">{value(field,asset[field])||'—'}</dd></div>)}</dl></section>
 {asset.withdrawnForTicketId&&<section className="content-card mt-5"><h2 className="font-bold text-ink">بيانات سحب الوحدة</h2><p className="mt-3 text-ink">سحبه المهندس: {asset.takenByEngineerName}</p><p className="mt-2 text-muted">التذكرة: {asset.withdrawnForTicketId}</p><p className="mt-2 text-muted">وقت السحب: {date.format(new Date(asset.withdrawnAt))}</p>{asset.sourceAssetId&&asset.sourceAssetId!==asset.assetId&&<Link className="mt-3 block text-primary-600" to={'/it/assets/'+asset.sourceAssetId}>سجل المخزون المصدر: {asset.sourceAssetId}</Link>}</section>}
 <section className="content-card mt-5"><h2 className="font-bold text-ink">سجل التغييرات</h2>{[...(asset.history??[])].reverse().map(event=><article className="mt-4 rounded-xl bg-canvas p-4" key={event.id}><strong className="text-ink">{labels[event.type]??'تحديث سجل الأصل'} · {event.actorName}</strong><time className="mt-2 block text-sm text-muted">{date.format(new Date(event.timestamp))}</time>{event.data?.changes?.map(change=><p key={change.field} className="mt-2 text-muted">{fieldLabels[change.field]??'بيانات الأصل'}: {String(value(change.field,change.previousValue))} ← {String(value(change.field,change.nextValue))}</p>)}{event.data?.ticketId&&<p className="mt-2 text-muted">التذكرة: {event.data.ticketId}</p>}{event.data?.withdrawnAssetId&&<Link className="mt-2 block text-primary-600" to={'/it/assets/'+event.data.withdrawnAssetId}>الوحدة المسحوبة: {event.data.withdrawnAssetId}</Link>}</article>)}</section>
 <section className="content-card mt-5"><h2 className="font-bold text-ink">التذاكر المرتبطة المتاحة لحسابك</h2>{tickets.error?<p role="alert">{tickets.error.message}</p>:tickets.status==='loading'?<p role="status">جارٍ التحميل...</p>:<>{tickets.data.items.map(ticket=><Link className="mt-4 block font-bold text-primary-600" key={ticket.id} to={'/'+user.role+'/tickets/'+ticket.id}>{ticket.title}</Link>)}{!tickets.data.items.length&&<p className="mt-4 text-muted">لا توجد تذاكر مرتبطة متاحة.</p>}</>}<nav className="mt-4 flex gap-3"><Button variant="secondary" disabled={page===1} onClick={()=>setPage(page-1)}>السابق</Button><Button variant="secondary" disabled={page*10>=(tickets.data?.total??0)} onClick={()=>setPage(page+1)}>التالي</Button></nav></section></div>
}
