import { useAuth } from './useAuth'
export function SessionStatus() {
  const { status, error, retry } = useAuth()
  return <main className="grid min-h-screen place-items-center bg-canvas p-5" dir="rtl"><section className="content-card w-full max-w-lg text-center" aria-busy={status === 'loading'}>
    {status === 'error' ? <><p role="alert" className="text-ink">{error}</p><button className="mt-5 rounded-xl bg-primary-600 px-5 py-3 font-bold text-white" onClick={retry}>إعادة المحاولة</button></> : <p role="status" className="text-ink">جارٍ التحقق من الجلسة...</p>}
  </section></main>
}
