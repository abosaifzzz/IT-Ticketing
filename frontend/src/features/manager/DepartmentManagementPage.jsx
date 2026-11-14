import {authMode} from '../../services/auth/mode'
import {DepartmentManagementApi} from './api/DepartmentManagementApi'
import { Building2, CheckCircle2, Pencil, Plus, Search } from 'lucide-react'
import { useReducer, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { mockDepartmentService } from '../../services/mock/mockDepartmentService'
import { mockTicketService } from '../../services/mock/mockTicketService'

function MockDepartmentManagementPage() {
  const [search, setSearch] = useState('')
  const [editor, setEditor] = useState(null)
  const [, refresh] = useReducer((value) => value + 1, 0)
  const departments = mockDepartmentService.search(search)
  const tickets = mockTicketService.getAll()

  const save = (event) => {
    event.preventDefault()
    const result = editor.id ? mockDepartmentService.update(editor.id, editor.name) : mockDepartmentService.add(editor.name)
    if (result) { setEditor(null); refresh() }
  }
  const toggle = (department) => {
    const action = department.active ? 'تعطيل' : 'تفعيل'
    if (window.confirm(`هل تريد ${action} قسم «${department.name}»؟ ستحتفظ التذاكر السابقة باسم القسم.`)) { mockDepartmentService.setActive(department.id, !department.active); refresh() }
  }

  return <div className="mx-auto max-w-6xl">
    <div className="page-heading"><div><p className="eyebrow">البيانات الأساسية</p><h1>إدارة الأقسام</h1><p>أدر أقسام المركز المشتركة المستخدمة في نماذج الدعم مع الحفاظ على بيانات التذاكر السابقة.</p></div><Button onClick={() => setEditor({ id: null, name: '' })}><Plus size={18} />إضافة قسم</Button></div>
    <div className="content-card mb-6"><label><span className="field-label">البحث في الأقسام</span><span className="relative block"><Search size={18} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-muted" /><input value={search} onChange={(event) => setSearch(event.target.value)} className="field-input pr-11" placeholder="اسم القسم" /></span></label></div>
    {editor && <form onSubmit={save} className="content-card mb-6"><h2 className="text-lg font-extrabold text-ink">{editor.id ? 'تعديل القسم' : 'إضافة قسم جديد'}</h2><div className="mt-4 flex flex-col gap-3 sm:flex-row"><label className="flex-1"><span className="field-label">اسم القسم</span><input autoFocus value={editor.name} onChange={(event) => setEditor((current) => ({ ...current, name: event.target.value }))} className="field-input" required /></label><div className="flex items-end gap-3"><Button type="submit" disabled={!editor.name.trim()}><CheckCircle2 size={18} />حفظ</Button><Button type="button" variant="secondary" onClick={() => setEditor(null)}>إلغاء</Button></div></div></form>}

    {departments.length ? <><div className="table-wrap hidden md:block"><table className="data-table"><thead><tr><th>القسم</th><th>التذاكر المرتبطة</th><th>الحالة</th><th>الإجراءات</th></tr></thead><tbody>{departments.map((department) => <tr key={department.id}><td>{department.name}</td><td>{tickets.filter((ticket) => ticket.department === department.name).length}</td><td><span className={`rounded-full px-2.5 py-1 text-xs font-extrabold ${department.active ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200' : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300'}`}>{department.active ? 'نشط' : 'غير نشط'}</span></td><td><div className="flex gap-4"><button type="button" onClick={() => setEditor({ id: department.id, name: department.name })} className="font-extrabold text-primary-600">تعديل</button><button type="button" onClick={() => toggle(department)} className="font-extrabold text-primary-600">{department.active ? 'تعطيل' : 'تفعيل'}</button></div></td></tr>)}</tbody></table></div><div className="grid gap-4 sm:grid-cols-2 md:hidden">{departments.map((department) => <article key={department.id} className="content-card"><div className="flex items-start justify-between gap-3"><span className="grid size-10 place-items-center rounded-xl bg-primary-50 text-primary-600 dark:bg-primary-900/30"><Building2 size={20} /></span><span className="status-pill">{department.active ? 'نشط' : 'غير نشط'}</span></div><h2 className="mt-4 font-extrabold text-ink">{department.name}</h2><p className="mt-1 text-sm text-muted">{tickets.filter((ticket) => ticket.department === department.name).length} تذكرة مرتبطة</p><div className="mt-5 grid grid-cols-2 gap-3"><Button variant="secondary" onClick={() => setEditor({ id: department.id, name: department.name })}><Pencil size={16} />تعديل</Button><Button variant="secondary" onClick={() => toggle(department)}>{department.active ? 'تعطيل' : 'تفعيل'}</Button></div></article>)}</div></> : <section className="rounded-2xl border border-dashed border-border bg-surface p-10 text-center"><Building2 className="mx-auto text-primary-300" size={40} /><h2 className="mt-4 font-extrabold text-ink">لا توجد أقسام مطابقة</h2></section>}
  </div>
}

export function DepartmentManagementPage(){return authMode === 'api' ? <DepartmentManagementApi/> : <MockDepartmentManagementPage/>}
