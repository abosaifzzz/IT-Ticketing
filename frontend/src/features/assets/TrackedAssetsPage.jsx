import {Link,useSearchParams} from 'react-router-dom'
import {Button} from '../../components/ui/Button'
import {useApiQuery} from '../../services/http/useApiQuery'
import {simpleAssetService as service,simpleConditions,custodyLabels} from '../../services/assets/simpleAssetService'
import {useAssetPeopleOptions} from '../../services/assets/useAssetPeopleOptions'
import {AssetEmployeeSearch} from './AssetEmployeeSearch'
import {assetFilters} from './assetFilters'

export function AssetRegistryContent({onRefresh}){
 const[params,setParams]=useSearchParams(),page=Number(params.get('page'))||1,people=useAssetPeopleOptions()
 const filters=assetFilters(params)
 const query=useApiQuery(`main-assets:${params}`,signal=>service.list('assets',{...filters,page,pageSize:25},signal))
 const types=useApiQuery('main-asset-types',signal=>service.list('types',{activeOnly:false,pageSize:100},signal))
 const change=(key,value)=>{const next=new URLSearchParams(params);if(value)next.set(key,value);else next.delete(key);next.delete('page');if(key==='custodianType'){next.delete('employeeId');next.delete('departmentId')}setParams(next)}
 const pageTo=value=>{const next=new URLSearchParams(params);next.set('page',String(value));setParams(next)}
 const refresh=()=>{query.refresh();types.refresh();onRefresh?.()}
 const custodian=row=>row.custodianType==='none'?'غير مسند':row.custodianName||row.employeeName||row.departmentName||custodyLabels[row.custodianType]||'—'
 return <div id="asset-registry" className="mt-6">
  <section className="content-card mb-4" aria-label="البحث وتصفية الأصول"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
   <label><span className="field-label">بحث بالاسم أو رقم الأصل</span><input className="field-input" value={filters.search} onChange={e=>change('search',e.target.value)} placeholder="اسم الأصل أو صاحبه أو رقمه"/></label>
   <label><span className="field-label">نوع الأصل</span><select className="field-input" value={filters.assetTypeId} onChange={e=>change('assetTypeId',e.target.value)}><option value="">كل الأنواع</option>{types.data?.items.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
   <label><span className="field-label">الحالة</span><select className="field-input" value={filters.condition} onChange={e=>change('condition',e.target.value)}><option value="">كل الحالات</option>{Object.entries(simpleConditions).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
   <label><span className="field-label">نوع العهدة</span><select className="field-input" value={filters.custodianType} onChange={e=>change('custodianType',e.target.value)}><option value="">كل العهد</option>{Object.entries(custodyLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
   {filters.custodianType==='employee'&&<AssetEmployeeSearch value={filters.employeeId} onChange={id=>change('employeeId',id)} label="الموظف"/>}
   {filters.custodianType==='department'&&<label><span className="field-label">القسم</span><select className="field-input" value={filters.departmentId} onChange={e=>change('departmentId',e.target.value)}><option value="">كل الأقسام</option>{people.departments.data?.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label>}
  </div><div className="mt-4 flex flex-wrap gap-2"><Button variant="secondary" onClick={()=>setParams(new URLSearchParams())}>مسح الفلاتر</Button><Button variant="secondary" onClick={refresh}>تحديث</Button></div>{types.error&&<p role="alert" className="mt-3 text-red-700 dark:text-red-300">{types.error.message}</p>}</section>
  {query.error?<p className="content-card" role="alert">{query.error.message} <Button onClick={refresh}>إعادة المحاولة</Button></p>:query.status==='loading'?<p className="content-card" role="status">جارٍ تحميل الأصول...</p>:<><p className="mb-3 text-sm text-muted">{query.data.total} سجل مطابق</p>{query.data.items.length?<><div className="table-wrap hidden md:block"><table className="data-table"><thead><tr><th>رقم الأصل</th><th>النوع</th><th>الكمية</th><th>الماركة والموديل</th><th>المسلسل</th><th>الحالة</th><th>العهدة</th><th>إجراء</th></tr></thead><tbody>{query.data.items.map(row=><tr key={row.id}><td><bdi dir="ltr">{row.internalAssetId}</bdi></td><td>{row.assetTypeName}</td><td>{row.quantity}</td><td>{row.brand} {row.model}</td><td><bdi dir="ltr">{row.serialNumber||'—'}</bdi></td><td>{simpleConditions[row.condition]??row.condition}</td><td>{custodian(row)}</td><td><Link className="text-primary-600" to={`/it/assets/registry/${row.id}`}>التفاصيل</Link></td></tr>)}</tbody></table></div><div className="grid gap-3 md:hidden">{query.data.items.map(row=><Link key={row.id} to={`/it/assets/registry/${row.id}`} className="content-card"><bdi className="font-bold text-primary-600" dir="ltr">{row.internalAssetId}</bdi><strong className="mt-2 block text-ink">{row.assetTypeName} · {row.brand} {row.model}</strong><span className="mt-2 block text-sm text-muted">الكمية: {row.quantity} · {simpleConditions[row.condition]??row.condition}</span><span className="mt-1 block text-sm text-muted">العهدة: {custodian(row)}</span></Link>)}</div></>:<p className="content-card text-muted">لا توجد أصول مطابقة.</p>}</>}
  <nav className="mt-4 flex gap-3" aria-label="صفحات الأصول"><Button variant="secondary" disabled={page<=1} onClick={()=>pageTo(page-1)}>السابق</Button><span className="self-center text-muted">صفحة {page}</span><Button variant="secondary" disabled={page*25>=(query.data?.total??0)} onClick={()=>pageTo(page+1)}>التالي</Button></nav>
 </div>
}
