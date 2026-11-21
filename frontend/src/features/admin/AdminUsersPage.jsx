import { useState } from 'react'
import { Button } from '../../components/ui/Button'
import { adminService } from '../../services/administration/adminService'
import { authService } from '../../services/auth/authService'
import { useApiQuery } from '../../services/http/useApiQuery'
import { useAuth } from '../auth/useAuth'
import { useAdminAccess } from './adminAccess'
import { AdminActionDialog } from './AdminActionDialog'
import { toast } from '../../services/feedback/toastService'

const roles = { employee: 'موظف', engineer: 'مهندس تكنولوجيا المعلومات', technician: 'مهندس تكنولوجيا المعلومات', manager: 'مدير تكنولوجيا المعلومات', admin: 'مسؤول النظام' }
const statusLabel = { NOT_PROVISIONED: 'لم تُهيأ كلمة مرور', CHANGE_REQUIRED: 'يلزم تغيير كلمة المرور', SET: 'كلمة المرور مُعدة' }
const date = (value) => value ? new Date(value).toLocaleString('ar-EG') : 'غير متاح'
const activeDepartments = (record) => (record?.departments ?? []).filter((item) => item.isActive).map((item) => item.id)

export function AdminUsersPage() {
  const granted = useAdminAccess()
  const { user } = useAuth()
  const [search, setSearch] = useState(''), [role, setRole] = useState(''), [activity, setActivity] = useState(''), [page, setPage] = useState(1)
  const [newUser, setNewUser] = useState({ username: '', fullName: '', role: 'employee', email: '' })
  const [selected, setSelected] = useState(null)
  const [edit, setEdit] = useState(null)
  const [reason, setReason] = useState(''), [targetRole, setTargetRole] = useState('employee')
  const [adminPassword, setAdminPassword] = useState(''), [confirmAdminPassword, setConfirmAdminPassword] = useState('')
  const [pending, setPending] = useState(null)
  // Success and error feedback is shown as toasts; empty messages are ignored.
  const setError = (message) => { if (message) toast.error(message) }
  const setNotice = (message) => { if (message) toast.success(message) }
  const filters = { search, role, isActive: activity, page, pageSize: 25 }
  const users = useApiQuery(`admin-users:${JSON.stringify(filters)}`, (signal) => adminService.users(filters, signal))
  const counts = useApiQuery('admin-user-counts', (signal) => adminService.dashboard(signal))
  const departments = useApiQuery('admin-user-departments', (signal) => authService.setupOptions(signal))
  const activeIds = new Set((departments.data?.items ?? []).map((item) => item.id))
  const setFilter = (setter, value) => { setter(value); setPage(1) }
  const open = async (row) => {
    setError(''); setNotice(''); setSelected(null); setEdit(null)
    try { const detail = (await adminService.user(row.id)).item; setSelected(detail); setEdit({ fullName: detail.fullName, username: detail.username ?? '', phone: detail.phone ?? '', departmentIds: activeDepartments(detail), isActive: detail.isActive }); setTargetRole(detail.role === 'technician' ? 'engineer' : detail.role); setReason(''); setAdminPassword(''); setConfirmAdminPassword('') }
    catch (failure) { setError(failure.message) }
  }
  const refresh = async (id = selected?.id) => {
    await Promise.all([users.refresh(), counts.refresh()])
    if (id) { const detail = (await adminService.user(id)).item; setSelected(detail); setEdit({ fullName: detail.fullName, username: detail.username ?? '', phone: detail.phone ?? '', departmentIds: activeDepartments(detail), isActive: detail.isActive }); setTargetRole(detail.role === 'technician' ? 'engineer' : detail.role) }
  }
  const action = (work, message, confirmation, targetId = selected?.id, messages = {}) => {
    if (pending) return
    setError(''); setNotice('')
    setPending({ work, message, confirmation, targetId, messages })
  }
  const confirmAction = async (password) => {
    if (!pending) return
    try {
      await adminService.reauthenticate(password)
      const result = await pending.work()
      setReason(''); setAdminPassword(''); setConfirmAdminPassword('')
      setPending(null)
      setNotice(typeof pending.message === 'function' ? pending.message(result) : pending.message)
      try { await refresh(pending.targetId) } catch (failure) { setError(`حُفظ الإجراء، لكن تعذر تحديث القائمة: ${failure.message}`) }
    } catch (failure) {
      const message = failure.status === 409 ? pending.messages.conflict ?? failure.message : failure.status === 400 ? pending.messages.invalid ?? failure.message : failure.message
      throw Object.assign(new Error(message), { status: failure.status })
    }
  }
  const create = (event) => {
    event.preventDefault()
    if (!newUser.username.trim() || newUser.fullName.trim().length < 2) { setError('أدخل اسم مستخدم فريدًا والاسم الكامل.'); return }
    const body = { username: newUser.username.trim(), fullName: newUser.fullName.trim(), role: newUser.role, ...(newUser.email.trim() ? { email: newUser.email.trim() } : {}) }
    action(async () => { await adminService.createUser(body); setNewUser({ username: '', fullName: '', role: 'employee', email: '' }) }, body.role === 'admin' ? 'أُنشئ حساب المسؤول معطلًا. تهيئته تتطلب إجراءً خاصًا.' : 'أُنشئ الحساب. يلزم إكمال إعداد كلمة المرور والملف الشخصي عند أول دخول.', 'تأكيد إنشاء الحساب؟', null)
  }
  const saveUser = () => {
    if (!selected || !edit?.username.trim() || edit.fullName.trim().length < 2) { setError('تحقق من اسم المستخدم والاسم الكامل.'); return }
    const nextRole = targetRole === 'engineer' ? 'technician' : targetRole
    const roleChanged = nextRole !== selected.role
    const profileChanged = edit.phone.trim() !== (selected.phone ?? '') || JSON.stringify([...edit.departmentIds].sort()) !== JSON.stringify([...activeDepartments(selected)].sort())
    const changes = {
      ...(edit.username.trim() !== selected.username ? { username: edit.username.trim() } : {}),
      ...(edit.fullName.trim() !== selected.fullName ? { fullName: edit.fullName.trim() } : {}),
      ...(edit.isActive !== selected.isActive ? { isActive: edit.isActive } : {}),
      ...(profileChanged ? { phone: edit.phone.trim(), departmentIds: edit.departmentIds } : {}),
      // The server audit trail requires a reason; the Admin no longer types one, so a fixed description is recorded.
      ...(roleChanged ? { role: nextRole, reason: `تغيير الدور إلى «${roles[nextRole]}» من لوحة مسؤول النظام`, ...(nextRole === 'admin' ? { adminPassword } : {}) } : {}),
    }
    if (!Object.keys(changes).length) { toast.info('لا توجد تغييرات للحفظ.'); return }
    if (roleChanged && selected.id === user.id) { setError('لا يمكن تغيير دور حسابك أثناء جلستك. استخدم حساب مسؤول آخر.'); return }
    if (roleChanged && nextRole === 'admin' && (adminPassword.length < 16 || adminPassword !== confirmAdminPassword)) { setError('ترقية مسؤول النظام تتطلب كلمة مرور جديدة من ١٦ حرفًا على الأقل مع تأكيد مطابق.'); return }
    if (profileChanged && (!edit.departmentIds.length || edit.departmentIds.some((id) => !activeIds.has(id)))) { setError('اختر قسمًا نشطًا واحدًا على الأقل وأدخل رقم هاتف صحيحًا.'); return }
    if (selected.id === user.id && (profileChanged || changes.username)) { setError('لتعديل بيانات حسابك استخدم صفحة «ملفي الشخصي» حتى لا تنتهي جلسة الإدارة.'); return }
    if (selected.role === 'admin' && selected.isActive && (edit.isActive === false || roleChanged) && counts.data?.activeAdmins <= 1) { setError('لا يمكن تعطيل أو تغيير دور آخر مسؤول نظام نشط.'); return }
    action(() => adminService.updateUser(selected.id, changes), 'حُفظت جميع تعديلات الحساب على الخادم.', 'حفظ جميع التغييرات؟ قد تُلغى جلسات هذا الحساب.', selected.id, { conflict: 'تعارضت التغييرات مع بيانات الحساب الحالية أو حماية آخر مسؤول نظام. حدّث الحساب وحاول مجددًا.', invalid: 'تحقق من الحقول، القسم، رقم الهاتف، وسبب تغيير الدور أو كلمة مرور المسؤول الجديد.' })
  }
  const resetPassword = () => {
    if (!selected) return
    if (selected.role === 'admin') {
      if (!reason.trim()) { setError('أدخل سبب طلب استعادة حساب المسؤول.'); return }
      action(() => adminService.requestPasswordReset(selected.id, { reason: reason.trim() }), (result) => `سُجل طلب استعادة حساب المسؤول رقم ${result.item.id}. لم تتغير كلمة المرور بعد. سلّم رقم الطلب إلى مشغل الخادم الموثوق.`, 'تأكيد طلب استعادة حساب المسؤول؟')
    } else action(() => adminService.resetTemporaryPassword(selected.id), 'أُعيد تعيين كلمة المرور المؤقتة، وأُلغيت جلسات الحساب. يجب تغييرها عند أول دخول.', 'تأكيد إعادة تعيين كلمة المرور المؤقتة وإلغاء الجلسات؟')
  }
  return <div><div className="page-heading"><div><p className="eyebrow">إدارة النظام</p><h1>حسابات المستخدمين</h1><p>حسابات الدخول منفصلة عن دليل الموظفين. لا تُعرض كلمات المرور هنا.</p></div><Button variant="secondary" onClick={() => refresh()}>تحديث</Button></div>
    {granted.has('admin.users.create') && <form className="content-card mb-4" onSubmit={create}><h2 className="mb-3 font-bold text-ink">إضافة حساب</h2><div className="form-grid"><label><span className="field-label">اسم المستخدم *</span><input className="field-input" required maxLength={100} value={newUser.username} onChange={(e) => setNewUser({ ...newUser, username: e.target.value })} /></label><label><span className="field-label">الاسم الكامل *</span><input className="field-input" required minLength={2} value={newUser.fullName} onChange={(e) => setNewUser({ ...newUser, fullName: e.target.value })} /></label><label><span className="field-label">البريد الإلكتروني — اختياري</span><input className="field-input" type="email" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} /></label><label><span className="field-label">الدور *</span><select className="field-input" value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}>{['employee', 'engineer', 'manager', 'admin'].map((value) => <option key={value} value={value}>{roles[value]}</option>)}</select></label></div><p className="mt-3 text-sm text-muted">حسابات الموظف والمهندس والمدير تتطلب إعدادًا عند أول دخول. حساب مسؤول النظام لا يُفعّل إلا بإجراء تهيئة خاص.</p><Button className="mt-3" type="submit" disabled={Boolean(pending)}>إنشاء الحساب</Button></form>}
    <section className="content-card mb-4"><h2 className="mb-3 font-bold text-ink">البحث والتصفية</h2><div className="form-grid"><label><span className="field-label">الاسم أو اسم المستخدم</span><input className="field-input" value={search} onChange={(e) => setFilter(setSearch, e.target.value)} /></label><label><span className="field-label">الدور</span><select className="field-input" value={role} onChange={(e) => setFilter(setRole, e.target.value)}><option value="">كل الأدوار</option>{['employee', 'technician', 'manager', 'admin'].map((value) => <option key={value} value={value}>{roles[value]}</option>)}</select></label><label><span className="field-label">الحالة</span><select className="field-input" value={activity} onChange={(e) => setFilter(setActivity, e.target.value)}><option value="">كل الحالات</option><option value="true">نشط</option><option value="false">معطل</option></select></label></div></section>
    {users.error ? <p role="alert" className="content-card">{users.error.message} <Button onClick={() => users.refresh()}>إعادة المحاولة</Button></p> : users.status === 'loading' ? <p role="status" className="content-card">جارٍ تحميل الحسابات...</p> : <><p className="mb-3 text-sm text-muted">{users.data.total} حساب مطابق</p><div className="table-wrap"><table className="data-table"><thead><tr><th>الحساب</th><th>الدور</th><th>الحالة والإعداد</th><th>آخر دخول</th><th>الإجراء</th></tr></thead><tbody>{users.data.items.map((row) => <tr key={row.id}><td><strong>{row.fullName}</strong><small className="block text-muted">{row.username || row.email || 'غير متاح'}</small><small className="block text-muted">{row.phone || 'هاتف غير متاح'} · {(row.departments ?? []).map((item) => item.name).join('، ') || 'قسم غير متاح'}</small></td><td>{roles[row.role]}</td><td>{row.isActive ? 'نشط' : 'معطل'}<small className="block text-muted">{statusLabel[row.passwordStatus] || 'غير متاح'} · {row.mustCompleteProfile ? 'الملف غير مكتمل' : 'الملف مكتمل'}</small></td><td>{date(row.lastLoginAt)}</td><td><Button variant="secondary" onClick={() => open(row)}>إدارة</Button></td></tr>)}</tbody></table></div>{!users.data.items.length && <p className="content-card text-muted">لا توجد حسابات مطابقة.</p>}<nav className="mt-4 flex items-center gap-3" aria-label="صفحات الحسابات"><Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>السابق</Button><span>صفحة {page}</span><Button variant="secondary" disabled={page * (users.data.pageSize ?? 25) >= users.data.total} onClick={() => setPage(page + 1)}>التالي</Button></nav></>}
    {selected && edit && <section className="content-card mt-5" aria-label="إدارة الحساب المحدد"><div className="flex flex-wrap justify-between gap-3"><h2 className="font-bold text-ink">{selected.fullName} · {roles[selected.role]}</h2><Button variant="secondary" onClick={() => { setSelected(null); setEdit(null) }}>إغلاق</Button></div><p className="mt-2 text-sm text-muted">آخر دخول: {date(selected.lastLoginAt)} · الحالة: {selected.isActive ? 'نشط' : 'معطل'} · {statusLabel[selected.passwordStatus] || 'غير متاح'}</p>
      <div className="form-grid mt-4"><label><span className="field-label">الاسم الكامل</span><input className="field-input" value={edit.fullName} onChange={(e) => setEdit({ ...edit, fullName: e.target.value })} /></label><label><span className="field-label">اسم المستخدم</span><input className="field-input" value={edit.username} onChange={(e) => setEdit({ ...edit, username: e.target.value })} /></label><label><span className="field-label">رقم الهاتف</span><input className="field-input" type="tel" dir="ltr" maxLength={32} value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></label><label><span className="field-label">الدور</span><select className="field-input" value={targetRole} onChange={(e) => setTargetRole(e.target.value)}>{['employee', 'engineer', 'manager', 'admin'].map((value) => <option key={value} value={value}>{roles[value]}</option>)}</select></label><label><span className="field-label">حالة الحساب</span><select className="field-input" value={String(edit.isActive)} onChange={(e) => setEdit({ ...edit, isActive: e.target.value === 'true' })}><option value="true">نشط</option><option value="false">معطل</option></select></label></div>
      {targetRole === 'admin' && selected.role !== 'admin' && <div className="form-grid mt-4"><label><span className="field-label">كلمة مرور مسؤول النظام الجديد *</span><input className="field-input" type="password" autoComplete="new-password" minLength={16} value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} /></label><label><span className="field-label">تأكيد كلمة المرور الجديدة *</span><input className="field-input" type="password" autoComplete="new-password" minLength={16} value={confirmAdminPassword} onChange={(e) => setConfirmAdminPassword(e.target.value)} /></label><p className="text-sm text-muted sm:col-span-2">١٦ حرفًا على الأقل. سلّم كلمة المرور للمسؤول الجديد بطريقة خاصة؛ لن يعرضها النظام بعد الحفظ.</p></div>}
      <fieldset className="mt-4"><legend className="field-label">الأقسام النشطة</legend><div className="mt-2 max-h-48 overflow-y-auto rounded-xl border border-border p-2">{departments.data?.items.map((item) => <label key={item.id} className="flex items-center gap-2 p-2"><input type="checkbox" checked={edit.departmentIds.includes(item.id)} onChange={(e) => setEdit({ ...edit, departmentIds: e.target.checked ? [...edit.departmentIds, item.id] : edit.departmentIds.filter((id) => id !== item.id) })} />{item.name}</label>)}</div>{selected.departments?.some((item) => !item.isActive) && <p className="mt-2 text-sm text-muted">عضويات تاريخية غير نشطة: {selected.departments.filter((item) => !item.isActive).map((item) => item.name).join('، ')}</p>}</fieldset>
      {selected.role === 'admin' && (targetRole === 'admin') && <label className="mt-4 block"><span className="field-label">سبب استعادة حساب المسؤول</span><input className="field-input" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} /></label>}
      <div className="mt-4 flex flex-wrap gap-2">{granted.has('admin.users.update') && <Button disabled={Boolean(pending) || (edit.isActive === false && selected.isActive && !granted.has('admin.users.disable'))} onClick={saveUser}>حفظ تعديلات الحساب</Button>}{granted.has('admin.users.reset_password') && <Button variant="secondary" disabled={Boolean(pending) || selected.authProvider !== 'local'} onClick={resetPassword}>{selected.role === 'admin' ? 'طلب استعادة محمية' : 'إعادة تعيين كلمة مرور مؤقتة'}</Button>}{granted.has('admin.sessions.revoke') && <Button variant="secondary" disabled={Boolean(pending)} onClick={() => action(() => adminService.revokeSessions(selected.id), 'أُلغيت جلسات الحساب.', 'إلغاء كل جلسات هذا الحساب؟')}>إلغاء الجلسات</Button>}</div></section>}
    {pending && <AdminActionDialog title="تأكيد الإجراء الإداري" description={pending.confirmation} confirmLabel="تحقق ونفّذ" destructive onConfirm={confirmAction} onClose={() => setPending(null)} />}
  </div>
}
