import { authMode } from '../../services/auth/mode'
import { CreateTicketApi } from './api/CreateTicketApi'
import { CircleUserRound, UserRoundPlus } from 'lucide-react'
import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { mockEmployeeOptionsService } from '../../services/mock/mockEmployeeOptionsService'
import { mockFaultCategoryService } from '../../services/mock/mockFaultCategoryService'
import { mockTicketService } from '../../services/mock/mockTicketService'
import { deriveTicketTitle } from '../../services/tickets/deriveTicketTitle'
import { useAuth } from '../auth/useAuth'

const initialForm = { category: '', subcategory: '', description: '' }

function MockCreateTicketPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [reportFor, setReportFor] = useState('self')
  const [form, setForm] = useState(initialForm)
  const [search, setSearch] = useState('')
  const [employeePage, setEmployeePage] = useState(1)
  const [selectedEmployee, setSelectedEmployee] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const submissionId = useRef(`employee-ticket-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
  const submitting = useRef(false)
  const [error, setError] = useState('')
  const employeeOptions = mockEmployeeOptionsService.query(search, employeePage)
  const categories = mockFaultCategoryService.getActive()
  const selectedCategory = categories.find((category) => category.name === form.category)

  const updateField = (event) => setForm((current) => ({ ...current, [event.target.name]: event.target.value, ...(event.target.name === 'category' ? { subcategory: '' } : {}) }))

  const handleSubmit = (event) => {
    event.preventDefault()
    if (submitting.current) return
    const requiredValues = [form.category, form.description]
    if (!selectedEmployee || requiredValues.some((value) => !value.trim())) return setError('يرجى اختيار الموظف من القائمة واستكمال جميع الحقول المطلوبة.')
    submitting.current = true
    setIsSubmitting(true)
    setError('')
    const ticket = mockTicketService.create({
      ...form,
      title: deriveTicketTitle(form.description),
      reporterName: selectedEmployee.fullName,
      department: selectedEmployee.departmentName,
      reporterAccountId: user.id,
      createdFor: reportFor,
      clientRequestId: submissionId.current,
    })
    if (!ticket) { submitting.current = false; setIsSubmitting(false); return setError('تعذر إنشاء الطلب. راجع البيانات وحاول مرة أخرى.') }
    navigate('/employee', { replace: true })
  }

  return <div className="mx-auto max-w-4xl">
    <div className="page-heading"><div><p className="eyebrow">طلبات الدعم</p><h1>إنشاء طلب جديد</h1><p>الطلب الشخصي هو الاختيار الافتراضي. يمكنك تغييره إذا كنت تسجل الطلب بالنيابة عن موظف آخر.</p></div></div>

    {error && <div role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">{error}</div>}
    <form className="content-card" onSubmit={handleSubmit} noValidate>
      <fieldset><legend className="field-label">هذا الطلب يخص</legend><div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition ${reportFor === 'self' ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' : 'border-border bg-canvas'}`}><input type="radio" name="reportFor" value="self" checked={reportFor === 'self'} onChange={(event) => { setReportFor(event.target.value); setSelectedEmployee(null); setSearch(''); setEmployeePage(1) }} className="mt-1 accent-primary-600" /><CircleUserRound size={21} className="shrink-0 text-primary-500" /><span><strong className="block text-sm text-ink">طلب شخصي</strong><small className="mt-1 block leading-5 text-muted">المشكلة تخصني أنا</small></span></label>
        <label className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition ${reportFor === 'other' ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' : 'border-border bg-canvas'}`}><input type="radio" name="reportFor" value="other" checked={reportFor === 'other'} onChange={(event) => { setReportFor(event.target.value); setSelectedEmployee(null); setSearch(''); setEmployeePage(1) }} className="mt-1 accent-primary-600" /><UserRoundPlus size={21} className="shrink-0 text-primary-500" /><span><strong className="block text-sm text-ink">بالنيابة عن موظف آخر</strong><small className="mt-1 block leading-5 text-muted">أنا أسجل المشكلة لموظف آخر</small></span></label>
      </div></fieldset>

      <div className="mt-7 rounded-2xl border border-border bg-canvas p-4 sm:p-5">
        <h2 className="text-base font-extrabold text-ink">{reportFor === 'self' ? 'بيانات مقدم الطلب' : 'بيانات الموظف صاحب المشكلة'}</h2>
        <p className="mt-1 text-xs leading-6 text-muted">اختر الموظف صراحةً من الدليل التجريبي؛ يُملأ القسم تلقائيًا.</p>
        <div className="form-grid mt-5"><div><label className="field-label" htmlFor="mock-employee-search">ابحث عن الموظف *</label><input id="mock-employee-search" value={search} onChange={(event) => { setSearch(event.target.value); setEmployeePage(1); setSelectedEmployee(null) }} className="field-input" placeholder="ابحث بالاسم" /><label className="field-label mt-3" htmlFor="mock-employee-select">اسم الموظف *</label><select id="mock-employee-select" value={selectedEmployee?.id ?? ''} onChange={(event) => setSelectedEmployee(employeeOptions.items.find((item) => item.id === event.target.value) ?? null)} className="field-input" required><option value="">اختر من النتائج</option>{employeeOptions.items.map((employee) => <option key={employee.id} value={employee.id}>{employee.fullName} — {employee.departmentName}</option>)}</select><div className="mt-2 flex items-center justify-between gap-2"><Button type="button" variant="secondary" disabled={employeePage <= 1} onClick={() => { setEmployeePage(employeePage - 1); setSelectedEmployee(null) }}>السابق</Button><span className="text-xs text-muted">صفحة {employeePage} · {employeeOptions.total} موظف</span><Button type="button" variant="secondary" disabled={employeePage * employeeOptions.pageSize >= employeeOptions.total} onClick={() => { setEmployeePage(employeePage + 1); setSelectedEmployee(null) }}>التالي</Button></div></div><label><span className="field-label">القسم *</span><input className="field-input" value={selectedEmployee?.departmentName ?? ''} placeholder="يظهر بعد اختيار الموظف" readOnly /></label></div>
      </div>

      <div className="form-grid mt-7"><label><span className="field-label">تصنيف العطل *</span><select name="category" value={form.category} onChange={updateField} className="field-input" required><option value="" disabled>اختر التصنيف</option>{categories.map((category) => <option key={category.id} value={category.name}>{category.name}</option>)}</select></label><label className={!selectedCategory ? 'dependent-field-disabled' : undefined}><span className="field-label">التصنيف الفرعي</span><select name="subcategory" value={form.subcategory} onChange={updateField} className="field-input" disabled={!selectedCategory}><option value="">{selectedCategory ? 'بدون تصنيف فرعي' : 'اختر التصنيف أولًا'}</option>{selectedCategory?.subcategories.filter((subcategory) => subcategory.active).map((subcategory) => <option key={subcategory.id} value={subcategory.name}>{subcategory.name}</option>)}</select></label></div>
      <label className="mt-5 block"><span className="field-label">تفاصيل المشكلة *</span><textarea name="description" value={form.description} onChange={updateField} className="field-textarea" placeholder="اشرح المشكلة والخطوات التي سبقتها" required /></label>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row"><Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'جارٍ إرسال الطلب...' : 'إرسال الطلب'}</Button><Button type="button" variant="secondary" onClick={() => navigate('/employee')}>إلغاء</Button></div>
    </form>
  </div>
}

export function CreateTicketPage() { return authMode === 'api' ? <CreateTicketApi /> : <MockCreateTicketPage /> }
