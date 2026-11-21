import { AlertCircle, ArrowLeft, Eye, EyeOff, LockKeyhole, Moon, ShieldCheck, Sun, UserRound } from 'lucide-react'
import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { requiresAccountSetup, ROLE_DESTINATIONS } from '../../services/auth/roles'
import { themeService } from '../../services/preferences/themeService'
import { useAuth } from './useAuth'
import { SessionStatus } from './SessionStatus'

export function LoginPage() {
  const { status, mode, isAuthenticated, user, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [credentials, setCredentials] = useState({ username: '', password: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [theme, setTheme] = useState(() => themeService.getActiveTheme())
  const completionMessage = new URLSearchParams(location.search).get('setup') === 'complete'
    ? 'اكتمل إعداد الحساب. سجّل الدخول بكلمة المرور الجديدة.'
    : ''

  if (status === 'loading' || status === 'error') return <SessionStatus />

  if (isAuthenticated) return <Navigate to={requiresAccountSetup(user) ? '/setup' : ROLE_DESTINATIONS[user.role] ?? '/unauthorized'} replace />

  const updateField = (event) => {
    setCredentials((current) => ({ ...current, [event.target.name]: event.target.value }))
    if (error) setError('')
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (isLoading) return
    if (!credentials.username.trim() || !credentials.password) {
      setError('يرجى إدخال اسم المستخدم أو البريد الإلكتروني وكلمة المرور.')
      return
    }

    setIsLoading(true)
    setError('')
    try {
      const session = await login(credentials)
      setCredentials((current) => ({ ...current, password: '' }))
      navigate(requiresAccountSetup(session.user) ? '/setup' : ROLE_DESTINATIONS[session.role] ?? '/unauthorized', { replace: true })
    } catch (loginError) {
      setError(loginError.message || 'تعذر تسجيل الدخول. يرجى المحاولة مرة أخرى.')
    } finally {
      setIsLoading(false)
    }
  }

  return <main className="min-h-screen bg-canvas p-3 sm:p-5 lg:p-7">
    <div className="mx-auto grid min-h-[calc(100vh-1.5rem)] max-w-7xl overflow-hidden rounded-3xl border border-border bg-surface shadow-panel sm:min-h-[calc(100vh-2.5rem)] lg:min-h-[calc(100vh-3.5rem)] lg:grid-cols-[0.82fr_1.18fr]">
      <section className="relative flex flex-col justify-between overflow-hidden bg-primary-700 p-6 text-white sm:p-9 lg:p-12">
        <div className="absolute -left-24 -top-24 size-72 rounded-full border-[48px] border-white/5" />
        <div className="relative">
          <div className="flex h-40 w-full max-w-lg items-center rounded-2xl bg-white p-2 shadow-sm"><img src="/brand/fayoum-oncology-center-logo.jpg" alt="شعار مركز أورام الفيوم" className="h-full w-full object-contain" /></div>
          <div className="mt-10 max-w-md lg:mt-24">
            <p className="text-sm font-bold text-primary-200">مركز أورام الفيوم</p>
            <h2 className="mt-3 text-3xl font-extrabold leading-[1.45] sm:text-3xl">مكتب تكنولوجيا المعلومات</h2>
            <p className="mt-4 text-sm leading-7 text-primary-100">سيستم كامل و موحّد لمتابعة طلبات الدعم والخدمات التقنية بكفاءة ووضوح.</p>
          </div>
        </div>
        <div className="relative mt-10 flex items-start gap-3 rounded-2xl bg-white/10 p-4 backdrop-blur-sm">
          <ShieldCheck className="mt-0.5 shrink-0 text-primary-200" size={21} />
          <div><p className="text-sm font-bold">{mode === 'mock' ? 'وضع تطوير تجريبي' : 'الدخول إلى حسابك'}</p><p className="mt-1 text-xs leading-6 text-primary-100">نسعي لتجربة موظف مثالية </p></div>
        </div>
      </section>

      <section className="relative flex items-center p-5 sm:p-9 lg:p-12 xl:p-16">
        <button type="button" onClick={() => setTheme(themeService.toggle())} className="icon-button absolute left-5 top-5 sm:left-8 sm:top-8" aria-label={theme === 'dark' ? 'تفعيل الوضع النهاري' : 'تفعيل الوضع الليلي'}>{theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}</button>
        <div className="mx-auto w-full max-w-xl pt-14 lg:pt-0">
          <div>
            <p className="text-xs font-extrabold text-primary-500">تسجيل الدخول</p>
            <h2 className="mt-2 text-2xl font-extrabold text-ink sm:text-3xl">مرحبًا بعودتك</h2>
            <p className="mt-2 text-sm leading-6 text-muted">قم بتسجيل الدخول ببيانات حسابك الشخصي فقط</p>
          </div>

          <form className="mt-8 space-y-5" onSubmit={handleSubmit} aria-busy={isLoading} noValidate>
            {(location.state?.message || completionMessage) && <p role="status" className="rounded-xl border border-green-300 p-3 text-sm text-green-800 dark:text-green-300">{location.state?.message || completionMessage}</p>}
            {error && <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-3.5 text-sm font-semibold text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200" role="alert"><AlertCircle className="mt-0.5 shrink-0" size={18} /><span>{error}</span></div>}

            <label className="block">
              <span className="mb-2 block text-sm font-bold text-ink">اسم المستخدم أو البريد الإلكتروني</span>
              <span className="relative block"><UserRound className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-muted" size={19} /><input type="text" name="username" value={credentials.username} onChange={updateField} autoComplete="username" dir="ltr" className="h-12 w-full rounded-xl border border-border bg-canvas pr-11 pl-4 text-left text-sm text-ink outline-none transition focus:border-primary-500 focus:ring-4 focus:ring-primary-100 dark:focus:ring-primary-900/30" placeholder="اسم المستخدم أو البريد الإلكتروني" disabled={isLoading} /></span>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-bold text-ink">كلمة المرور</span>
              <span className="relative block"><LockKeyhole className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-muted" size={19} /><input name="password" type={showPassword ? 'text' : 'password'} value={credentials.password} onChange={updateField} autoComplete="current-password" dir="ltr" className="h-12 w-full rounded-xl border border-border bg-canvas px-11 text-left text-sm text-ink outline-none transition focus:border-primary-500 focus:ring-4 focus:ring-primary-100 dark:focus:ring-primary-900/30" placeholder="••••••••" disabled={isLoading} /><button type="button" onClick={() => setShowPassword((visible) => !visible)} className="absolute left-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-muted hover:bg-primary-50 dark:hover:bg-primary-900/30" aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}>{showPassword ? <EyeOff size={19} /> : <Eye size={19} />}</button></span>
            </label>

            <button type="submit" disabled={isLoading} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary-600 px-5 text-sm font-extrabold text-white transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-70">
              {isLoading ? <><span className="size-5 animate-spin rounded-full border-2 border-white/30 border-t-white" /> جارٍ تسجيل الدخول...</> : <>تسجيل الدخول <ArrowLeft size={18} /></>}
            </button>
          </form>

          <div className="mt-9 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-7 text-sm">
            <p className="font-bold text-muted">إذا واجهت أي مشكلة في تسجيل الدخول، تواصل مع قسم تكنولوجيا المعلومات أو عبر واتساب.</p>
            <a href="https://wa.me/201018335538" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2 font-extrabold text-emerald-800 transition hover:bg-emerald-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 dark:border-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-200 dark:hover:bg-emerald-900/40" aria-label="التواصل عبر واتساب على 01018335538 (يفتح في نافذة جديدة)"><img src="/brand/whatsapp.svg" alt="" aria-hidden="true" className="size-5 shrink-0" />تواصل عبر واتساب <bdi dir="ltr">01018335538</bdi></a>
          </div>
        </div>
      </section>
    </div>
  </main>
}
