import { useRef, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { authMode } from '../../services/auth/mode'
import { employeeDirectoryService } from '../../services/employees/employeeDirectoryService'
import { useApiQuery } from '../../services/http/useApiQuery'

const emptyForm = { fullName: '', departmentId: '' }

export function EmployeeDirectoryPage() {
  if (authMode === 'mock') return <section className="content-card" role="status">دليل الموظفين متاح عند الاتصال بالخادم فقط.</section>
  return <ApiEmployeeDirectoryPage />
}

function ApiEmployeeDirectoryPage() {
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [form, setForm] = useState(emptyForm)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const saving = useRef(false)
  const records = useApiQuery(`employees:${search}:${page}`, (signal) => employeeDirectoryService.list(search, page, signal))
  const departments = useApiQuery('employee-directory-departments', employeeDirectoryService.departments)

  const submit = async (event) => {
    event.preventDefault()
    if (saving.current) return
    const input = {
      fullName: form.fullName.trim(),
      departmentId: form.departmentId,
    }
    if (input.fullName.length < 2 || !input.departmentId) {
      setError('يرجى إدخال الاسم الكامل والقسم.')
      return
    }
    saving.current = true
    setBusy(true)
    setError('')
    setSuccess('')
    try {
      await employeeDirectoryService.create(input)
      setForm(emptyForm)
      setSuccess('تمت إضافة الموظف إلى الدليل.')
      setSearchInput('')
      setSearch('')
      setPage(1)
      if (search === '' && page === 1) await records.refresh()
    } catch (failure) {
      setError(failure.message)
    } finally {
      saving.current = false
      setBusy(false)
    }
  }

  return <div className="mx-auto max-w-6xl space-y-5">
    <div className="page-heading"><div><p className="eyebrow">بيانات الموظفين</p><h1>دليل الموظفين</h1><p>يمكن لمدير أو مهندس تكنولوجيا المعلومات إضافة موظف يدويًا بالاسم والقسم.</p></div></div>

    <section className="content-card" aria-labelledby="employee-add-heading">
      <h2 id="employee-add-heading" className="text-xl font-bold text-ink">إضافة موظف</h2>
      <form onSubmit={submit} className="mt-5" noValidate aria-busy={busy}>
        <div className="form-grid">
          <label><span className="field-label">الاسم الكامل *</span><input className="field-input" value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} maxLength={160} required autoComplete="off" /></label>
          <label><span className="field-label">القسم *</span><select className="field-input" value={form.departmentId} onChange={(event) => setForm({ ...form, departmentId: event.target.value })} required disabled={departments.status !== 'ready'}><option value="">اختر القسم</option>{departments.data?.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label>
        </div>
        {departments.error && <div className="mt-4"><p role="alert" className="text-red-700 dark:text-red-300">تعذر تحميل الأقسام: {departments.error.message}</p><Button type="button" variant="secondary" className="mt-2" onClick={() => departments.refresh()}>إعادة المحاولة</Button></div>}
        {error && <p role="alert" className="mt-4 text-red-700 dark:text-red-300">{error}</p>}
        {success && <p role="status" className="mt-4 text-green-700 dark:text-green-300">{success}</p>}
        <Button type="submit" className="mt-5" disabled={busy || departments.status !== 'ready'}>{busy ? 'جارٍ الإضافة...' : 'إضافة الموظف'}</Button>
      </form>
    </section>

    <section className="content-card" aria-labelledby="employee-list-heading">
      <h2 id="employee-list-heading" className="text-xl font-bold text-ink">الموظفون المسجلون</h2>
      <form onSubmit={(event) => { event.preventDefault(); setPage(1); setSearch(searchInput.trim()) }} className="mt-4 flex flex-col gap-3 sm:flex-row">
        <label className="flex-1"><span className="field-label">ابحث بالاسم</span><input className="field-input" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} maxLength={200} /></label>
        <Button type="submit" variant="secondary" className="self-end">بحث</Button>
      </form>
      {records.status === 'loading' && <p role="status" className="mt-5 text-muted">جارٍ تحميل الموظفين...</p>}
      {records.error && <div className="mt-5"><p role="alert" className="text-red-700 dark:text-red-300">{records.error.message}</p><Button type="button" variant="secondary" className="mt-2" onClick={() => records.refresh()}>إعادة المحاولة</Button></div>}
      {records.status === 'ready' && records.data?.items.length === 0 && <p className="mt-5 text-muted">{search ? 'لا توجد نتائج مطابقة.' : 'لا يوجد موظفون مسجلون بعد.'}</p>}
      {records.status === 'ready' && records.data?.items.length > 0 && <><div className="mt-5 overflow-x-auto"><table className="w-full min-w-[560px] text-right text-sm"><thead><tr className="border-b border-border text-muted"><th className="px-3 py-3">الاسم الكامل</th><th className="px-3 py-3">القسم</th></tr></thead><tbody>{records.data.items.map((employee) => <tr key={employee.id} className="border-b border-border text-ink last:border-0"><td className="px-3 py-3">{employee.fullName}</td><td className="px-3 py-3">{employee.departmentName}</td></tr>)}</tbody></table></div><div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-muted"><span>إجمالي الموظفين: {records.data.total}</span><Button type="button" variant="secondary" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>السابق</Button><span>صفحة {page} من {Math.ceil(records.data.total / records.data.pageSize)}</span><Button type="button" variant="secondary" disabled={page * records.data.pageSize >= records.data.total} onClick={() => setPage((value) => value + 1)}>التالي</Button></div></>}
    </section>
  </div>
}
