import { Bell, LogOut, Menu, Moon, Sun, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../features/auth/useAuth'
import { useApiNotifications } from '../../features/notifications/api/notificationsContext'
import { notificationRoute } from '../../services/notifications/notificationApi'
import { themeService } from '../../services/preferences/themeService'

const dateFormatter = new Intl.DateTimeFormat('ar-EG', { dateStyle: 'short', timeStyle: 'short' })

export function ApiHeader({ portal }) {
  const { user, logout } = useAuth()
  const notifications = useApiNotifications()
  const navigate = useNavigate()
  const bellRef = useRef(null)
  const notificationLock = useRef(false)
  const [bellOpen, setBellOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [notificationBusy, setNotificationBusy] = useState(false)
  const [theme, setTheme] = useState(() => themeService.getActiveTheme())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const links = [{ path: portal.basePath, label: 'لوحة التحكم', end: true }, ...portal.pages.map((page) => ({ ...page, path: page.path.startsWith('/') ? page.path : `${portal.basePath}/${page.path}` })), { path: '/profile', label: 'ملفي الشخصي' }]

  useEffect(() => {
    const close = (event) => {
      if (event.type === 'keydown' && event.key === 'Escape') {
        setBellOpen(false)
        setMenuOpen(false)
      } else if (event.type === 'pointerdown' && !bellRef.current?.contains(event.target)) setBellOpen(false)
    }
    document.addEventListener('keydown', close)
    document.addEventListener('pointerdown', close)
    return () => { document.removeEventListener('keydown', close); document.removeEventListener('pointerdown', close) }
  }, [])

  const openNotification = async (item) => {
    if (notificationLock.current) return
    notificationLock.current = true
    setNotificationBusy(true)
    setError('')
    try {
      await notifications.read(item.id)
      setBellOpen(false)
      const route = notificationRoute(item, user.role)
      if (route) navigate(route)
    } catch (failure) { setError(failure.message) }
    finally { notificationLock.current = false; setNotificationBusy(false) }
  }
  const toggleNotifications = async () => {
    if (bellOpen) { setBellOpen(false); return }
    setBellOpen(true)
    if (!notifications.unreadCount) return
    setError('')
    try { await notifications.readAll() }
    catch (failure) { setError(failure.message) }
  }
  const signOut = async () => {
    if (busy) return
    setBusy(true)
    setError('')
    try { await logout(); setMenuOpen(false); navigate('/login', { replace: true }) }
    catch (failure) { setError(failure.message) }
    finally { setBusy(false) }
  }

  return <header className="sticky top-0 z-40 border-b border-border bg-surface/95 backdrop-blur">
    <div className="mx-auto flex h-18 max-w-[1600px] items-center justify-between gap-3 px-4 sm:h-20 sm:px-6 lg:px-8">
      <NavLink to={portal.basePath} onClick={() => setMenuOpen(false)} className="min-w-0 shrink-0" aria-label="العودة إلى لوحة التحكم"><img src="/brand/fayoum-oncology-center-logo.jpg" alt="شعار مركز أورام الفيوم" className="h-14 w-40 rounded-lg bg-white object-contain sm:h-16 sm:w-52" /></NavLink>
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <div className="hidden min-w-0 text-left md:block"><p className="truncate text-xs font-bold text-ink">{user.name}</p><p className="truncate text-[11px] text-muted">{user.roleLabel}</p></div>
        <div className="relative" ref={bellRef}>
          <button type="button" className="icon-button relative" aria-label={`الإشعارات، ${notifications.unreadCount} غير مقروءة`} aria-expanded={bellOpen} aria-controls="api-notification-bell" onClick={toggleNotifications}><Bell size={19} aria-hidden="true" />{notifications.unreadCount > 0 && <span aria-live="polite" data-unread-count={notifications.unreadCount} className="absolute -left-1 -top-1 grid min-h-5 min-w-5 place-items-center rounded-full bg-red-600 px-1 text-[10px] font-extrabold text-white">{notifications.unreadCount > 99 ? '+99' : notifications.unreadCount}</span>}</button>
          {bellOpen && <section id="api-notification-bell" role="dialog" aria-label="آخر الإشعارات" className="fixed inset-x-4 top-20 z-50 mx-auto max-h-[min(70vh,34rem)] w-auto max-w-sm overflow-y-auto rounded-2xl border border-border bg-surface p-4 shadow-xl sm:absolute sm:inset-x-auto sm:left-0 sm:top-12 sm:mx-0 sm:w-96 [overflow-wrap:anywhere]">
            <div className="flex items-center justify-between gap-3"><h2 className="font-extrabold text-ink">آخر الإشعارات</h2><button type="button" className="text-xs font-bold text-primary-600" onClick={() => setBellOpen(false)} aria-label="إغلاق الإشعارات"><X size={18} /></button></div>
            <p className="mt-1 text-xs text-muted">{notifications.transport === 'live' ? 'التحديث المباشر متصل' : 'التحديث الدوري متاح'}</p>
            {notifications.error && <p role="alert" className="my-3 text-sm text-red-700 dark:text-red-300">{notifications.error.message}</p>}
            {notifications.status === 'loading' ? <p role="status" className="my-4 text-muted">جارٍ تحميل الإشعارات...</p> : notifications.items.map((item) => <button key={item.id} type="button" disabled={notificationBusy} onClick={() => openNotification(item)} className="mt-3 block w-full rounded-xl border border-border bg-canvas p-3 text-right text-sm text-ink transition hover:border-primary-300 hover:bg-primary-50 dark:hover:bg-primary-900/20"><strong className="block">{item.title}</strong><span className="mt-1 block text-muted">{item.message}</span><span className="mt-2 flex items-center justify-between gap-2 text-xs text-muted"><time>{dateFormatter.format(new Date(item.createdAt))}</time>{!item.readAt && <span className="font-bold text-primary-600">غير مقروء</span>}</span></button>)}
            {notifications.status === 'ready' && !notifications.items.length && <p className="my-4 text-sm text-muted">لا توجد إشعارات.</p>}
            <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-3 text-sm"><NavLink className="font-bold text-primary-600" to={`${portal.basePath}/notifications`} onClick={() => setBellOpen(false)}>عرض سجل الإشعارات</NavLink><button className="font-bold text-primary-600" type="button" onClick={() => notifications.refresh()}>تحديث</button></div>
          </section>}
        </div>
        <button type="button" className="icon-button" onClick={() => setTheme(themeService.toggle())} aria-label={theme === 'dark' ? 'تفعيل الوضع النهاري' : 'تفعيل الوضع الليلي'}>{theme === 'dark' ? <Sun size={19} /> : <Moon size={19} />}</button>
        <button type="button" className="icon-button hidden sm:grid" disabled={busy} onClick={signOut} aria-label="تسجيل الخروج"><LogOut size={19} /></button>
        <button type="button" className="icon-button lg:hidden" onClick={() => { setMenuOpen((value) => !value); setBellOpen(false) }} aria-label={menuOpen ? 'إغلاق القائمة' : 'فتح القائمة'} aria-expanded={menuOpen} aria-controls="api-mobile-nav">{menuOpen ? <X size={20} /> : <Menu size={20} />}</button>
      </div>
    </div>
    <nav aria-label="التنقل الرئيسي" className="hidden border-t border-border/70 lg:block"><div className="mx-auto flex max-w-[1600px] items-center gap-1 overflow-x-auto whitespace-nowrap px-4 py-2 sm:px-6 lg:px-8">{links.map((link) => <NavLink key={link.path} end={link.end} to={link.path} className={({ isActive }) => `shrink-0 rounded-lg px-3 py-2 text-sm font-bold transition ${isActive ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-200' : 'text-muted hover:bg-primary-50 hover:text-ink dark:hover:bg-primary-900/20'}`}>{link.label}</NavLink>)}</div></nav>
    {menuOpen && <nav id="api-mobile-nav" aria-label="قائمة الهاتف" className="max-h-[70vh] overflow-y-auto border-t border-border bg-surface px-4 py-3 lg:hidden"><div className="mx-auto grid max-w-[1600px] gap-1 sm:grid-cols-2">{links.map((link) => <NavLink key={link.path} end={link.end} to={link.path} onClick={() => setMenuOpen(false)} className={({ isActive }) => `rounded-xl px-3 py-2.5 text-sm font-bold ${isActive ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-200' : 'text-muted hover:bg-primary-50 hover:text-ink dark:hover:bg-primary-900/20'}`}>{link.label}</NavLink>)}<button type="button" onClick={signOut} disabled={busy} className="rounded-xl px-3 py-2.5 text-right text-sm font-bold text-red-600 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/30">{busy ? 'جارٍ تسجيل الخروج...' : 'تسجيل الخروج'}</button></div></nav>}
    {error && <p role="alert" className="mx-auto max-w-[1600px] px-4 py-2 text-sm text-red-600 dark:text-red-300">{error}</p>}
  </header>
}
