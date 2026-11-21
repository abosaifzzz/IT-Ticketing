import{authMode}from'../../services/auth/mode'
import{NotificationHistoryApi}from'./api/NotificationHistoryApi'
import { Bell, BellRing, CheckCheck, ClipboardPlus, MessageSquareText, TicketCheck, UserRoundCheck, Volume2, VolumeX } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { useAuth } from '../auth/useAuth'
import { appEvents, EVENT_NAMES } from '../../services/events/eventBus'
import { NOTIFICATION_TYPES, notificationService, notificationTypeLabels } from '../../services/notifications/notificationService'
import { notificationSoundService } from '../../services/notifications/notificationSoundService'

const dateFormatter = new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium', timeStyle: 'short' })

function TypeIcon({ type }) {
  const icons = {
    [NOTIFICATION_TYPES.NEW_TICKET]: ClipboardPlus,
    [NOTIFICATION_TYPES.TICKET_ASSIGNMENT]: UserRoundCheck,
    [NOTIFICATION_TYPES.TICKET_RESOLVED]: TicketCheck,
    [NOTIFICATION_TYPES.TICKET_REOPENED]: BellRing,
    [NOTIFICATION_TYPES.TICKET_FEEDBACK]: MessageSquareText,
  }
  const Icon = icons[type] ?? Bell
  return <Icon size={21} aria-hidden="true" />
}

function MockNotificationHistoryPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [filter, setFilter] = useState('all')
  const [notifications, setNotifications] = useState(() => notificationService.getForRecipient(user.id))
  const [soundSettings, setSoundSettings] = useState(() => notificationSoundService.getSettings())

  useEffect(() => {
    const refresh = (payload) => {
      if (!payload?.recipientId || payload.recipientId === user.id) setNotifications(notificationService.getForRecipient(user.id))
    }
    const offCreated = appEvents.subscribe(EVENT_NAMES.NOTIFICATION_CREATED, refresh)
    const offChanged = appEvents.subscribe(EVENT_NAMES.NOTIFICATIONS_CHANGED, refresh)
    const offSound = appEvents.subscribe(EVENT_NAMES.NOTIFICATION_SOUND_SETTINGS_CHANGED, setSoundSettings)
    return () => { offCreated(); offChanged(); offSound() }
  }, [user.id])

  const visibleNotifications = filter === 'unread' ? notifications.filter((item) => !item.readAt) : filter === 'all' ? notifications : notifications.filter((item) => item.type === filter)
  const unreadCount = notifications.filter((item) => !item.readAt).length
  const openTicket = (notification) => {
    notificationService.markAsRead(notification.id, user.id)
    const route = notificationService.getTicketRoute(notification, user.role)
    if (route) navigate(route)
  }

  return <>
    <div className="page-heading">
      <div><p className="eyebrow">التحديثات الشخصية</p><h1>سجل الإشعارات</h1><p>إشعارات البلاغات الموجهة إلى حسابك فقط.</p></div>
      <Button variant="secondary" onClick={() => notificationService.markAllAsRead(user.id)} disabled={!unreadCount}><CheckCheck size={18} /> تحديد الكل كمقروء</Button>
    </div>

    <section className="content-card mb-5" aria-labelledby="sound-settings-title">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div><h2 id="sound-settings-title" className="text-lg font-extrabold text-ink">إعدادات أصوات الإشعارات</h2></div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => notificationSoundService.setEnabled(!soundSettings.enabled)}>{soundSettings.enabled ? <Volume2 size={18} /> : <VolumeX size={18} />}{soundSettings.enabled ? 'إيقاف الأصوات' : 'تفعيل الأصوات'}</Button>
          <Button variant="secondary" disabled={!soundSettings.enabled} onClick={() => notificationSoundService.setMuted(!soundSettings.muted)}>{soundSettings.muted ? 'إلغاء الكتم' : 'كتم الأصوات'}</Button>
          <Button variant="secondary" disabled={!soundSettings.enabled || soundSettings.muted} onClick={() => notificationSoundService.preview('new_ticket')}><Volume2 size={18} /> تجربة صوت بلاغ جديد</Button>
          <Button variant="secondary" disabled={!soundSettings.enabled || soundSettings.muted} onClick={() => notificationSoundService.preview('assignment')}><Volume2 size={18} /> تجربة صوت الإسناد</Button>
        </div>
      </div>
    </section>

    <div className="mb-5 flex gap-2 overflow-x-auto pb-1" role="group" aria-label="تصفية الإشعارات">
      {[['all', 'الكل'], ['unread', `غير المقروءة (${unreadCount})`], ...Object.entries(notificationTypeLabels)].map(([value, label]) => <button key={value} type="button" onClick={() => setFilter(value)} className={`shrink-0 rounded-xl border px-4 py-2 text-sm font-bold transition ${filter === value ? 'border-primary-600 bg-primary-600 text-white' : 'border-border bg-surface text-muted hover:text-ink'}`}>{label}</button>)}
    </div>

    {visibleNotifications.length === 0 ? <section className="content-card py-14 text-center"><Bell className="mx-auto text-muted" size={34} /><h2 className="mt-4 text-lg font-extrabold text-ink">لا توجد إشعارات مطابقة</h2><p className="mt-2 text-sm text-muted">ستظهر هنا تحديثات البلاغات الموجهة إلى حسابك.</p></section> : <section className="space-y-3" aria-label="الإشعارات">
      {visibleNotifications.map((notification) => <article key={notification.id} className={`content-card flex flex-col gap-4 sm:flex-row sm:items-center ${notification.readAt ? '' : 'border-primary-200 dark:border-primary-800'}`}>
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-200"><TypeIcon type={notification.type} /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><h2 className="font-extrabold text-ink">{notification.title}</h2>{!notification.readAt && <span className="status-pill">جديد</span>}<span className="text-xs font-bold text-muted">{notificationTypeLabels[notification.type]}</span></div>
          <p className="mt-1 text-sm leading-6 text-muted">{notification.message}</p>
          <time className="mt-2 block text-xs text-muted" dateTime={notification.createdAt}>{dateFormatter.format(new Date(notification.createdAt))}</time>
        </div>
        <div className="flex flex-wrap gap-2 sm:justify-end">
          {!notification.readAt && <Button variant="secondary" onClick={() => notificationService.markAsRead(notification.id, user.id)}>تحديد كمقروء</Button>}
          {notificationService.getTicketRoute(notification, user.role) && <Button onClick={() => openTicket(notification)}>فتح البلاغ</Button>}
        </div>
      </article>)}
    </section>}
  </>
}

export function NotificationHistoryPage(){return authMode==='api'?<NotificationHistoryApi/>:<MockNotificationHistoryPage/>}
