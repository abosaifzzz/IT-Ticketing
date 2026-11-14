import {useRef,useState} from 'react'
import {Link,useNavigate,useParams} from 'react-router-dom'
import {Button} from '../../components/ui/Button'
import {useApiQuery} from '../../services/http/useApiQuery'
import {simpleAssetService as service,simpleConditions,serialModes} from '../../services/assets/simpleAssetService'
import {employeeDirectoryService} from '../../services/employees/employeeDirectoryService'
import {AssetEmployeeSearch} from './AssetEmployeeSearch'
import {isQuantityLocked,updateAssetFormField,validateAssetQuantity} from '../../services/assets/assetQuantityRules'

const empty={assetTypeId:'',brand:'',model:'',serialNumber:'',quantity:1,condition:'USED',custodianType:'none',custodianId:'',notes:''}
export function TrackedAssetFormPage(){
 const{id}=useParams()
 const query=useApiQuery(id??'new-simple-asset',async signal=>{const[types,asset]=await Promise.all([service.list('types',{activeOnly:id?'false':'true',pageSize:100},signal),id?service.detail('assets',id,signal):Promise.resolve(null)]);return{types:types.items,asset}})
 if(query.status==='loading')return <p role="status" className="content-card">جارٍ تحميل النموذج...</p>
 if(query.error)return <p role="alert" className="content-card">{query.error.message} <Button onClick={()=>query.refresh()}>إعادة المحاولة</Button></p>
 return <Editor key={id??'new'} data={query.data}/>
}
function Editor({data}){
 const existing=data.asset,navigate=useNavigate(),key=useRef(crypto.randomUUID())
 const [form,setForm]=useState(existing?{...empty,...existing,custodianId:existing.custodianId??''}:empty)
 const [busy,setBusy]=useState(false),[error,setError]=useState('')
 const departments=useApiQuery('simple-asset-departments',signal=>employeeDirectoryService.departments(signal))
 const type=data.types.find(row=>row.id===form.assetTypeId)
 const mode=type?.serialMode??'DISABLED'
 const quantityLocked=isQuantityLocked(existing)
 const serialLimitsQuantity=mode==='REQUIRED'||Boolean(form.serialNumber?.trim())
 const set=(name,value)=>{key.current=crypto.randomUUID();setForm(old=>updateAssetFormField(old,name,value,data.types));setError('')}
 const save=async event=>{event.preventDefault();if(busy)return;setBusy(true);setError('');try{
   if(!type)throw new Error('اختر نوع أصل نشطًا.')
   if(form.custodianType!=='none'&&!form.custodianId)throw new Error('اختر صاحب العهدة من النتائج.')
   const serial=mode==='DISABLED'?undefined:form.serialNumber.trim()
   if(mode==='REQUIRED'&&!serial)throw new Error('الرقم المسلسل مطلوب لهذا النوع.')
   const quantity=validateAssetQuantity(form.quantity,mode,serial,existing)
   const body=existing?{assetTypeId:form.assetTypeId,brand:form.brand.trim(),model:form.model.trim(),serialNumber:serial??'',quantity,notes:form.notes,expectedVersion:existing.version}:{assetTypeId:form.assetTypeId,brand:form.brand.trim(),model:form.model.trim(),serialNumber:serial??'',quantity,condition:form.condition,custodianType:form.custodianType,custodianId:form.custodianType==='none'?null:form.custodianId,notes:form.notes}
   const item=await (existing?service.update('assets',existing.id,body,key.current):service.create('assets',body,key.current))
   navigate(`/it/assets/registry/${item.id}`,{replace:true})
 }catch(failure){setError(failure.message)}finally{setBusy(false)}}
 return <div className="mx-auto max-w-5xl"><div className="page-heading"><div><p className="eyebrow">الأصول التقنية</p><h1>{existing?'تعديل أصل':'إضافة أصل'}</h1><p>رقم الأصل ينشئه الخادم تلقائيًا، والموقع الافتراضي هو المخزن الرئيسي.</p></div><Button as={Link} variant="secondary" to="/it/assets">العودة إلى الأصول</Button></div>
 {error&&<p className="content-card mb-4 text-red-700 dark:text-red-300" role="alert">{error}</p>}
 <form className="content-card" onSubmit={save} aria-busy={busy}><fieldset disabled={busy}>
 {existing&&<p className="mb-4 text-muted">رقم الأصل: <bdi dir="ltr" className="font-bold text-ink">{existing.internalAssetId}</bdi></p>}
 <div className="form-grid"><label><span className="field-label">نوع الأصل *</span><select className="field-input" required value={form.assetTypeId} onChange={e=>set('assetTypeId',e.target.value)}><option value="">اختر النوع</option>{data.types.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
 <label><span className="field-label">الكمية *</span><input className="field-input" type="number" min="1" max={serialLimitsQuantity?1:1000000} step="1" required disabled={quantityLocked} readOnly={serialLimitsQuantity} value={form.quantity} onChange={e=>set('quantity',e.target.value)}/></label>
 <label><span className="field-label">الماركة</span><input className="field-input" maxLength={160} value={form.brand} onChange={e=>set('brand',e.target.value)}/></label>
 <label><span className="field-label">الموديل</span><input className="field-input" maxLength={160} value={form.model} onChange={e=>set('model',e.target.value)}/></label>
 {mode!=='DISABLED'&&<label><span className="field-label">الرقم المسلسل {mode==='REQUIRED'?'*':`(${serialModes[mode]})`}</span><input className="field-input" dir="ltr" maxLength={160} required={mode==='REQUIRED'} disabled={quantityLocked&&Number(form.quantity)>1} value={form.serialNumber??''} onChange={e=>set('serialNumber',e.target.value)}/></label>}
 {!existing&&<><label><span className="field-label">الحالة *</span><select className="field-input" value={form.condition} onChange={e=>set('condition',e.target.value)}>{Object.entries(simpleConditions).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><label><span className="field-label">العهدة الأولية</span><select className="field-input" value={form.custodianType} onChange={e=>set('custodianType',e.target.value)}><option value="none">غير مسند</option><option value="employee">موظف</option><option value="department">قسم</option></select></label>
 {form.custodianType==='department'&&<label><span className="field-label">القسم *</span><select className="field-input" required value={form.custodianId} onChange={e=>set('custodianId',e.target.value)}><option value="">اختر القسم</option>{departments.data?.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label>}
 {form.custodianType==='employee'&&<AssetEmployeeSearch value={form.custodianId} onChange={id=>set('custodianId',id)} required/>}</>}
 </div><p className="mt-3 text-sm text-muted">العهدة والموقع والحالة والصيانة تسري على جميع وحدات السجل. يمكن إضافة أصل بالكميات إلى مجموعة؛ يخصص الخادم وحدة واحدة عند الإسناد. الرقم المسلسل يخص وحدة واحدة فقط.</p>{quantityLocked&&<p className="mt-2 text-sm text-amber-700 dark:text-amber-300">تغيير الكمية متاح بعد إعادة العهدة وإزالة عضوية المجموعة وإنهاء الصيانة.</p>}<label className="mt-4 block"><span className="field-label">ملاحظات</span><textarea className="field-textarea" maxLength={4000} value={form.notes??''} onChange={e=>set('notes',e.target.value)}/></label><Button type="submit" className="mt-4" disabled={busy}>{busy?'جارٍ الحفظ...':'حفظ الأصل'}</Button></fieldset></form></div>
}
