import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ROLE_DESTINATIONS } from '../../services/auth/roles'
import { useAuth } from './useAuth'
export function UnauthorizedPage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const signOut = async () => {
    if (busy) return
    setBusy(true); setError('')
    try { await logout(); navigate('/login', { replace: true }) } catch (failure) { setError(failure.message) } finally { setBusy(false) }
  }
  return <main dir="rtl" className="grid min-h-screen place-items-center bg-canvas p-5"><section className="content-card w-full max-w-lg text-center"><h1 className="text-2xl font-extrabold text-ink">لا يمكنك الوصول إلى هذه الصفحة</h1><p className="mt-4 leading-7 text-muted">هذه الصفحة غير متاحة لصلاحيات حسابك الحالي.</p>{error && <p role="alert" className="mt-4 text-red-600">{error}</p>}<div className="mt-7 flex flex-wrap justify-center gap-3"><button className="rounded-xl bg-primary-600 px-5 py-3 font-bold text-white" onClick={() => navigate(ROLE_DESTINATIONS[user.role], { replace: true })}>العودة إلى لوحة التحكم</button><button disabled={busy} className="rounded-xl border border-border px-5 py-3 font-bold text-ink disabled:opacity-60" onClick={signOut}>{busy ? 'جارٍ تسجيل الخروج...' : 'تسجيل الخروج'}</button></div></section></main>
}
