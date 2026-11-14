import {authMode} from '../../services/auth/mode'
import {EngineerManagementApi} from './api/EngineerManagementApi'
import { Pencil, Plus, Search, UserCog } from 'lucide-react'
import { useReducer, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { itStaffRoleLabels, mockTechnicianService } from '../../services/mock/mockTechnicianService'
import { mockTicketService } from '../../services/mock/mockTicketService'

const emptyForm = { id: null, name: '', username: '', role: 'technician', active: true }

function MockEngineerManagementPage() {
  const [search, setSearch] = useState('')
  const [editor, setEditor] = useState(null)
  const [error, setError] = useState('')
  const [, refresh] = useReducer((value) => value + 1, 0)
  const technicians = mockTechnicianService.search(search)
  const tickets = mockTicketService.getAll()

  const updateField = ({ target }) => setEditor((current) => ({ ...current, [target.name]: target.value }))
  const save = (event) => {
    event.preventDefault()
    const result = editor.id ? mockTechnicianService.update(editor.id, editor) : mockTechnicianService.add(editor)
    if (!result) return setError('تعذر الحفظ. تأكد من اكتمال الحقول وعدم تكرار اسم مستخدم تجريبي.')
    setEditor(null); setError(''); refresh()
  }
  const toggle = (technician) => {
    const action = technician.active ? 'تعطيل' : 'تفعيل'
    if (window.confirm(`هل تريد ${action} حساب المستخدم التجريبي «${technician.name}»؟ ستظل التذاكر السابقة محتفظة بالاسم.`)) { mockTechnicianService.setActive(technician.id, !technician.active); refresh() }
  }

  return <div className="mx-auto max-w-7xl">
    <div className="page-heading"><div><p className="eyebrow">إدارة فريق تكنولوجيا المعلومات</p><h1>إدارة مستخدمي تكنولوجيا المعلومات</h1><p>أدر حسابات المهندسين والمديرين </p></div><Button onClick={() => { setEditor(emptyForm); setError('') }}><Plus size={18} />إضافة مستخدم</Button></div>
    <div className="content-card mb-6"><label><span className="field-label">البحث في المستخدمين</span><span className="relative block"><Search size={18} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-muted" /><input value={search} onChange={(event) => setSearch(event.target.value)} className="field-input pr-11" placeholder="الاسم، اسم المستخدم أو الدور" /></span></label></div>
    {editor && <form onSubmit={save} className="content-card mb-6"><h2 className="text-lg font-extrabold text-ink">{editor.id ? 'تعديل بيانات المستخدم' : 'إضافة مستخدم تجريبي'}</h2><p className="mt-1 text-sm text-muted">اسم المستخدم للعرض التجريبي فقط. لا تتم إدارة كلمات المرور في هذه المرحلة.</p>{error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700 dark:bg-red-950/30 dark:text-red-200">{error}</p>}<div className="form-grid mt-5"><label><span className="field-label">الاسم الكامل *</span><input name="name" value={editor.name} onChange={updateField} className="field-input" required /></label><label><span className="field-label">اسم المستخدم التجريبي *</span><input name="username" dir="ltr" value={editor.username} onChange={updateField} className="field-input text-left" placeholder="example.demo" required /></label><label><span className="field-label">الدور *</span><select name="role" value={editor.role} onChange={updateField} className="field-input" required><option value="technician">{itStaffRoleLabels.technician}</option><option value="manager">{itStaffRoleLabels.manager}</option></select></label></div><div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row"><Button type="button" variant="secondary" onClick={() => setEditor(null)}>إلغاء</Button><Button type="submit">حفظ بيانات المستخدم</Button></div></form>}

    {technicians.length ? <><div className="table-wrap hidden lg:block"><table className="data-table min-w-[850px]"><thead><tr><th>الاسم</th><th>اسم المستخدم التجريبي</th><th>الدور</th><th>التذاكر المسندة</th><th>الحالة</th><th>الإجراءات</th></tr></thead><tbody>{technicians.map((technician) => <tr key={technician.id}><td>{technician.name}</td><td dir="ltr" className="text-left">{technician.username || '—'}</td><td>{technician.jobTitle}</td><td>{technician.role === 'technician' ? tickets.filter((ticket) => ticket.assignedTechnicianId === technician.id).length : '—'}</td><td><span className={`rounded-full px-2.5 py-1 text-xs font-extrabold ${technician.active ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200' : 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200'}`}>{technician.active ? 'نشط' : 'غير نشط'}</span></td><td><div className="flex gap-4"><button type="button" onClick={() => { setEditor({ ...technician }); setError('') }} className="font-extrabold text-primary-600">تعديل</button><button type="button" onClick={() => toggle(technician)} className="font-extrabold text-primary-600">{technician.active ? 'تعطيل' : 'تفعيل'}</button></div></td></tr>)}</tbody></table></div><div className="grid gap-4 sm:grid-cols-2 lg:hidden">{technicians.map((technician) => <article key={technician.id} className="content-card"><div className="flex items-start justify-between gap-3"><span className="grid size-10 place-items-center rounded-xl bg-primary-50 text-primary-600 dark:bg-primary-900/30"><UserCog size={20} /></span><span className="status-pill">{technician.active ? 'نشط' : 'غير نشط'}</span></div><h2 className="mt-4 font-extrabold text-ink">{technician.name}</h2><p className="mt-1 text-sm text-muted">{technician.jobTitle}</p><dl className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-xs text-muted">المستخدم</dt><dd dir="ltr" className="mt-1 text-right font-bold text-ink">{technician.username || '—'}</dd></div><div><dt className="text-xs text-muted">التذاكر المسندة</dt><dd className="mt-1 font-bold text-ink">{technician.role === 'technician' ? tickets.filter((ticket) => ticket.assignedTechnicianId === technician.id).length : '—'}</dd></div></dl><div className="mt-5 grid grid-cols-2 gap-3"><Button variant="secondary" onClick={() => { setEditor({ ...technician }); setError('') }}><Pencil size={16} />تعديل</Button><Button variant="secondary" onClick={() => toggle(technician)}>{technician.active ? 'تعطيل' : 'تفعيل'}</Button></div></article>)}</div></> : <section className="rounded-2xl border border-dashed border-border bg-surface p-10 text-center"><UserCog className="mx-auto text-primary-300" size={40} /><h2 className="mt-4 font-extrabold text-ink">لا توجد نتائج مطابقة</h2></section>}
  </div>
}

export function EngineerManagementPage(){return authMode === 'api' ? <EngineerManagementApi/> : <MockEngineerManagementPage/>}
