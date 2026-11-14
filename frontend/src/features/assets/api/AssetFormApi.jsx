import{useRef,useState}from'react'
import{Link,useNavigate,useParams}from'react-router-dom'
import{Button}from'../../../components/ui/Button'
import{assetService as service}from'../../../services/assets/assetService'
import{assetStatusLabels}from'../../../services/assets/assetApi'
import{useApiQuery}from'../../../services/http/useApiQuery'
import{createAssetDraftId}from'../../../services/assets/assetId'
const initial={assetId:'',name:'',quantity:1,manufacturer:'',model:'',serialNumber:'',holdingType:'department',departmentId:'',location:'',purchaseDate:'',operationalStatus:'working',conditionDescription:'',maintenanceNotes:'',lastMaintenanceDate:''}
export function AssetFormApi(){
 const{id}=useParams()
 const query=useApiQuery(id??'new-asset',async signal=>{const[departments,asset]=await Promise.all([service.departments(signal),id?service.details(id,signal):Promise.resolve(null)]);return{departments:departments.items,asset}})
 if(query.error)return <section className="content-card"><p role="alert">{query.error.message}</p><Button onClick={()=>query.refresh()}>إعادة المحاولة</Button></section>
 if(query.status==='loading')return <p role="status" className="content-card">جارٍ تحميل بيانات الأصل...</p>
 return <AssetEditor key={(id??'new')+':'+(query.data.asset?.version??0)} data={query.data} refresh={query.refresh}/>
}
function AssetEditor({data,refresh}){
 const existing=data.asset,navigate=useNavigate()
 const[form,setForm]=useState(()=>existing?{...initial,...existing,departmentId:existing.departmentId??'',purchaseDate:existing.purchaseDate??'',lastMaintenanceDate:existing.lastMaintenanceDate??''}:{...initial,assetId:createAssetDraftId()})
 const[busy,setBusy]=useState(false),[error,setError]=useState(''),[conflict,setConflict]=useState(false),lock=useRef(false)
 const withdrawn=existing?.operationalStatus==='withdrawn'
 const change=({target})=>setForm(old=>({...old,[target.name]:target.value,...(target.name==='holdingType'?{departmentId:''}:{})}))
 const save=async event=>{event.preventDefault();if(lock.current||conflict)return;lock.current=true;setBusy(true);setError('');try{const asset=await service.save(form,existing);navigate('/it/assets/'+encodeURIComponent(asset.assetId),{replace:true})}catch(failure){setError(failure.message);if(failure.status===409)setConflict(true)}finally{lock.current=false;setBusy(false)}}
 if(existing?.archivedAt)return <section className="content-card"><h1 className="font-bold text-ink">الأصل مؤرشف وغير متاح للتعديل</h1><Link className="mt-4 block text-primary-600" to={'/it/assets/'+existing.assetId}>تفاصيل الأصل</Link></section>
 const departments=[...data.departments]
 if(existing?.departmentId&&!departments.some(item=>item.id===existing.departmentId))departments.push({id:existing.departmentId,name:existing.department+' — محفوظ تاريخيًا'})
 return <div className="mx-auto max-w-5xl"><div className="page-heading"><h1>{existing?'تعديل الأصل':'إضافة أصل تقني'}</h1><Button as={Link} variant="secondary" to={existing?'/it/assets/'+existing.assetId:'/it/assets'}>رجوع</Button></div>{error&&<p role="alert" className="content-card mb-4">{error}</p>}{conflict&&<section className="content-card mb-4"><p className="mb-3 text-muted">تغير السجل على الخادم. أعد تحميله قبل تعديل جديد؛ ستُستبدل المسودة بالبيانات الحالية.</p><Button onClick={()=>refresh()}>إعادة تحميل الأصل</Button></section>}
 <form className="content-card" onSubmit={save} aria-busy={busy}><fieldset disabled={busy||conflict}><div className="form-grid">
 {[['assetId','رقم الأصل',40],['name','اسم الأصل',160],['manufacturer','الشركة المصنعة',160],['model','الموديل',160],['serialNumber','الرقم المسلسل',160],['location','الموقع الفعلي',200]].map(([name,label,max])=><label key={name}><span className="field-label">{label}{name!=='serialNumber'?' *':''}</span><input className="field-input" name={name} value={form[name]} onChange={change} maxLength={max} readOnly={name==='assetId'} required={name!=='serialNumber'} {...(name==='assetId'?{pattern:'[A-Za-z0-9][A-Za-z0-9._-]{2,39}'}:{})}/>{name==='assetId'&&<span className="mt-1 block text-xs text-muted">يُنشأ الرقم تلقائيًا ولا يمكن تعديله. تخصيص الرقم على الخادم ضمن تحديث الواجهة البرمجية القادم.</span>}</label>)}
 <label><span className="field-label">الكمية *</span><input type="number" name="quantity" min="1" max="1000000" step="1" className="field-input" disabled={withdrawn} value={form.quantity} onChange={change} required/></label>
 <label><span className="field-label">نوع العهدة *</span><select className="field-input" name="holdingType" value={form.holdingType} onChange={change}><option value="department">عهدة قسم</option><option value="it_storage">مخزن تكنولوجيا المعلومات</option></select></label>
 <label><span className="field-label">القسم *</span><select name="departmentId" className="field-input" value={form.departmentId} disabled={form.holdingType==='it_storage'} required={form.holdingType==='department'} onChange={change}><option value="">اختر القسم</option>{departments.map(item=><option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
 <label><span className="field-label">الحالة التشغيلية *</span><select name="operationalStatus" className="field-input" value={form.operationalStatus} disabled={withdrawn} onChange={change}>{Object.entries(assetStatusLabels).filter(([value])=>value!=='withdrawn'||withdrawn).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label>
 {[['purchaseDate','تاريخ الشراء'],['lastMaintenanceDate','تاريخ آخر صيانة']].map(([name,label])=><label key={name}><span className="field-label">{label}</span><input type="date" className="field-input" name={name} value={form[name]} onChange={change}/></label>)}</div>
 <div className="mt-5 grid gap-5 md:grid-cols-2">{[['conditionDescription','وصف الحالة *'],['maintenanceNotes','ملاحظات الصيانة']].map(([name,label])=><label key={name}><span className="field-label">{label}</span><textarea className="field-textarea" name={name} value={form[name]} onChange={change} required={name==='conditionDescription'} maxLength={4000}/></label>)}</div>{withdrawn&&<p className="mt-4 text-muted">كمية وحالة الوحدة المسحوبة محفوظتان ولا تتغيران هنا.</p>}<Button type="submit" className="mt-5" disabled={busy||conflict}>{busy?'جارٍ الحفظ...':'حفظ الأصل'}</Button></fieldset></form></div>
}
