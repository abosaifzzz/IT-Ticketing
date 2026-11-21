import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '../../../components/ui/Button'
import { authService } from '../../../services/auth/authService'
import { useApiQuery } from '../../../services/http/useApiQuery'
import { employeeTicketService as service } from '../../../services/tickets/employeeTicketService'
import { ANYDESK_ERROR, normalizeAnydeskId } from '../../../services/tickets/anydesk'

export function CreateTicketApi() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ category: '', subcategory: '', departmentId: '', description: '', anydeskId: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const lock = useRef(false)
  const request = useRef(null)
  const options = useApiQuery('employee-ticket-options', (signal) => service.options(signal))
  const profile = useApiQuery('employee-ticket-profile', (signal) => authService.profile(signal))
  const categories = options.data?.categories ?? []
  const category = categories.find((item) => item.id === form.category)
  const departments = (profile.data?.departments ?? []).filter((item) => item.isActive)
  const change = (event) => setForm((old) => ({ ...old, [event.target.name]: event.target.value, ...(event.target.name === 'category' ? { subcategory: '' } : {}) }))
  const submit = async (event) => {
    event.preventDefault()
    if (lock.current) return
    if (!form.category || !form.description.trim() || !departments.length || (departments.length > 1 && !departments.some((item) => item.id === form.departmentId))) { setError('أكمل تفاصيل المشكلة واختر قسمًا نشطًا من ملفك الشخصي.'); return }
    const anydesk = normalizeAnydeskId(form.anydeskId)
    if (!anydesk.valid) { setError(ANYDESK_ERROR); return }
    const payload = { category: form.category, subcategory: form.subcategory, description: form.description, ...(departments.length > 1 ? { departmentId: form.departmentId } : {}), ...(anydesk.value ? { anydeskId: anydesk.value } : {}) }
    const fingerprint = JSON.stringify(payload)
    if (request.current?.fingerprint !== fingerprint) request.current = { fingerprint, key: crypto.randomUUID() }
    lock.current = true; setBusy(true); setError('')
    try { await service.create(payload, request.current.key); navigate('/employee', { replace: true, state: { ticketSubmitted: true } }) }
    catch (failure) { setError(failure.message); if (failure.status === 400) profile.refresh() }
    finally { lock.current = false; setBusy(false) }
  }
  if (options.status === 'loading' || profile.status === 'loading') return <p role="status" className="content-card">جارٍ تحميل بيانات الطلب...</p>
  if (options.error || profile.error) return <section className="content-card"><p role="alert">{options.error?.message ?? profile.error?.message}</p><Button type="button" onClick={() => { options.refresh(); profile.refresh() }}>إعادة المحاولة</Button></section>
  return <div className="mx-auto max-w-4xl"><div className="page-heading"><div><p className="eyebrow">طلبات الدعم</p><h1>إنشاء طلب جديد</h1></div></div>
    {error && <p role="alert" className="content-card mb-4 text-red-700 dark:text-red-300">{error}</p>}
    <form className="content-card" onSubmit={submit} aria-busy={busy} noValidate><p className="text-sm text-muted">يُسجل هذا الطلب باسم حسابك الشخصي، ولا يمكن إنشاء طلب بالنيابة عن حساب آخر من بوابة الموظف.</p>
      <div className="form-grid mt-5"><label><span className="field-label">الاسم</span><input className="field-input" value={profile.data?.fullName ?? ''} readOnly /></label><label><span className="field-label">اسم المستخدم</span><input className="field-input" value={profile.data?.username ?? ''} dir="ltr" readOnly /></label><label><span className="field-label">رقم الهاتف</span><input className="field-input" value={profile.data?.phone ?? ''} dir="ltr" readOnly /></label>
        {departments.length === 1 && <label><span className="field-label">القسم</span><input className="field-input" value={departments[0].name} readOnly /></label>}
        {departments.length > 1 && <label><span className="field-label">القسم *</span><select name="departmentId" className="field-input" value={form.departmentId} onChange={change} disabled={busy} required><option value="">اختر القسم</option>{departments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
      </div>
      {!departments.length && <p role="alert" className="mt-4 text-red-700 dark:text-red-300">لا يوجد قسم نشط في ملفك الشخصي. <Link className="underline" to="/profile">صحح ملفك الشخصي</Link> قبل إنشاء الطلب.</p>}
      <div className="form-grid mt-6"><label><span className="field-label">تصنيف العطل *</span><select className="field-input" name="category" value={form.category} onChange={change} disabled={busy} required><option value="">اختر التصنيف</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className={!category ? 'dependent-field-disabled' : undefined}><span className="field-label">التصنيف الفرعي</span><select className="field-input" name="subcategory" value={form.subcategory} onChange={change} disabled={!category || busy}><option value="">{category ? 'بدون تصنيف فرعي' : 'اختر التصنيف أولًا'}</option>{category?.subcategories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div>
      <label className="mt-5 block sm:max-w-sm"><span className="field-label">معرّف AnyDesk — اختياري</span><input className="field-input" name="anydeskId" value={form.anydeskId} onChange={change} disabled={busy} dir="ltr" inputMode="text" autoComplete="off" maxLength={64} placeholder="123 456 789" aria-describedby="anydesk-hint" /><span id="anydesk-hint" className="mt-1 block text-xs text-muted">إن كان برنامج AnyDesk مثبتًا على جهازك، اكتب الرقم الظاهر فيه ليتمكن فريق الدعم من الاتصال بجهازك عن بُعد.</span></label>
      <label className="mt-5 block"><span className="field-label">تفاصيل المشكلة *</span><textarea className="field-textarea" name="description" value={form.description} onChange={change} disabled={busy} maxLength={4000} required /></label>
      <div className="mt-5 flex flex-wrap gap-3"><Button type="submit" disabled={busy || !departments.length}>{busy ? 'جارٍ إرسال الطلب...' : 'إرسال الطلب'}</Button><Button type="button" variant="secondary" onClick={() => navigate('/employee')}>إلغاء</Button></div>
    </form>
  </div>
}
