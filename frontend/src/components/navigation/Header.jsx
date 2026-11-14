import { Bell, BellRing, CheckCheck, ClipboardPlus, LogOut, Menu, MessageSquareText, Moon, Sun, TicketCheck, UserRoundCheck, Volume2, VolumeX, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../features/auth/useAuth'
import { appEvents, EVENT_NAMES } from '../../services/events/eventBus'
import { NOTIFICATION_TYPES, notificationService } from '../../services/notifications/notificationService'
import { notificationSoundService } from '../../services/notifications/notificationSoundService'
import { themeService } from '../../services/preferences/themeService'

const dateFormatter = new Intl.DateTimeFormat('ar-EG', { dateStyle: 'short', timeStyle: 'short' })

function NotificationIcon({ type, size = 18 }) {
  const icons = {
    [NOTIFICATION_TYPES.NEW_TICKET]: ClipboardPlus,
    [NOTIFICATION_TYPES.TICKET_ASSIGNMENT]: UserRoundCheck,
    [NOTIFICATION_TYPES.TICKET_RESOLVED]: TicketCheck,
    [NOTIFICATION_TYPES.TICKET_REOPENED]: BellRing,
    [NOTIFICATION_TYPES.TICKET_FEEDBACK]: MessageSquareText,
  }
  const Icon = icons[type] ?? Bell
  return <Icon size={size} aria-hidden="true" />
}

export function Header({ portal }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [theme, setTheme] = useState(() => themeService.getActiveTheme())
  const [notifications, setNotifications] = useState(() => notificationService.getForRecipient(user.id, { limit: 6 }))
  const [soundSettings, setSoundSettings] = useState(() => notificationSoundService.getSettings())
  const links = [{ path: portal.basePath, label: 'لوحة التحكم', end: true }, ...portal.pages]
  const unreadCount = notificationService.getUnreadCount(user.id)

  useEffect(() => {
    const refresh = (payload) => {
      if (payload?.recipientId && payload.recipientId !== user.id) return
      setNotifications(notificationService.getForRecipient(user.id, { limit: 6 }))
    }
    const handleCreated = (notification) => {
      refresh(notification)
      if (notification.recipientId === user.id && notification.sound) notificationSoundService.play(notification.sound)
    }
    const offCreated = appEvents.subscribe(EVENT_NAMES.NOTIFICATION_CREATED, handleCreated)
    const offChanged = appEvents.subscribe(EVENT_NAMES.NOTIFICATIONS_CHANGED, refresh)
    const offSound = appEvents.subscribe(EVENT_NAMES.NOTIFICATION_SOUND_SETTINGS_CHANGED, setSoundSettings)
    return () => { offCreated(); offChanged(); offSound() }
  }, [user.id])

  const handleLogout = async () => { await logout(); navigate('/login', { replace: true }) }
  const openNotification = (notification) => {
    notificationService.markAsRead(notification.id, user.id)
    setNotificationsOpen(false)
    const route = notificationService.getTicketRoute(notification, user.role)
    if (route) navigate(route)
  }
  const markAllRead = () => notificationService.markAllAsRead(user.id)
  const toggleNotifications = () => {
    if (!notificationsOpen && unreadCount > 0) markAllRead()
    setNotificationsOpen((open) => !open)
  }
  const toggleEnabled = () => notificationSoundService.setEnabled(!soundSettings.enabled)
  const toggleMuted = () => notificationSoundService.setMuted(!soundSettings.muted)

  return <header className="sticky top-0 z-40 border-b border-border bg-surface/95 backdrop-blur">
    <div className="mx-auto flex h-18 max-w-[1600px] items-center justify-between gap-3 px-4 sm:h-20 sm:px-6 lg:px-8">
      <NavLink to={portal.basePath} className="flex min-w-0 items-center gap-3">
        <span className="flex h-16 w-44 shrink-0 items-center rounded-xl bg-white sm:w-60"><img src="/brand/fayoum-oncology-center-logo.jpg" alt="شعار مركز أورام الفيوم" className="h-full w-full object-contain" /></span>
      </NavLink>
      <nav className="hidden items-center gap-1 xl:flex" aria-label="التنقل الرئيسي">
        {links.map((link) => <NavLink key={link.path} to={link.path.startsWith('/') ? link.path : `${portal.basePath}/${link.path}`} end={link.end} className={({ isActive }) => `rounded-lg px-3 py-2 text-xs font-bold transition ${isActive ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-200' : 'text-muted hover:text-ink'}`}>{link.label}</NavLink>)}
      </nav>
      <div className="flex items-center gap-2">
        <div className="hidden text-left md:block"><p className="text-xs font-bold text-ink">{user.name}</p><p className="mt-0.5 text-[11px] text-muted">{user.roleLabel}</p></div>
        <div className="relative">
          <button type="button" onClick={toggleNotifications} className="icon-button relative" aria-label={`الإشعارات، ${unreadCount} غير مقروءة`} aria-expanded={notificationsOpen}>
            <Bell size={19} />
            {unreadCount > 0 && <span className="absolute -left-1 -top-1 grid min-h-5 min-w-5 place-items-center rounded-full bg-red-600 px-1 text-[10px] font-extrabold text-white">{unreadCount > 99 ? '+99' : unreadCount}</span>}
          </button>
          {notificationsOpen && <div className="absolute left-0 top-12 z-50 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-border bg-surface shadow-xl" role="dialog" aria-label="قائمة الإشعارات">
            <div className="flex items-center justify-between border-b border-border p-4">
              <div><h2 className="font-extrabold text-ink">الإشعارات</h2><p className="text-xs text-muted">{unreadCount} غير مقروءة</p></div>
              {unreadCount > 0 && <button type="button" onClick={markAllRead} className="flex items-center gap-1 text-xs font-bold text-primary-600 hover:text-primary-700"><CheckCheck size={16} /> قراءة الكل</button>}
            </div>
            <div className="max-h-80 overflow-y-auto">
              {notifications.length === 0 ? <div className="p-8 text-center"><Bell className="mx-auto text-muted" /><p className="mt-3 text-sm font-bold text-ink">لا توجد إشعارات</p><p className="mt-1 text-xs text-muted">ستظهر تحديثات البلاغات هنا.</p></div> : notifications.map((notification) => <button key={notification.id} type="button" onClick={() => openNotification(notification)} className={`flex w-full gap-3 border-b border-border p-4 text-right transition last:border-b-0 hover:bg-primary-50/60 dark:hover:bg-primary-900/20 ${notification.readAt ? '' : 'bg-primary-50/40 dark:bg-primary-900/10'}`}>
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-200"><NotificationIcon type={notification.type} /></span>
                <span className="min-w-0 flex-1"><span className="flex items-start gap-2"><strong className="flex-1 text-sm text-ink">{notification.title}</strong>{!notification.readAt && <span className="mt-1.5 size-2 rounded-full bg-primary-600" />}</span><span className="mt-1 block text-xs leading-5 text-muted">{notification.message}</span><time className="mt-1 block text-[11px] text-muted">{dateFormatter.format(new Date(notification.createdAt))}</time></span>
              </button>)}
            </div>
            <div className="border-t border-border p-3">
              <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
                <button type="button" onClick={toggleEnabled} className={`rounded-lg border px-2.5 py-1.5 font-bold ${soundSettings.enabled ? 'border-primary-200 text-primary-700 dark:text-primary-200' : 'border-border text-muted'}`}>{soundSettings.enabled ? 'الأصوات مفعّلة' : 'الأصوات متوقفة'}</button>
                <button type="button" onClick={toggleMuted} disabled={!soundSettings.enabled} className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 font-bold text-muted disabled:opacity-50">{soundSettings.muted ? <VolumeX size={15} /> : <Volume2 size={15} />}{soundSettings.muted ? 'إلغاء الكتم' : 'كتم'}</button>
              </div>
              <button type="button" onClick={() => { setNotificationsOpen(false); navigate(`${portal.basePath}/notifications`) }} className="w-full rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-primary-700">عرض سجل الإشعارات</button>
            </div>
          </div>}
        </div>
        <button type="button" onClick={() => setTheme(themeService.toggle())} className="icon-button" aria-label={theme === 'dark' ? 'تفعيل الوضع النهاري' : 'تفعيل الوضع الليلي'}>{theme === 'dark' ? <Sun size={19} /> : <Moon size={19} />}</button>
        <button type="button" onClick={handleLogout} className="icon-button hidden sm:grid" aria-label="تسجيل الخروج"><LogOut size={19} /></button>
        <button type="button" onClick={() => setMenuOpen((open) => !open)} className="icon-button xl:hidden" aria-label={menuOpen ? 'إغلاق القائمة' : 'فتح القائمة'}>{menuOpen ? <X size={20} /> : <Menu size={20} />}</button>
      </div>
    </div>
    {menuOpen && <nav className="max-h-[70vh] overflow-y-auto border-t border-border bg-surface px-4 py-3 xl:hidden" aria-label="قائمة الهاتف">
      <div className="mx-auto grid max-w-[1600px] gap-1 sm:grid-cols-2 lg:grid-cols-3">
        {links.map((link) => <NavLink key={link.path} to={link.path.startsWith('/') ? link.path : `${portal.basePath}/${link.path}`} end={link.end} onClick={() => setMenuOpen(false)} className={({ isActive }) => `rounded-xl px-3 py-2.5 text-sm font-bold ${isActive ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-200' : 'text-muted hover:bg-primary-50 dark:hover:bg-primary-900/20'}`}>{link.label}</NavLink>)}
        <button type="button" onClick={handleLogout} className="rounded-xl px-3 py-2.5 text-right text-sm font-bold text-red-600 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/30">تسجيل الخروج</button>
      </div>
    </nav>}
  </header>
}
