import { useRef, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { authService } from '../../services/auth/authService'
import { requiresAccountSetup } from '../../services/auth/roles'
import { TEMPORARY_PASSWORD, validateProfileForm } from '../../services/auth/profileValidation'
import { toast } from '../../services/feedback/toastService'
import { themeService } from '../../services/preferences/themeService'
import { useApiQuery } from '../../services/http/useApiQuery'
import { useAuth } from './useAuth'
import { SessionStatus } from './SessionStatus'

export function AccountProfilePage({ setup = false }) {
  const auth = useAuth()
  if (auth.status !== 'ready') return <SessionStatus />
  if (!auth.isAuthenticated) return <Navigate to="/login" replace />
  const required = requiresAccountSetup(auth.user)
  if (!setup && required) return <Navigate to="/setup" replace />
  if (setup && !required) return <Navigate to="/profile" replace />
  return <ProfileEditor auth={auth} setup={setup} />
}

function ProfileEditor({ auth, setup }) {
  const navigate = useNavigate()
  const lock = useRef(false)
  const [form, setForm] = useState(null)
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)
  // Feedback is shown as toasts; empty messages (used to clear) are ignored.
  const setError = (message) => { if (message) toast.error(message) }
  const setNotice = (message) => { if (message) toast.success(message) }
  // Only shown if the server rejects the standard temporary password (e.g. a non-standard initial password).
  const [askCurrentPassword, setAskCurrentPassword] = useState(false)
  const [theme, setTheme] = useState(null)
  const profile = useApiQuery(`account-profile:${auth.user?.id}`, (signal) => authService.profile(signal))
  const options = useApiQuery('account-departments', (signal) => authService.setupOptions(signal))
  const choices = options.data?.items ?? []
  const activeIds = new Set(choices.map((item) => item.id))
  const source = form ?? { phone: profile.data?.phone ?? '', departmentIds: (profile.data?.departments ?? []).filter((item) => item.isActive && activeIds.has(item.id)).map((item) => item.id), currentPassword: '', newPassword: '', confirmPassword: '' }
  const historical = (profile.data?.departments ?? []).filter((item) => !item.isActive)
  const change = (field, value) => { setForm({ ...source, [field]: value }) }
  const submit = async (event) => {
    event.preventDefault()
    if (lock.current) return
    const phone = source.phone.trim()
    const departmentIds = source.departmentIds
    const currentPassword = askCurrentPassword ? source.currentPassword : TEMPORARY_PASSWORD
    const validationError = validateProfileForm({ ...source, currentPassword, phone }, activeIds, { setup, role: auth.user.role })
    if (validationError) { setError(validationError); return }
    lock.current = true; setBusy(true)
    try {
      if (setup) {
        const result = await authService.completeSetup({ currentPassword, newPassword: source.newPassword, phone, departmentIds })
        if (!result?.setupCompleted || !result?.loginRequired) throw new Error('تعذر تأكيد إكمال الإعداد. حاول مجددًا.')
        auth.clearSession()
        // The backend revokes the setup session. Reloading restores that server-owned
        // state before the login page renders, and the non-sensitive URL flag keeps
        // the sign-in instruction visible after the redirect.
        window.location.replace('/login?setup=complete')
      } else {
        await authService.updateProfile({ phone, departmentIds })
        setNotice('حُفظت بيانات الملف الشخصي.')
        await profile.refresh()
      }
    } catch (failure) {
      if (setup && failure.status === 401 && !askCurrentPassword) { setAskCurrentPassword(true); setError('لم تُقبل كلمة المرور المؤقتة الافتراضية. أدخل كلمة المرور التي سجلت بها الدخول ثم أعد المحاولة.'); return }
      setError(failure.status === 400 ? 'تعذر اعتماد البيانات. تحقق من رقم الهاتف والأقسام النشطة وكلمة المرور الجديدة.' : failure.message)
    }
    finally { lock.current = false; setBusy(false) }
  }
  const logout = async () => { if (busy) return; try { await auth.logout(); navigate('/login', { replace: true }) } catch (failure) { setError(failure.message) } }
  return <main dir="rtl" className="min-h-screen bg-canvas p-4 text-ink sm:p-8">
    <div className="mx-auto max-w-3xl">
      <header className="content-card flex flex-wrap items-center justify-between gap-3"><img src="/brand/fayoum-oncology-center-logo.jpg" alt="شعار مركز أورام الفيوم" className="h-16 w-44 rounded-lg bg-white object-contain" /><div className="flex gap-2"><Button type="button" variant="secondary" onClick={() => setTheme(themeService.toggle())} aria-label={`تبديل المظهر ${theme ?? ''}`}>تبديل المظهر</Button><Button type="button" variant="secondary" onClick={logout}>تسجيل الخروج</Button></div></header>
      <section className="content-card mt-5"><h1 className="text-2xl font-extrabold">{setup ? 'إكمال إعداد الحساب' : 'ملفي الشخصي'}</h1><p className="mt-2 text-sm text-muted">{setup ? 'غيّر كلمة المرور وأكمل بيانات التواصل والقسم قبل استخدام النظام.' : 'يمكنك تعديل رقم الهاتف والأقسام المرتبطة بحسابك.'}</p>
        {profile.status === 'loading' || options.status === 'loading' ? <p role="status" className="mt-5">جارٍ تحميل البيانات...</p> : profile.error || options.error ? <div className="mt-5" role="alert"><p>{profile.error?.message ?? options.error?.message}</p><Button type="button" className="mt-2" onClick={() => { profile.refresh(); options.refresh() }}>إعادة المحاولة</Button></div> : <form className="mt-6 space-y-5" onSubmit={submit} noValidate aria-busy={busy}>
          <div className="form-grid"><label><span className="field-label">الاسم الكامل</span><input className="field-input" value={profile.data?.fullName ?? auth.user.name} readOnly /></label><label><span className="field-label">اسم المستخدم</span><input className="field-input" value={profile.data?.username ?? auth.user.username} readOnly dir="ltr" /></label></div>
          {setup && <div className="form-grid">{askCurrentPassword && <label><span className="field-label">كلمة المرور التي سجلت بها الدخول *</span><input className="field-input" type="password" autoComplete="current-password" value={source.currentPassword} onChange={(e) => change('currentPassword', e.target.value)} required autoFocus /></label>}<label><span className="field-label">كلمة المرور الجديدة *</span><input className="field-input" type="password" autoComplete="new-password" value={source.newPassword} onChange={(e) => change('newPassword', e.target.value)} required /></label><label><span className="field-label">تأكيد كلمة المرور الجديدة *</span><input className="field-input" type="password" autoComplete="new-password" value={source.confirmPassword} onChange={(e) => change('confirmPassword', e.target.value)} required /></label></div>}
          <label className="block"><span className="field-label">رقم الهاتف *</span><input className="field-input" type="tel" dir="ltr" autoComplete="tel" maxLength={32} value={source.phone} onChange={(e) => change('phone', e.target.value)} required /></label>
          <fieldset><legend className="field-label">الأقسام النشطة * — يمكن اختيار أكثر من قسم</legend><input className="field-input mt-2" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث عن قسم" aria-label="البحث عن قسم" /><div className="mt-2 max-h-56 overflow-y-auto rounded-xl border border-border p-2">{choices.filter((item) => item.name.includes(search.trim())).map((item) => <label key={item.id} className="flex items-center gap-3 rounded-lg p-2 hover:bg-primary-50 dark:hover:bg-primary-900/20"><input type="checkbox" checked={source.departmentIds.includes(item.id)} onChange={(e) => change('departmentIds', e.target.checked ? [...source.departmentIds, item.id] : source.departmentIds.filter((id) => id !== item.id))} /><span>{item.name}</span></label>)}{!choices.length && <p className="text-muted">لا توجد أقسام نشطة متاحة.</p>}</div></fieldset>
          {historical.length > 0 && <p className="text-sm text-muted">أقسام سابقة غير نشطة: {historical.map((item) => item.name).join('، ')}. لا يمكن اختيارها للحفظ.</p>}
          <div className="flex flex-wrap gap-3"><Button type="submit" disabled={busy || !choices.length}>{busy ? 'جارٍ الحفظ...' : setup ? 'إكمال الإعداد' : 'حفظ الملف الشخصي'}</Button>{!setup && <Link className="rounded-xl border border-border px-4 py-3 text-primary-600" to="/">العودة</Link>}</div>
        </form>}
      </section>
    </div>
  </main>
}
