import { CircleUserRound, UserRoundPlus } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../../../components/ui/Button'
import { employeeTicketService as service } from '../../../services/tickets/employeeTicketService'
import { useApiQuery } from '../../../services/http/useApiQuery'

const initialForm = { category: '', subcategory: '', description: '' }
const emptyItems = []

export function CreateTicketApi() {
  const navigate = useNavigate()
  const listId = useId()
  const inputRef = useRef(null)
  const submitting = useRef(false)
  const submission = useRef(null)
  const [reportFor, setReportFor] = useState('self')
  const [form, setForm] = useState(initialForm)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState(null)
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const query = useApiQuery('ticket-options', (signal) => service.options(signal))
  const employees = useApiQuery(JSON.stringify([search.trim(), page]), (signal) => service.employeeOptions(search, page, signal))
  const categories = query.data?.categories ?? []
  const selectedCategory = categories.find((category) => category.id === form.category)
  const items = employees.data?.items ?? emptyItems
  const pageSize = employees.data?.pageSize ?? 25
  const total = employees.data?.total ?? 0

  useEffect(() => {
    if (!selected || employees.status !== 'ready') return
    const current = items.find((item) => item.id === selected.id)
    if (!current) {
      setSelected(null)
      setError('لم يعد الموظف المختار متاحًا. ابحث عنه واختره مجددًا.')
    } else if (current.fullName !== selected.fullName || current.departmentId !== selected.departmentId || current.departmentName !== selected.departmentName) {
      setSelected(current)
    }
  }, [employees.status, items, selected])

  const clearSelection = () => { setSelected(null); setSearch(''); setPage(1); setActiveIndex(-1) }
  const updateSearch = (event) => { setSearch(event.target.value); setSelected(null); setPage(1); setActiveIndex(-1); setOpen(true); setError('') }
  const chooseEmployee = (employee) => { setSelected(employee); setOpen(false); setActiveIndex(-1); setError('') }
  const updateField = (event) => setForm((current) => ({ ...current, [event.target.name]: event.target.value, ...(event.target.name === 'category' ? { subcategory: '' } : {}) }))
  const onSelectorKeyDown = (event) => {
    if (event.key === 'Escape') { setOpen(false); return }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault(); setOpen(true)
      if (items.length) setActiveIndex((index) => event.key === 'ArrowDown' ? (index + 1) % items.length : (index <= 0 ? items.length - 1 : index - 1))
    }
    if (event.key === 'Enter' && open && activeIndex >= 0 && items[activeIndex]) { event.preventDefault(); chooseEmployee(items[activeIndex]) }
  }
  const handleSubmit = async (event) => {
    event.preventDefault()
    if (submitting.current) return
    if (!selected?.id || [form.category, form.description].some((value) => !value.trim())) {
      setError('يرجى اختيار الموظف من القائمة واستكمال جميع الحقول المطلوبة.'); return
    }
    submitting.current = true; setIsSubmitting(true); setError('')
    const payload = { ...form, reporterEmployeeId: selected.id }
    const fingerprint = JSON.stringify([payload, reportFor])
    if (submission.current?.fingerprint !== fingerprint) submission.current = { fingerprint, key: crypto.randomUUID() }
    try { await service.create(payload, reportFor, submission.current.key); navigate('/employee', { replace: true }) }
    catch (failure) {
      setError(failure.status === 400 ? 'تعذر اعتماد الموظف المختار أو بيانات الطلب. اختر موظفًا نشطًا وحاول مجددًا.' : failure.message)
      if (failure.status === 400) { clearSelection(); employees.refresh(true) }
    } finally { submitting.current = false; setIsSubmitting(false) }
  }

  if (query.status === 'loading') return <p role="status" className="content-card text-ink">جارٍ تحميل الطلبات...</p>
  if (query.error) return <section className="content-card"><p role="alert" className="text-red-700 dark:text-red-300">{query.error.message}</p><Button variant="secondary" className="mt-3" onClick={() => query.refresh()}>إعادة المحاولة</Button></section>
  return <div className="mx-auto max-w-4xl">
    <div className="page-heading"><div><p className="eyebrow">طلبات الدعم</p><h1>إنشاء طلب جديد</h1></div></div>
    {error && <div role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">{error}</div>}
    <form className="content-card" onSubmit={handleSubmit} aria-busy={isSubmitting} noValidate>
      <fieldset disabled={isSubmitting}><legend className="field-label">هذا الطلب يخص</legend><div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition ${reportFor === 'self' ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' : 'border-border bg-canvas'}`}><input type="radio" name="reportFor" value="self" checked={reportFor === 'self'} onChange={() => { setReportFor('self'); clearSelection(); setError('') }} className="mt-1 accent-primary-600" /><CircleUserRound size={21} className="shrink-0 text-primary-500" /><span><strong className="block text-sm text-ink">طلب شخصي</strong><small className="mt-1 block leading-5 text-muted">المشكلة تخصني أنا</small></span></label>
        <label className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition ${reportFor === 'other' ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' : 'border-border bg-canvas'}`}><input type="radio" name="reportFor" value="other" checked={reportFor === 'other'} onChange={() => { setReportFor('other'); clearSelection(); setError('') }} className="mt-1 accent-primary-600" /><UserRoundPlus size={21} className="shrink-0 text-primary-500" /><span><strong className="block text-sm text-ink">بالنيابة عن موظف آخر</strong><small className="mt-1 block leading-5 text-muted">أنا أسجل المشكلة لموظف آخر</small></span></label>
      </div></fieldset>
      <fieldset disabled={isSubmitting} className="mt-7 rounded-2xl border border-border bg-canvas p-4 sm:p-5">
        <h2 className="text-base font-extrabold text-ink">{reportFor === 'self' ? 'بيانات مقدم الطلب' : 'بيانات الموظف صاحب المشكلة'}</h2><p className="mt-1 text-xs leading-6 text-muted">ابحث عن الموظف من هنا  يُملأ القسم تلقائيًا.</p>
        <div className="form-grid mt-5">
          <div className="relative" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false) }}>
            <label htmlFor={`${listId}-input`} className="field-label">اسم الموظف *</label>
            <div className="flex gap-2"><input ref={inputRef} id={`${listId}-input`} role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={open && employees.status === 'ready' ? listId : undefined} aria-activedescendant={open && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined} autoComplete="off" maxLength={200} value={selected ? selected.fullName : search} onChange={updateSearch} onFocus={() => setOpen(true)} onKeyDown={onSelectorKeyDown} className="field-input min-w-0" placeholder="ابحث بالاسم واختر من النتائج" required />{(selected || search) && <Button type="button" variant="secondary" onClick={() => { clearSelection(); setOpen(true); inputRef.current?.focus() }} aria-label="مسح اختيار الموظف">مسح</Button>}</div>
            {open && <div className="absolute inset-x-0 top-full z-30 mt-2 rounded-xl border border-border bg-surface p-2 shadow-xl">
              {employees.status === 'loading' && <p role="status" className="p-3 text-sm text-muted">جارٍ البحث عن الموظفين...</p>}
              {employees.error && <div className="p-3"><p role="alert" className="text-sm text-red-700 dark:text-red-300">{employees.error.message}</p><Button type="button" variant="secondary" className="mt-2" onClick={() => employees.refresh()}>إعادة المحاولة</Button></div>}
              {employees.status === 'ready' && <><ul id={listId} role="listbox" aria-label="نتائج البحث عن الموظفين" className="max-h-64 overflow-y-auto">{items.map((employee, index) => <li key={employee.id} id={`${listId}-${index}`} role="option" aria-selected={selected?.id === employee.id} className={activeIndex === index ? 'rounded-lg bg-primary-50 dark:bg-primary-900/30' : ''}><button type="button" tabIndex={-1} className="w-full rounded-lg p-3 text-right text-sm text-ink hover:bg-primary-50 focus-visible:outline-2 focus-visible:outline-primary-500 dark:hover:bg-primary-900/30" onMouseDown={(event) => event.preventDefault()} onClick={() => chooseEmployee(employee)}><strong className="block">{employee.fullName}</strong><span className="text-xs text-muted">{employee.departmentName}</span></button></li>)}</ul>{!items.length && <p className="p-3 text-sm text-muted">لا توجد نتائج مطابقة.</p>}
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2"><Button type="button" variant="secondary" disabled={page <= 1} onClick={() => { setPage(page - 1); setActiveIndex(-1) }}>السابق</Button><span className="text-xs text-muted">صفحة {page} · {total} موظف</span><Button type="button" variant="secondary" disabled={page * pageSize >= total} onClick={() => { setPage(page + 1); setActiveIndex(-1) }}>التالي</Button></div>
              </>}
            </div>}
          </div>
          <label><span className="field-label">القسم *</span><input className="field-input" value={selected?.departmentName ?? ''} placeholder="يظهر بعد اختيار الموظف" readOnly aria-readonly="true" /></label>
        </div>
      </fieldset>
      <div className="form-grid mt-7"><label><span className="field-label">تصنيف العطل *</span><select disabled={isSubmitting} name="category" value={form.category} onChange={updateField} className="field-input" required><option value="" disabled>اختر التصنيف</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label className={!selectedCategory ? 'dependent-field-disabled' : undefined}><span className="field-label">التصنيف الفرعي</span><select name="subcategory" value={form.subcategory} onChange={updateField} className="field-input" disabled={!selectedCategory || isSubmitting}><option value="">{selectedCategory ? 'بدون تصنيف فرعي' : 'اختر التصنيف أولًا'}</option>{selectedCategory?.subcategories.map((subcategory) => <option key={subcategory.id} value={subcategory.id}>{subcategory.name}</option>)}</select></label></div>
      <label className="mt-5 block"><span className="field-label">تفاصيل المشكلة *</span><textarea maxLength={4000} disabled={isSubmitting} name="description" value={form.description} onChange={updateField} className="field-textarea" placeholder="اشرح المشكلة والخطوات التي سبقتها" required /></label>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row"><Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'جارٍ إرسال الطلب...' : 'إرسال الطلب'}</Button><Button type="button" variant="secondary" onClick={() => navigate('/employee')}>إلغاء</Button></div>
    </form>
  </div>
}
