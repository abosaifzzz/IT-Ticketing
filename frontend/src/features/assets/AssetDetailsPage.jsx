import{authMode}from'../../services/auth/mode'
import{AssetDetailsApi}from'./api/AssetDetailsApi'
import { ArrowRight, CalendarClock, Pencil, Ticket } from 'lucide-react'
import { useEffect, useReducer } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { appEvents, EVENT_NAMES } from '../../services/events/eventBus'
import { mockAssetInventoryService, operationalStatusLabels } from '../../services/mock/mockAssetInventoryService'
import { mockTicketService } from '../../services/mock/mockTicketService'
import { useAuth } from '../auth/useAuth'

const dateFormatter = new Intl.DateTimeFormat('ar-EG', { day: 'numeric', month: 'long', year: 'numeric' })
const dateTimeFormatter = new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium', timeStyle: 'short' })
const formatDate = (value) => value ? dateFormatter.format(new Date(`${value}T00:00:00`)) : 'غير مسجل'
const fieldLabels = { name: 'اسم الأصل', quantity: 'الكمية', manufacturer: 'الشركة المصنعة', model: 'الموديل', serialNumber: 'الرقم المسلسل', department: 'القسم', location: 'الموقع', purchaseDate: 'تاريخ الشراء', operationalStatus: 'الحالة التشغيلية', conditionDescription: 'وصف الحالة', maintenanceNotes: 'ملاحظات الصيانة', lastMaintenanceDate: 'آخر صيانة' }
const displayValue = (field, value) => field === 'operationalStatus' ? operationalStatusLabels[value] : (value ?? 'غير مسجل')

function MockAssetDetailsPage() {
  const { id } = useParams(); const { user } = useAuth(); const [, refresh] = useReducer((value) => value + 1, 0)
  useEffect(() => appEvents.subscribe(EVENT_NAMES.ASSETS_CHANGED, refresh), [])
  const asset = mockAssetInventoryService.getById(id)
  if (!asset) return <div className="content-card mx-auto max-w-2xl py-12 text-center"><h1 className="text-xl font-extrabold text-ink">لم يتم العثور على الأصل</h1><Button as={Link} to="/it/assets" className="mt-5">العودة إلى الأصول</Button></div>
  const relatedTickets = mockTicketService.getByRelatedAssetId(asset.assetId).filter((ticketItem) => user.role === 'manager' || ticketItem.assignedTechnicianId === user.id)

  return <div className="mx-auto max-w-6xl">
<div className="page-heading"><div><p className="eyebrow">{asset.assetId}</p><h1>{asset.name}</h1><p>{asset.manufacturer} {asset.model}</p></div><div className="flex flex-wrap gap-2"><Button as={Link} to="/it/assets" variant="secondary"><ArrowRight size={18} />العودة</Button>{!asset.archivedAt && <Button as={Link} to={`/it/assets/${asset.assetId}/edit`}><Pencil size={18} />تعديل</Button>}</div></div>
    {asset.archivedAt && <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">هذا الأصل مؤرشف. تظهر بياناته وسجله التاريخي للرجوع إليهما فقط.</div>}
    <div className="grid gap-6 lg:grid-cols-[1.4fr_0.6fr]">
      <section className="content-card"><h2 className="text-lg font-extrabold text-ink">بيانات الأصل</h2><dl className="mt-5 grid gap-5 sm:grid-cols-2"><Info label="رقم الأصل" value={asset.assetId} /><Info label="الكمية" value={asset.quantity} /><Info label="الحالة التشغيلية" value={operationalStatusLabels[asset.operationalStatus]} />{asset.withdrawnForTicketId && <><Info label="المهندس الذي سحب الأصل" value={asset.takenByEngineerName} /><Info label="رقم البلاغ المرتبط" value={asset.withdrawnForTicketId} /><Info label="وقت السحب" value={dateTimeFormatter.format(new Date(asset.withdrawnAt))} /></>}<Info label="الشركة المصنعة" value={asset.manufacturer} /><Info label="الموديل" value={asset.model} /><Info label="الرقم المسلسل" value={asset.serialNumber || 'غير مسجل'} /><Info label="القسم" value={asset.department} /><Info label="الموقع الفعلي" value={asset.location} /><Info label="تاريخ الشراء" value={formatDate(asset.purchaseDate)} /><Info label="آخر صيانة" value={formatDate(asset.lastMaintenanceDate)} /></dl><div className="mt-5 grid gap-5 border-t border-border pt-5 sm:grid-cols-2"><Info label="وصف الحالة" value={asset.conditionDescription} /><Info label="ملاحظات الصيانة" value={asset.maintenanceNotes || 'لا توجد ملاحظات'} /></div></section>
      <aside className="content-card"><h2 className="text-lg font-extrabold text-ink">ملخص السجل</h2><p className="mt-5 text-3xl font-extrabold text-primary-600">{asset.quantity}</p><p className="mt-1 text-sm text-muted">وحدة مسجلة بهذا السجل</p><div className="mt-5 border-t border-border pt-5"><p className="text-xs font-bold text-muted">آخر تحديث</p><p className="mt-1 font-bold text-ink">{dateTimeFormatter.format(new Date(asset.updatedAt))}</p></div></aside>
    </div>
    <section className="content-card mt-6"><h2 className="flex items-center gap-2 text-lg font-extrabold text-ink"><Ticket size={20} className="text-primary-600" />بلاغات الدعم المرتبطة</h2>{relatedTickets.length === 0 ? <Empty icon={Ticket} title="لا توجد بلاغات مرتبطة" text="القسم مهيأ لإظهار بلاغات الدعم عند ربطها بهذا الأصل مستقبلًا." /> : <div className="mt-5 grid gap-3 sm:grid-cols-2">{relatedTickets.map((ticketItem) => <Link key={ticketItem.id} to={user.role === 'manager' ? `/manager/tickets/${ticketItem.id}` : `/technician/tickets/${ticketItem.id}`} className="rounded-xl border border-border bg-canvas p-4 transition hover:border-primary-300"><p className="text-xs font-bold text-primary-600">{ticketItem.id}</p><h3 className="mt-1 font-extrabold text-ink">{ticketItem.title}</h3></Link>)}</div>}</section>
    <section className="content-card mt-6"><h2 className="flex items-center gap-2 text-lg font-extrabold text-ink"><CalendarClock size={20} className="text-primary-600" />سجل تغييرات الأصل</h2><div className="mt-5 space-y-4">{[...asset.history].reverse().map((entry, index) => <article key={`${entry.timestamp}-${index}`} className="border-r-2 border-primary-200 pr-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-extrabold text-ink">{entry.type === 'created' ? 'تم إنشاء سجل الأصل' : entry.type === 'archived' ? 'تمت أرشفة الأصل' : entry.type === 'withdrawn' ? 'تم سحب وحدة للبلاغ' : 'تم تحديث بيانات الأصل'}</h3><time className="text-xs text-muted">{dateTimeFormatter.format(new Date(entry.timestamp))}</time></div><p className="mt-1 text-xs text-muted">بواسطة {entry.actorName}</p>{entry.note && <p className="mt-1 text-sm text-muted">{entry.note}</p>}{entry.changes.length > 0 && <ul className="mt-3 space-y-1 text-sm text-muted">{entry.changes.filter((change) => fieldLabels[change.field]).map((change) => <li key={change.field}><strong className="text-ink">{fieldLabels[change.field]}:</strong> {displayValue(change.field, change.previousValue)} ← {displayValue(change.field, change.nextValue)}</li>)}</ul>}</article>)}</div></section>
  </div>
}

function Info({ label, value }) { return <div><dt className="text-xs font-bold text-muted">{label}</dt><dd className="mt-1 leading-7 font-bold text-ink">{value}</dd></div> }
function Empty({ icon: Icon, title, text }) { return <div className="py-9 text-center"><Icon size={32} className="mx-auto text-muted" /><h3 className="mt-3 font-extrabold text-ink">{title}</h3><p className="mt-1 text-sm text-muted">{text}</p></div> }

export function AssetDetailsPage(){return authMode==='api'?<AssetDetailsApi/>:<MockAssetDetailsPage/>}
