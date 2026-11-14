import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from './useAuth'
import { ROLE_DESTINATIONS } from '../../services/auth/roles'
import { portalRoutes } from '../../app/routeConfig'
import { themeService } from '../../services/preferences/themeService'

// This boundary prevents unmigrated pages/layouts from mounting mock services.
export function ApiFeatureBoundary() {
  const { user, logout } = useAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [theme, setTheme] = useState(() => themeService.getActiveTheme())
  const portal = portalRoutes.find((item) => item.role === user.role)
  const signOut = async () => {
    if (busy) return
    setBusy(true); setError('')
    try { await logout() } catch (failure) { setError(failure.message) } finally { setBusy(false) }
  }
  return <main dir="rtl" className="min-h-screen bg-canvas p-4 sm:p-8">
    <header className="content-card mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4">
      <img src="/brand/fayoum-oncology-center-logo.jpg" alt="شعار مركز أورام الفيوم" className="h-20 w-64 max-w-full rounded-xl bg-white object-contain" />
      <div className="flex flex-wrap gap-3"><button className="rounded-xl border border-border px-4 py-3 text-ink" onClick={() => setTheme(themeService.toggle())}>{theme === 'dark' ? 'الوضع النهاري' : 'الوضع الليلي'}</button>
      <button className="rounded-xl bg-primary-600 px-5 py-3 font-bold text-white disabled:opacity-60" disabled={busy} onClick={signOut}>{busy ? 'جارٍ تسجيل الخروج...' : 'تسجيل الخروج'}</button></div>
    </header>
    <section className="content-card mx-auto mt-6 max-w-5xl">
      <p className="eyebrow">تم تسجيل الدخول</p><h1 className="mt-2 text-2xl font-extrabold text-ink">{portal.label}</h1>
      <p className="mt-4 font-bold text-ink">{user.name}</p><p className="mt-1 text-muted">{user.roleLabel}</p>
      <p className="mt-6 leading-8 text-muted">تم التحقق من حسابك. يجري تجهيز صفحات الخدمة، وستتاح بياناتك هنا بعد اكتمال التحديث.</p>
      {error && <p role="alert" className="mt-4 text-red-600 dark:text-red-300">{error}</p>}
      <nav aria-label="التنقل بين صفحات البوابة" className="mt-6 flex flex-wrap gap-3">
        <Link className="rounded-xl border border-border px-4 py-3 text-primary-600" to={ROLE_DESTINATIONS[user.role]}>الرئيسية</Link>
        {portal.pages.map((page) => <Link className="rounded-xl border border-border px-4 py-3 text-primary-600" key={page.path} to={page.path.startsWith('/') ? page.path : portal.basePath + '/' + page.path}>{page.label}</Link>)}
      </nav>
    </section>
  </main>
}
