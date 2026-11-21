import { useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../../../components/ui/Button'
import { engineerTicketService } from '../../../services/tickets/engineerTicketService'
import { useApiQuery } from '../../../services/http/useApiQuery'
import { formatTicketReference } from '../../../services/tickets/formatTicketReference'
import { ANYDESK_ERROR, normalizeAnydeskId } from '../../../services/tickets/anydesk'

const initial = { requesterType: 'employee', reporterName: '', reporterPhone: '', departmentId: '', managementPosition: '', category: '', subcategory: '', description: '', assignedTechnicianId: '', anydeskId: '' }
export function EngineerManualTicketApi({ service = engineerTicketService, managerMode = false }) {
  const listId = useId()
  const inputRef = useRef(null)
  const [form, setForm] = useState(initial), [saved, setSaved] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const [search, setSearch] = useState(''), [page, setPage] = useState(1), [selectedEmployee, setSelectedEmployee] = useState(null)
  const [open, setOpen] = useState(false), [activeIndex, setActiveIndex] = useState(-1)
  const lock = useRef(false), request = useRef(null)
  const query = useApiQuery('manual-options', (signal) => service.options(signal))
  const employees = useApiQuery(JSON.stringify(['manual-users', search.trim(), page]), (signal) => service.userOptions(search, page, signal))
  const items = employees.data?.items ?? []
  const category = query.data?.categories.find((item) => item.id === form.category)
  useEffect(() => {
    if (!selectedEmployee || employees.status !== 'ready') return
    const current = employees.data.items.find((item) => item.id === selectedEmployee.id)
    if (current && JSON.stringify(current) !== JSON.stringify(selectedEmployee)) setSelectedEmployee(current)
  }, [employees.status, employees.data, selectedEmployee])
  const change = ({ target }) => {
    if (target.name === 'requesterType') { setSelectedEmployee(null); setSearch(''); setPage(1); setOpen(false); setActiveIndex(-1) }
    setForm((old) => ({ ...old, [target.name]: target.value, ...(target.name === 'category' ? { subcategory: '' } : {}), ...(target.name === 'requesterType' ? { reporterName: '', reporterPhone: '', departmentId: '', managementPosition: '' } : {}) }))
  }
  const clearEmployee = () => { setSelectedEmployee(null); setSearch(''); setPage(1); setActiveIndex(-1); setForm((old) => ({ ...old, departmentId: '', reporterPhone: '' })) }
  const chooseEmployee = (employee) => { const active = (employee.departments ?? []).filter((item) => item.isActive); setSelectedEmployee(employee); setForm((old) => ({ ...old, departmentId: active.length === 1 ? active[0].id : '', reporterPhone: '' })); setOpen(false); setActiveIndex(-1); setError('') }
  const searchEmployee = (event) => { setSearch(event.target.value); setSelectedEmployee(null); setForm((old) => ({ ...old, departmentId: '', reporterPhone: '' })); setPage(1); setActiveIndex(-1); setOpen(true); setError('') }
  const selectedDepartments = (selectedEmployee?.departments ?? []).filter((item) => item.isActive)
  const activeDepartments = (query.data?.departments ?? []).filter((item) => item.isActive !== false && item.isActive !== 0)
  const allowedDepartments = selectedDepartments.length ? selectedDepartments : activeDepartments
  const onEmployeeKeyDown = (event) => {
    if (event.key === 'Escape') { setOpen(false); return }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault(); setOpen(true)
      if (items.length) setActiveIndex((index) => event.key === 'ArrowDown' ? (index + 1) % items.length : (index <= 0 ? items.length - 1 : index - 1))
    }
    if (event.key === 'Enter' && open && activeIndex >= 0 && items[activeIndex]) { event.preventDefault(); chooseEmployee(items[activeIndex]) }
  }
  // IT tickets (manager only): internal tasks for an engineer with no employee requester.
  const internal = managerMode && form.requesterType === 'it_internal'
  const requesterOptions = [['employee', 'موظف'], ['top_management', 'الإدارة العليا'], ...(managerMode ? [['it_internal', 'بلاغ تقنية المعلومات']] : [])]
  const submit = async (event) => {
    event.preventDefault()
    if (lock.current) return
    const ticketPhone = form.reporterPhone.trim()
    if (form.requesterType === 'employee' && !selectedEmployee?.phone && ticketPhone && (!/^\+?[0-9][0-9 ()-]{5,30}[0-9]$/.test(ticketPhone) || ticketPhone.replace(/\D/g, '').length < 7 || ticketPhone.replace(/\D/g, '').length > 15)) { setError('أدخل رقم هاتف صحيحًا من ٧ إلى ١٥ رقمًا، أو اترك الحقل فارغًا.'); return }
    if (internal && (!form.assignedTechnicianId || !form.description.trim())) { setError('اختر المهندس المسؤول واكتب تفاصيل المهمة.'); return }
    if (!internal && ([form.category, form.description].some((value) => !value.trim()) || (form.requesterType === 'employee' ? !selectedEmployee?.id || !selectedEmployee.isActive || !allowedDepartments.some((item) => item.id === form.departmentId) : (form.reporterName.trim().length < 2 || !form.managementPosition.trim())))) { setError('اختر حساب موظف نشطًا وقسمًا مسموحًا، ثم أكمل بيانات البلاغ.'); return }
    const anydesk = normalizeAnydeskId(internal ? '' : form.anydeskId)
    if (!anydesk.valid) { setError(ANYDESK_ERROR); return }
    lock.current = true; setBusy(true); setError('')
    const payload = { ...form, anydeskId: anydesk.value, ...(form.requesterType === 'employee' ? { reporterUserId: selectedEmployee.id, departmentId: form.departmentId, reporterPhone: !selectedEmployee.phone ? ticketPhone : '' } : {}) }
    const fingerprint = JSON.stringify(payload)
    if (request.current?.fingerprint !== fingerprint) request.current = { fingerprint, key: crypto.randomUUID() }
    try { const ticket = await service.manual(payload, request.current.key); setSaved(ticket); setForm(initial); clearEmployee(); setOpen(false); request.current = null }
    catch (failure) { setError(failure.message); if (failure.status === 400 && form.requesterType === 'employee') employees.refresh(true) }
    finally { lock.current = false; setBusy(false) }
  }
  if (query.status === 'loading') return <p role="status" className="content-card">جارٍ تحميل خيارات البلاغ...</p>
  if (query.error) return <section className="content-card"><p role="alert">{query.error.message}</p><Button onClick={() => query.refresh()}>إعادة المحاولة</Button></section>
  return <div className="mx-auto max-w-5xl">
    <div className="page-heading"><div><p className="eyebrow">التسجيل من خارج البوابة</p><h1>إنشاء بلاغ يدوي</h1><p>اختر حساب الموظف حتى لو لم يكمل إعداد حسابه، أو أدخل بيانات الإدارة العليا يدويًا. لا يمكن تسجيل بلاغ جديد لحساب معطل.</p></div></div>
    {saved && <section role="status" className="content-card mb-5 break-words"><h2 className="font-bold text-ink">تم إنشاء البلاغ اليدوي بنجاح</h2><p className="mt-2 text-muted">رقم البلاغ: <bdi dir="ltr" className="break-all">{formatTicketReference(saved)}</bdi>. {saved.assignedTechnicianId ? 'تم إسناد البلاغ.' : 'البلاغ غير مسند.'}{!managerMode && ' يمكنك فتح التفاصيل بعد إسناده إليك.'}</p><Link className="mt-3 inline-block font-bold text-primary-600" to={managerMode ? '/manager/tickets/'+saved.id : '/technician/tickets'}>{managerMode ? 'عرض تفاصيل البلاغ' : 'عرض التذاكر غير المسندة'}</Link></section>}
    {error && <p role="alert" className="content-card mb-4 text-red-700 dark:text-red-300">{error}</p>}
    <form onSubmit={submit} noValidate className="content-card" aria-busy={busy}><fieldset disabled={busy}>
      <legend className="field-label">البلاغ مسجل لصالح</legend>
      <div className="my-4 flex flex-wrap gap-6">{requesterOptions.map(([value,label]) => <label key={value} className="text-ink"><input type="radio" name="requesterType" value={value} checked={form.requesterType === value} onChange={change} className="ml-2 accent-primary-600" />{label}</label>)}</div>
      <div className="form-grid">
        {form.requesterType === 'employee' ? <>
          <div className="relative" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false) }}>
            <label htmlFor="manual-employee-search" className="field-label">حساب الموظف *</label>
            <div className="flex gap-2"><input ref={inputRef} id="manual-employee-search" role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={open && employees.status === 'ready' ? listId : undefined} aria-activedescendant={open && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined} value={selectedEmployee ? `${selectedEmployee.fullName} — ${selectedEmployee.username}` : search} onChange={searchEmployee} onFocus={() => setOpen(true)} onKeyDown={onEmployeeKeyDown} className="field-input min-w-0" placeholder="ابحث بالاسم أو اسم المستخدم" autoComplete="off" maxLength={200} required />{(selectedEmployee || search) && <Button type="button" variant="secondary" onClick={() => { clearEmployee(); setOpen(true); inputRef.current?.focus() }} aria-label="مسح اختيار الموظف">مسح</Button>}</div>
            {open && <div className="absolute inset-x-0 top-full z-30 mt-2 rounded-xl border border-border bg-surface p-2 shadow-xl">
              {employees.status === 'loading' && <p role="status" className="p-3 text-sm text-muted">جارٍ البحث عن الموظفين...</p>}
              {employees.error && <div className="p-3"><p role="alert" className="text-sm text-red-700 dark:text-red-300">{employees.error.message}</p><Button type="button" variant="secondary" className="mt-2" onClick={() => employees.refresh()}>إعادة المحاولة</Button></div>}
              {employees.status === 'ready' && <><ul id={listId} role="listbox" aria-label="نتائج البحث عن الموظفين" className="max-h-64 overflow-y-auto">{items.map((employee, index) => <li key={employee.id} id={`${listId}-${index}`} role="option" aria-selected={selectedEmployee?.id === employee.id} aria-disabled={!employee.isActive || undefined} className={activeIndex === index ? 'rounded-lg bg-primary-50 dark:bg-primary-900/30' : ''}><button type="button" tabIndex={-1} className={`w-full rounded-lg p-3 text-right text-sm text-ink hover:bg-primary-50 focus-visible:outline-2 focus-visible:outline-primary-500 dark:hover:bg-primary-900/30 ${!employee.isActive ? 'opacity-60' : ''}`} onMouseDown={(event) => event.preventDefault()} onClick={() => chooseEmployee(employee)}><strong className="block">{employee.fullName}</strong><span className="text-xs text-muted">{employee.username} · {employee.phone ?? 'رقم الهاتف غير متاح'}{!employee.isActive ? ' · حساب معطل' : employee.mustChangePassword || employee.mustCompleteProfile ? ' · لم يكتمل إعداد الحساب' : ''}</span></button></li>)}</ul>{!items.length && <p className="p-3 text-sm text-muted">لا توجد نتائج مطابقة.</p>}
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2"><Button type="button" variant="secondary" disabled={page <= 1} onClick={() => { setPage(page - 1); setActiveIndex(-1) }}>السابق</Button><span className="text-xs text-muted">صفحة {page} · {employees.data.total} موظف</span><Button type="button" variant="secondary" disabled={page * employees.data.pageSize >= employees.data.total} onClick={() => { setPage(page + 1); setActiveIndex(-1) }}>التالي</Button></div>
              </>}
            </div>}
          </div>
          {selectedEmployee && !selectedEmployee.isActive && <p className="text-sm text-red-700 dark:text-red-300" role="alert">هذا الحساب معطل؛ لا يمكن إنشاء بلاغ جديد له.</p>}
          {selectedEmployee && (selectedEmployee.phone ? <label><span className="field-label">رقم الهاتف المسجل</span><input className="field-input" value={selectedEmployee.phone} readOnly dir="ltr" /></label> : <label><span className="field-label">رقم هاتف البلاغ — اختياري</span><input name="reporterPhone" className="field-input" type="tel" dir="ltr" maxLength={32} value={form.reporterPhone} onChange={change} placeholder="لا يُضاف إلى ملف الموظف" /></label>)}
          {selectedDepartments.length === 1 && <label><span className="field-label">القسم</span><input className="field-input" value={selectedDepartments[0].name} readOnly /></label>}
          {selectedDepartments.length > 1 && <label><span className="field-label">القسم *</span><select name="departmentId" className="field-input" value={form.departmentId} onChange={change} required><option value="">اختر القسم</option>{selectedDepartments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
          {selectedEmployee && selectedDepartments.length === 0 && <label><span className="field-label">القسم النشط لهذا البلاغ *</span><select name="departmentId" className="field-input" value={form.departmentId} onChange={change} required><option value="">اختر القسم</option>{activeDepartments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
        </> : internal ? <p className="rounded-xl border border-primary-200 bg-primary-50 p-3 text-sm text-ink sm:col-span-2 dark:border-primary-800 dark:bg-primary-900/20">بلاغ داخلي لقسم تكنولوجيا المعلومات دون موظف مقدم للطلب أو قسم أو تصنيف عطل، مثل «تغيير مؤقت جهاز التكييف». يُسند مباشرة إلى المهندس المختار.</p> : <><label><span className="field-label">الاسم الكامل *</span><input name="reporterName" maxLength={160} value={form.reporterName} onChange={change} className="field-input" required /></label><label><span className="field-label">المنصب أو المكتب *</span><input name="managementPosition" maxLength={160} value={form.managementPosition} onChange={change} className="field-input" required /></label></>}
        {!internal && <><label><span className="field-label">تصنيف العطل *</span><select name="category" value={form.category} onChange={change} className="field-input" required><option value="">اختر التصنيف</option>{query.data.categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className={!category ? 'dependent-field-disabled' : undefined}><span className="field-label">التصنيف الفرعي</span><select name="subcategory" value={form.subcategory} onChange={change} disabled={!category} className="field-input"><option value="">{category ? 'بدون تصنيف فرعي' : 'اختر التصنيف أولًا'}</option>{category?.subcategories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></>}
      </div>
      {managerMode && <label className="mt-5 block"><span className="field-label">{internal ? 'المهندس المسؤول *' : 'إسناد إلى مهندس — اختياري'}</span><select name="assignedTechnicianId" className="field-input" value={form.assignedTechnicianId} onChange={change} required={internal}><option value="">{internal ? 'اختر المهندس' : 'بدون إسناد'}</option>{query.data.engineers.map(user => <option key={user.id} value={user.id}>{user.fullName} — {user.activeTicketCount} تذكرة نشطة{!user.isAvailable ? ' — غير متاح مؤقتًا' : ''}</option>)}</select></label>}
      {!internal && <label className="mt-5 block sm:max-w-sm"><span className="field-label">معرّف AnyDesk — اختياري</span><input name="anydeskId" className="field-input" value={form.anydeskId} onChange={change} dir="ltr" autoComplete="off" maxLength={64} placeholder="123 456 789" /></label>}
      <label className="mt-5 block"><span className="field-label">تفاصيل المشكلة *</span><textarea name="description" placeholder={internal ? 'مثال: تغيير مؤقت جهاز التكييف في غرفة الخوادم' : undefined} maxLength={4000} value={form.description} onChange={change} required className="field-textarea" /></label>
      <Button type="submit" className="mt-5" disabled={busy}>{busy ? 'جارٍ حفظ البلاغ...' : 'إنشاء البلاغ اليدوي'}</Button>
    </fieldset></form>
  </div>
}
