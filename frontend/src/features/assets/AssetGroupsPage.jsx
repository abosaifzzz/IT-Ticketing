import {useRef,useState} from 'react'
import {Link,useNavigate,useSearchParams} from 'react-router-dom'
import {Button} from '../../components/ui/Button'
import {useApiQuery} from '../../services/http/useApiQuery'
import {simpleAssetService as service,custodyLabels} from '../../services/assets/simpleAssetService'

export function AssetGroupsPage(){
 const[params,setParams]=useSearchParams(),navigate=useNavigate(),[name,setName]=useState(''),[description,setDescription]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),key=useRef(crypto.randomUUID())
 const search=params.get('search')??'',page=Number(params.get('page'))||1
 const query=useApiQuery(params.toString(),signal=>service.list('groups',{search,page,pageSize:25},signal))
 const change=(field,value)=>{const next=new URLSearchParams(params);if(value)next.set(field,value);else next.delete(field);if(field!=='page')next.delete('page');setParams(next)}
 const create=async event=>{event.preventDefault();if(busy)return;setBusy(true);setError('');try{const item=await service.create('groups',{name:name.trim(),description:description.trim()},key.current);navigate(`/it/assets/groups/${item.id}`)}catch(failure){setError(failure.message)}finally{setBusy(false)}}
 return <div className="mx-auto max-w-6xl"><div className="page-heading"><div><p className="eyebrow">الأصول التقنية</p><h1>مجموعات الأصول</h1><p>اربط أجهزة فردية أو مكونات من سجلات الكميات؛ يخصص الخادم وحدة لكل مكون عند الإسناد.</p></div><Button as={Link} variant="secondary" to="/it/assets">العودة إلى الأصول</Button></div>
 <form className="content-card mb-4" onSubmit={create}><h2 className="mb-3 font-bold text-ink">مجموعة جديدة</h2><div className="form-grid"><label><span className="field-label">اسم المجموعة *</span><input className="field-input" required maxLength={160} value={name} onChange={e=>{setName(e.target.value);key.current=crypto.randomUUID()}}/></label><label><span className="field-label">وصف اختياري</span><input className="field-input" maxLength={4000} value={description} onChange={e=>{setDescription(e.target.value);key.current=crypto.randomUUID()}}/></label></div><Button className="mt-3" type="submit" disabled={busy}>{busy?'جارٍ الحفظ...':'إنشاء مجموعة'}</Button></form>
 {error&&<p role="alert" className="content-card mb-4 text-red-700 dark:text-red-300">{error}</p>}
 <label className="mb-4 block"><span className="field-label">بحث عن مجموعة</span><input className="field-input" value={search} onChange={e=>change('search',e.target.value)}/></label>
 {query.error?<p className="content-card" role="alert">{query.error.message} <Button onClick={()=>query.refresh()}>إعادة المحاولة</Button></p>:query.status==='loading'?<p className="content-card" role="status">جارٍ تحميل المجموعات...</p>:query.data.items.length?<div className="grid gap-3 sm:grid-cols-2">{query.data.items.map(row=><Link to={row.id} key={row.id} className="content-card"><h2 className="font-bold text-ink">{row.name}</h2><p className="mt-1 text-sm text-muted">{row.description||'لا يوجد وصف'}</p><p className="mt-2 text-sm text-primary-600">{custodyLabels[row.custodianType]}</p></Link>)}</div>:<p className="content-card text-muted">لا توجد مجموعات مطابقة.</p>}
 <nav className="mt-4 flex gap-3"><Button variant="secondary" disabled={page<=1} onClick={()=>change('page',page-1)}>السابق</Button><span className="self-center text-muted">صفحة {page}</span><Button variant="secondary" disabled={page*25>=(query.data?.total??0)} onClick={()=>change('page',page+1)}>التالي</Button></nav></div>
}
