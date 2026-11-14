import{authMode}from'../../services/auth/mode'
import{AssetInventoryApi}from'./api/AssetInventoryApi'
import { ArchiveX, Boxes, CircleCheck, Download, PackageOpen, Search, Wrench } from 'lucide-react'
import { useEffect, useReducer, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { appEvents, EVENT_NAMES } from '../../services/events/eventBus'
import { mockAssetInventoryService, operationalStatusLabels } from '../../services/mock/mockAssetInventoryService'
import { mockDepartmentService } from '../../services/mock/mockDepartmentService'
import { assetExportService } from '../../services/reports/assetExportService'

const initialFilters = { search: '', department: 'all', operationalStatus: 'all' }
const statusStyles = { working: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-200', needs_maintenance: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-200', out_of_service: 'bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-200', under_repair: 'bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-200', retired: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200', withdrawn: 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-200' }

function MockAssetInventoryPage() {
  const [filters, setFilters] = useState(initialFilters)
  const [, refresh] = useReducer((value) => value + 1, 0)
  useEffect(() => appEvents.subscribe(EVENT_NAMES.ASSETS_CHANGED, refresh), [])
  const assets = mockAssetInventoryService.query(filters)
  const statistics = mockAssetInventoryService.getStatistics()
  const departments = mockDepartmentService.getAll()
  const updateFilter = ({ target }) => setFilters((current) => ({ ...current, [target.name]: target.value }))

  return <div className="mx-auto max-w-[1500px]">
    <div className="page-heading"><div><p className="eyebrow">الأجهزة والمعدات التقنية</p><h1>سجل الأصول التقنية</h1><p>سجل الأجهزة والملحقات المستخدمة أو الاحتياطية مع كمياتها وحالتها التشغيلية.</p></div><div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" onClick={() => assetExportService.downloadExcel(filters)}><Download size={18} />تصدير Excel</Button><Button as={Link} to="/it/assets/new">إضافة أصل جديد</Button></div></div>
    <section className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5" aria-label="إحصاءات الأصول">
      <article className="metric-card"><Boxes size={22} className="mb-3 text-primary-600" /><strong>{statistics.total}</strong><span>إجمالي الوحدات</span></article>
      <article className="metric-card"><CircleCheck size={22} className="mb-3 text-emerald-600" /><strong>{statistics.working}</strong><span>تعمل</span></article>
      <article className="metric-card"><Wrench size={22} className="mb-3 text-amber-600" /><strong>{statistics.needs_maintenance + statistics.under_repair}</strong><span>تحتاج متابعة</span></article>
      <article className="metric-card"><ArchiveX size={22} className="mb-3 text-red-600" /><strong>{statistics.out_of_service + statistics.retired}</strong><span>خارج الخدمة أو مستبعدة</span></article>
      <article className="metric-card"><PackageOpen size={22} className="mb-3 text-primary-600" /><strong>{statistics.withdrawn}</strong><span>تم سحبها</span></article>
    </section>
    <section className="content-card mb-6" aria-label="البحث وتصفية الأصول"><div className="flex items-center justify-between gap-3"><h2 className="flex items-center gap-2 text-lg font-extrabold text-ink"><Search size={19} className="text-primary-600" />البحث والتصفية</h2><span className="text-sm font-bold text-muted">{statistics.recordCount} سجل</span></div><div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <label><span className="field-label">البحث</span><input name="search" value={filters.search} onChange={updateFilter} className="field-input" placeholder="الرقم، الاسم، الموديل أو المسلسل" /></label>
      <label><span className="field-label">القسم</span><select name="department" value={filters.department} onChange={updateFilter} className="field-input"><option value="all">كل الأقسام</option>{departments.map((department) => <option key={department.id} value={department.name}>{department.name}</option>)}</select></label>
      <label><span className="field-label">الحالة التشغيلية</span><select name="operationalStatus" value={filters.operationalStatus} onChange={updateFilter} className="field-input"><option value="all">كل الحالات</option>{Object.entries(operationalStatusLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
    </div><Button type="button" variant="secondary" className="mt-4" onClick={() => setFilters(initialFilters)}>مسح التصفية</Button></section>

    {assets.length === 0 ? <div className="content-card py-12 text-center"><Boxes className="mx-auto text-muted" size={38} /><h2 className="mt-4 text-lg font-extrabold text-ink">لا توجد أصول مطابقة</h2><p className="mt-2 text-sm text-muted">غيّر عوامل البحث أو أضف أصلًا جديدًا.</p></div> : <>
      <div className="table-wrap hidden lg:block"><table className="data-table min-w-[1150px]"><thead><tr><th>رقم الأصل</th><th>الاسم</th><th>الشركة والموديل</th><th>القسم والموقع</th><th>الحالة</th><th>الكمية</th><th>الإجراءات</th></tr></thead><tbody>{assets.map((asset) => <tr key={asset.assetId}><td className="!text-primary-600">{asset.assetId}</td><td><strong className="text-ink">{asset.name}</strong></td><td>{asset.manufacturer} {asset.model}<span className="mt-1 block text-xs">{asset.serialNumber || 'بلا رقم مسلسل'}</span></td><td>{asset.department}<span className="mt-1 block text-xs">{asset.location}</span></td><td><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${statusStyles[asset.operationalStatus]}`}>{operationalStatusLabels[asset.operationalStatus]}</span>{asset.takenByEngineerName && <span className="mt-1 block text-xs text-muted">سحبها: {asset.takenByEngineerName}</span>}</td><td>{asset.quantity}</td><td><div className="flex gap-3"><Link to={`/it/assets/${asset.assetId}`} className="font-bold text-primary-600">عرض</Link><Link to={`/it/assets/${asset.assetId}/edit`} className="font-bold text-primary-600">تعديل</Link></div></td></tr>)}</tbody></table></div>
      <div className="grid gap-4 sm:grid-cols-2 lg:hidden">{assets.map((asset) => <article key={asset.assetId} className="content-card"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-extrabold text-primary-600">{asset.assetId}</p><h2 className="mt-1 font-extrabold text-ink">{asset.name}</h2><p className="mt-1 text-xs text-muted">{asset.manufacturer} {asset.model}</p></div><span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${statusStyles[asset.operationalStatus]}`}>{operationalStatusLabels[asset.operationalStatus]}</span></div><dl className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-muted">القسم</dt><dd className="mt-1 font-bold text-ink">{asset.department}</dd></div><div><dt className="text-muted">الموقع</dt><dd className="mt-1 font-bold text-ink">{asset.location}</dd></div></dl><p className="mt-4 text-sm font-extrabold text-primary-600">الكمية: {asset.quantity}</p>{asset.takenByEngineerName && <p className="mt-1 text-sm text-muted">سحبها: {asset.takenByEngineerName}</p>}<div className="mt-5 flex gap-2 border-t border-border pt-4"><Button as={Link} to={`/it/assets/${asset.assetId}`}>عرض التفاصيل</Button><Button as={Link} to={`/it/assets/${asset.assetId}/edit`} variant="secondary">تعديل</Button></div></article>)}</div>
    </>}
  </div>
}

export function AssetInventoryPage(){return authMode==='api'?<AssetInventoryApi/>:<MockAssetInventoryPage/>}
