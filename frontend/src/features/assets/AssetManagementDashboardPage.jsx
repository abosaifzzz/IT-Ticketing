import { Link, useSearchParams } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { useApiQuery } from '../../services/http/useApiQuery'
import { simpleAssetService as service } from '../../services/assets/simpleAssetService'
import { AssetRegistryContent } from './TrackedAssetsPage'
import { assetFilters } from './assetFilters'

const metrics = [
  ['إجمالي الوحدات', 'totalUnits'],
  ['بعهدة موظفين', 'employeeCustody'],
  ['بعهدة أقسام', 'departmentCustody'],
  ['غير مسندة', 'unassigned'],
  ['معطلة', 'faulty'],
  ['قيد الصيانة', 'inMaintenance'],
]

export function AssetManagementDashboardPage() {
  const [params, setParams] = useSearchParams(), filters = assetFilters(params)
  const query = useApiQuery(`main-asset-dashboard:${new URLSearchParams(filters)}`, signal => service.dashboard(filters, signal))
  const openMetric = key => { const next = new URLSearchParams(); if (key === 'employeeCustody') next.set('custodianType', 'employee'); if (key === 'departmentCustody') next.set('custodianType', 'department'); if (key === 'unassigned') next.set('custodianType', 'none'); if (key === 'inMaintenance') next.set('condition', 'IN_MAINTENANCE'); setParams(next); document.getElementById('asset-registry')?.scrollIntoView({ behavior: 'smooth' }) }
  return <div className="mx-auto max-w-[1400px]">
    <div className="page-heading"><div><p className="eyebrow">الأصول التقنية</p><h1>إدارة الأصول</h1></div><div className="flex flex-wrap gap-2"><Button as={Link} to="/it/assets/registry/new">إضافة أصل</Button><Button as={Link} to="/it/assets/types" variant="secondary">أنواع الأصول</Button><Button as={Link} to="/it/assets/groups" variant="secondary">مجموعات الأصول</Button></div></div>
    {query.error ? <p className="content-card" role="alert">{query.error.message} <Button onClick={() => query.refresh()}>إعادة المحاولة</Button></p> : query.status === 'loading' ? <p className="content-card" role="status">جارٍ تحميل الإحصاءات...</p> : <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="ملخص الأصول">{metrics.map(([label, key]) => key === 'faulty' ? <article key={key} className="metric-card" title="يشمل المعطل وخارج الخدمة"><strong>{query.data[key]}</strong><span>{label}</span></article> : <button key={key} type="button" className="metric-card text-right focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600" onClick={() => openMetric(key)} aria-label={`عرض ${label} في سجل الأصول`}><strong>{query.data[key]}</strong><span>{label}</span></button>)}</section>}
    <AssetRegistryContent onRefresh={() => query.refresh()} />
  </div>
}
