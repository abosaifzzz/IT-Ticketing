import{authMode}from'../../services/auth/mode'
import{AssetFormApi}from'./api/AssetFormApi'
import { ArrowRight, Save } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { mockAssetInventoryService, operationalStatusLabels } from '../../services/mock/mockAssetInventoryService'
import { createAssetDraftId } from '../../services/assets/assetId'
import { mockDepartmentService } from '../../services/mock/mockDepartmentService'
import { useAuth } from '../auth/useAuth'

const emptyAsset = { assetId: '', name: '', quantity: 1, manufacturer: '', model: '', serialNumber: '', department: '', location: '', purchaseDate: '', operationalStatus: 'working', conditionDescription: '', maintenanceNotes: '', lastMaintenanceDate: '' }

function MockAssetFormPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const existing = id ? mockAssetInventoryService.getById(id) : null
  const [form, setForm] = useState(() => existing ? { ...emptyAsset, ...existing } : { ...emptyAsset, assetId: createAssetDraftId() })
  const [error, setError] = useState('')
  const departments = useMemo(() => {
    const active = mockDepartmentService.getActive()
    return existing?.department && !active.some((item) => item.name === existing.department) ? [...active, { id: 'historical', name: existing.department }] : active
  }, [existing])
  const update = ({ target }) => setForm((current) => ({ ...current, [target.name]: target.value }))
  const submit = (event) => {
    event.preventDefault(); setError('')
    const saved = id ? mockAssetInventoryService.update(id, form, user) : mockAssetInventoryService.create(form, user)
    if (!saved) return setError(id ? 'تعذر حفظ التعديلات. راجع الحقول المطلوبة.' : 'تعذر إضافة الأصل. تأكد من اكتمال البيانات وعدم استخدام رقم أصل مسجل مسبقًا.')
    navigate(`/it/assets/${saved.assetId}`, { replace: true })
  }

  if (id && (!existing || existing.archivedAt)) return <div className="content-card mx-auto max-w-2xl py-12 text-center"><h1 className="text-xl font-extrabold text-ink">الأصل غير متاح للتعديل</h1><p className="mt-2 text-sm text-muted">قد يكون الرقم غير صحيح أو تم أرشفة هذا الأصل.</p><Button as={Link} to="/it/assets" className="mt-5">العودة إلى الأصول</Button></div>

  return <div className="mx-auto max-w-5xl">
    <div className="page-heading"><div><p className="eyebrow">{id ? 'تحديث سجل الأصل' : 'تسجيل أجهزة أو ملحقات'}</p><h1>{id ? `تعديل ${existing.name}` : 'إضافة أصل تقني'}</h1><p>سجل عدد الوحدات المتشابهة وموقعها وحالتها التشغيلية في سجل واحد.</p></div><Button as={Link} to={id ? `/it/assets/${id}` : '/it/assets'} variant="secondary"><ArrowRight size={18} />رجوع</Button></div>
    {error && <div role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">{error}</div>}
    <form onSubmit={submit} className="content-card">
      <div className="form-grid">
        <label><span className="field-label">رقم الأصل *</span><input name="assetId" value={form.assetId} className="field-input" readOnly required /><span className="mt-1 block text-xs text-muted">يُنشأ الرقم تلقائيًا ولا يمكن تعديله.</span></label>
        <label><span className="field-label">اسم الأصل *</span><input name="name" value={form.name} onChange={update} className="field-input" placeholder="اسم وصفي واضح للجهاز" required /></label>
        <label><span className="field-label">الكمية *</span><input type="number" name="quantity" value={form.quantity} onChange={update} className="field-input" min="1" max="1000000" step="1" disabled={existing?.operationalStatus === 'withdrawn'} required /><span className="mt-1 block text-xs text-muted">عدد الوحدات المتشابهة في هذا السجل. الوحدة المسحوبة لا يمكن تغيير كميتها.</span></label>
        <label><span className="field-label">الشركة المصنعة *</span><input name="manufacturer" value={form.manufacturer} onChange={update} className="field-input" required /></label>
        <label><span className="field-label">الموديل *</span><input name="model" value={form.model} onChange={update} className="field-input" required /></label>
        <label><span className="field-label">الرقم المسلسل</span><input name="serialNumber" value={form.serialNumber} onChange={update} className="field-input" placeholder="اختياري" /></label>
        <label><span className="field-label">القسم *</span><select name="department" value={form.department} onChange={update} className="field-input" required><option value="" disabled>اختر القسم</option>{departments.map((department) => <option key={department.id} value={department.name}>{department.name}</option>)}</select></label>
        <label><span className="field-label">الموقع الفعلي *</span><input name="location" value={form.location} onChange={update} className="field-input" placeholder="المبنى، الغرفة أو رف التخزين" required /></label>
        <label><span className="field-label">تاريخ الشراء</span><input type="date" name="purchaseDate" value={form.purchaseDate} onChange={update} className="field-input" /></label>
        <label><span className="field-label">الحالة التشغيلية *</span><select name="operationalStatus" value={form.operationalStatus} onChange={update} className="field-input" disabled={existing?.operationalStatus === 'withdrawn'} required>{Object.entries(operationalStatusLabels).map(([value, label]) => <option key={value} value={value} disabled={value === 'withdrawn' && existing?.operationalStatus !== 'withdrawn'}>{label}</option>)}</select><span className="mt-1 block text-xs text-muted">حالة «تم السحب» تُسجّل من تذكرة المهندس مع اسمه تلقائيًا ولا تتغير من هذا النموذج.</span></label>
        <label><span className="field-label">تاريخ آخر صيانة</span><input type="date" name="lastMaintenanceDate" value={form.lastMaintenanceDate} onChange={update} className="field-input" /></label>
      </div>
      <div className="mt-5 grid gap-5 md:grid-cols-2"><label><span className="field-label">وصف الحالة *</span><textarea name="conditionDescription" value={form.conditionDescription} onChange={update} className="field-textarea" placeholder="صف الحالة المادية والفنية الحالية" required /></label><label><span className="field-label">ملاحظات الصيانة</span><textarea name="maintenanceNotes" value={form.maintenanceNotes} onChange={update} className="field-textarea" placeholder="ملاحظات المتابعة أو القطع المطلوبة" /></label></div>
      <Button type="submit" className="mt-6"><Save size={18} />{id ? 'حفظ التعديلات' : 'إضافة الأصل'}</Button>
    </form>
  </div>
}

export function AssetFormPage(){return authMode==='api'?<AssetFormApi/>:<MockAssetFormPage/>}
