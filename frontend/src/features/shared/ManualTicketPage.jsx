import { managerService } from '../../services/manager/managerService'
import { authMode } from '../../services/auth/mode'
import { EngineerManualTicketApi } from '../engineer/api/EngineerManualTicketApi'
import { Building2, CircleCheckBig, UserRound } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { mockEmployeeOptionsService } from '../../services/mock/mockEmployeeOptionsService'
import { mockFaultCategoryService } from '../../services/mock/mockFaultCategoryService'
import { mockTechnicianService } from '../../services/mock/mockTechnicianService'
import { mockTicketService } from '../../services/mock/mockTicketService'
import { useAuth } from '../auth/useAuth'
import { deriveTicketTitle } from '../../services/tickets/deriveTicketTitle'

const initialForm = { requesterType: 'employee', reporterName: '', department: '', managementPosition: '', category: '', subcategory: '', description: '', assignedTechnicianId: '' }

function MockManualTicketPage() {
  const { user } = useAuth()
  const listId = useId()
  const inputRef = useRef(null)
  const [form, setForm] = useState(initialForm)
  const [createdTicket, setCreatedTicket] = useState(null)
  const [assignmentFailed, setAssignmentFailed] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [employeePage, setEmployeePage] = useState(1)
  const [selectedEmployee, setSelectedEmployee] = useState(null)
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const employeeOptions = mockEmployeeOptionsService.query(search, employeePage)
  const categories = mockFaultCategoryService.getActive()
  const assignableEngineers = user.role === 'manager' ? mockTechnicianService.getTechnicians().filter((engineer) => engineer.active) : []
  const selectedCategory = categories.find((category) => category.name === form.category)

  const updateField = ({ target }) => {
    if (target.name === 'requesterType') { setSelectedEmployee(null); setSearch(''); setEmployeePage(1); setOpen(false); setActiveIndex(-1) }
    setForm((current) => ({
    ...current,
    [target.name]: target.value,
    ...(target.name === 'category' ? { subcategory: '' } : {}),
    ...(target.name === 'requesterType' ? { department: '', managementPosition: '' } : {}),
    }))
  }
  const clearEmployee = () => { setSelectedEmployee(null); setSearch(''); setEmployeePage(1); setActiveIndex(-1) }
  const chooseEmployee = (employee) => { setSelectedEmployee(employee); setOpen(false); setActiveIndex(-1); setError('') }
  const searchEmployee = (event) => { setSearch(event.target.value); setSelectedEmployee(null); setEmployeePage(1); setActiveIndex(-1); setOpen(true); setError('') }
  const onEmployeeKeyDown = (event) => {
    if (event.key === 'Escape') { setOpen(false); return }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault(); setOpen(true)
      if (employeeOptions.items.length) setActiveIndex((index) => event.key === 'ArrowDown' ? (index + 1) % employeeOptions.items.length : (index <= 0 ? employeeOptions.items.length - 1 : index - 1))
    }
    if (event.key === 'Enter' && open && activeIndex >= 0 && employeeOptions.items[activeIndex]) { event.preventDefault(); chooseEmployee(employeeOptions.items[activeIndex]) }
  }

  const submit = (event) => {
    event.preventDefault()
    setError('')
    if (form.requesterType === 'employee' && !selectedEmployee) { setError('يرجى اختيار الموظف من القائمة.'); return }
    if (form.assignedTechnicianId && !assignableEngineers.some((engineer) => engineer.id === form.assignedTechnicianId)) {
      setError('المهندس المحدد غير نشط. اختر مهندسًا نشطًا أو اترك البلاغ دون إسناد.')
      return
    }
    const ticket = mockTicketService.create({
      reporterAccountId: null,
      reporterName: form.requesterType === 'employee' ? selectedEmployee.fullName : form.reporterName.trim(),
      department: form.requesterType === 'employee' ? selectedEmployee.departmentName : null,
      reporterEmployeeId: form.requesterType === 'employee' ? selectedEmployee.id : null,
      requesterType: form.requesterType,
      managementPosition: form.requesterType === 'top_management' ? form.managementPosition.trim() : '',
      title: deriveTicketTitle(form.description),
      category: form.category,
      subcategory: form.subcategory,
      description: form.description.trim(),
      source: 'manual',
      createdByAccountId: user.id,
      createdByName: user.name,
      createdByRole: user.role,
    })
    if (!ticket) { setError('تعذر إنشاء البلاغ. راجع البيانات وحاول مرة أخرى.'); return }
    const assignedTicket = form.assignedTechnicianId && user.role === 'manager'
      ? mockTicketService.assign(ticket.id, form.assignedTechnicianId, { id: user.id, name: user.name })
      : null
    setCreatedTicket(assignedTicket || ticket)
    setAssignmentFailed(Boolean(form.assignedTechnicianId && !assignedTicket))
    setForm(initialForm)
    clearEmployee(); setOpen(false)
  }

  return <div className="mx-auto max-w-5xl">
    <div className="page-heading"><div><p className="eyebrow">التسجيل من خارج البوابة</p><h1>إنشاء بلاغ يدوي</h1><p>سجّل بلاغًا ورد إلى فريق تكنولوجيا المعلومات هاتفيًا أو بصورة مباشرة، وحدّد بوضوح ما إذا كان لصالح موظف أو الإدارة العليا.</p></div></div>

    {createdTicket && <div role="status" className="mb-6 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100"><CircleCheckBig className="mt-0.5 shrink-0" size={21} /><div><strong className="block">تم إنشاء البلاغ اليدوي بنجاح</strong><p className="mt-1 text-sm">رقم البلاغ: {createdTicket.id}. {assignmentFailed ? 'تعذر إسناده للمهندس المختار، لكنه محفوظ دون إسناد ويمكن إسناده لاحقًا.' : createdTicket.assignedTechnicianId ? `تم إسناده إلى ${createdTicket.assignedTechnician}.` : 'البلاغ غير مسند ويمكن إسناده لاحقًا.'}</p></div></div>}

    {error && <p role="alert" className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">{error}</p>}

    <form onSubmit={submit} className="content-card">
      <fieldset><legend className="field-label">البلاغ مسجل لصالح *</legend><div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className={`flex cursor-pointer gap-3 rounded-2xl border p-4 ${form.requesterType === 'employee' ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' : 'border-border bg-canvas'}`}><input type="radio" name="requesterType" value="employee" checked={form.requesterType === 'employee'} onChange={updateField} className="mt-1 accent-primary-600" /><UserRound className="shrink-0 text-primary-600" size={21} /><span><strong className="block text-ink">موظف</strong><small className="mt-1 block text-muted">بلاغ لصالح موظف بأحد أقسام المركز</small></span></label>
        <label className={`flex cursor-pointer gap-3 rounded-2xl border p-4 ${form.requesterType === 'top_management' ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' : 'border-border bg-canvas'}`}><input type="radio" name="requesterType" value="top_management" checked={form.requesterType === 'top_management'} onChange={updateField} className="mt-1 accent-primary-600" /><Building2 className="shrink-0 text-primary-600" size={21} /><span><strong className="block text-ink">الإدارة العليا</strong><small className="mt-1 block text-muted">بلاغ وارد من أحد أعضاء الإدارة العليا</small></span></label>
      </div></fieldset>

      <div className="form-grid mt-7">
        {form.requesterType === 'employee' ? <>
          <div className="relative" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false) }}>
            <label className="field-label" htmlFor="manual-mock-employee-search">اسم الموظف *</label>
            <div className="flex gap-2"><input ref={inputRef} id="manual-mock-employee-search" role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={open ? listId : undefined} aria-activedescendant={open && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined} value={selectedEmployee ? selectedEmployee.fullName : search} onChange={searchEmployee} onFocus={() => setOpen(true)} onKeyDown={onEmployeeKeyDown} className="field-input min-w-0" placeholder="ابحث بالاسم واختر من النتائج" autoComplete="off" maxLength={200} required />{(selectedEmployee || search) && <Button type="button" variant="secondary" onClick={() => { clearEmployee(); setOpen(true); inputRef.current?.focus() }} aria-label="مسح اختيار الموظف">مسح</Button>}</div>
            {open && <div className="absolute inset-x-0 top-full z-30 mt-2 rounded-xl border border-border bg-surface p-2 shadow-xl"><ul id={listId} role="listbox" aria-label="نتائج البحث عن الموظفين" className="max-h-64 overflow-y-auto">{employeeOptions.items.map((employee, index) => <li key={employee.id} id={`${listId}-${index}`} role="option" aria-selected={selectedEmployee?.id === employee.id} className={activeIndex === index ? 'rounded-lg bg-primary-50 dark:bg-primary-900/30' : ''}><button type="button" tabIndex={-1} className="w-full rounded-lg p-3 text-right text-sm text-ink hover:bg-primary-50 focus-visible:outline-2 focus-visible:outline-primary-500 dark:hover:bg-primary-900/30" onMouseDown={(event) => event.preventDefault()} onClick={() => chooseEmployee(employee)}><strong className="block">{employee.fullName}</strong><span className="text-xs text-muted">{employee.departmentName}</span></button></li>)}</ul>{!employeeOptions.items.length && <p className="p-3 text-sm text-muted">لا توجد نتائج مطابقة.</p>}<div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2"><Button type="button" variant="secondary" disabled={employeePage <= 1} onClick={() => { setEmployeePage(employeePage - 1); setActiveIndex(-1) }}>السابق</Button><span className="text-xs text-muted">صفحة {employeePage} · {employeeOptions.total} موظف</span><Button type="button" variant="secondary" disabled={employeePage * employeeOptions.pageSize >= employeeOptions.total} onClick={() => { setEmployeePage(employeePage + 1); setActiveIndex(-1) }}>التالي</Button></div></div>}
          </div>
          <label><span className="field-label">القسم *</span><input className="field-input" value={selectedEmployee?.departmentName ?? ''} placeholder="يظهر بعد اختيار الموظف" readOnly /></label>
        </> : <><label><span className="field-label">الاسم الكامل *</span><input name="reporterName" value={form.reporterName} onChange={updateField} className="field-input" placeholder="اسم عضو الإدارة العليا" required /></label><label><span className="field-label">المنصب أو المكتب *</span><input name="managementPosition" value={form.managementPosition} onChange={updateField} className="field-input" placeholder="مثال: مكتب المدير التنفيذي" required /></label></>}
        <label><span className="field-label">تصنيف العطل *</span><select name="category" value={form.category} onChange={updateField} className="field-input" required><option value="" disabled>اختر التصنيف</option>{categories.map((category) => <option key={category.id} value={category.name}>{category.name}</option>)}</select></label>
        <label className={!selectedCategory ? 'dependent-field-disabled' : undefined}><span className="field-label">التصنيف الفرعي</span><select name="subcategory" value={form.subcategory} onChange={updateField} className="field-input" disabled={!selectedCategory}><option value="">{selectedCategory ? 'بدون تصنيف فرعي' : 'اختر التصنيف أولًا'}</option>{selectedCategory?.subcategories.filter((subcategory) => subcategory.active).map((subcategory) => <option key={subcategory.id} value={subcategory.name}>{subcategory.name}</option>)}</select></label>
      </div>
      <label className="mt-5 block"><span className="field-label">تفاصيل المشكلة *</span><textarea name="description" value={form.description} onChange={updateField} className="field-textarea" placeholder="اكتب تفاصيل البلاغ كما وردت إلى فريق تكنولوجيا المعلومات" required /></label>
      {user.role === 'manager' && <label className="mt-5 block"><span className="field-label">إسناد إلى مهندس (اختياري)</span><select name="assignedTechnicianId" value={form.assignedTechnicianId} onChange={updateField} className="field-input"><option value="">دون إسناد الآن</option>{assignableEngineers.map((engineer) => <option key={engineer.id} value={engineer.id}>{engineer.name}{engineer.available === false ? ' — غير متاح مؤقتًا' : ''}</option>)}</select><span className="mt-2 block text-xs leading-6 text-muted">يمكنك إسناد البلاغ إلى مهندس نشط حتى لو كان غير متاح مؤقتًا، أو تركه دون إسناد الآن.</span></label>}
      <div className="mt-6 flex flex-wrap items-center gap-3"><Button type="submit">إنشاء البلاغ اليدوي</Button></div>
    </form>
  </div>
}

export function ManualTicketPage() {const {user}=useAuth();return authMode === 'api' ? <EngineerManualTicketApi service={user.role==='manager'?managerService:undefined} managerMode={user.role==='manager'}/> : <MockManualTicketPage/>}
