import { DEMO_USERS } from '../auth/demoUsers.js'
import { appEvents, EVENT_NAMES } from '../events/eventBus.js'
import { mockTechnicianService } from '../mock/mockTechnicianService.js'
import { localStorageAdapter } from '../storage/localStorageAdapter.js'

const STORAGE_KEY = 'hospital-helpdesk:notifications:v1'
const CHANNEL_NAME = 'hospital-helpdesk-notifications'

export const NOTIFICATION_TYPES = Object.freeze({
  NEW_TICKET: 'new_ticket',
  TICKET_ASSIGNMENT: 'ticket_assignment',
  TICKET_RESOLVED: 'ticket_resolved',
  TICKET_REOPENED: 'ticket_reopened',
  TICKET_FEEDBACK: 'ticket_feedback',
})

export const notificationTypeLabels = Object.freeze({
  [NOTIFICATION_TYPES.NEW_TICKET]: 'بلاغ جديد',
  [NOTIFICATION_TYPES.TICKET_ASSIGNMENT]: 'إسناد بلاغ',
  [NOTIFICATION_TYPES.TICKET_RESOLVED]: 'تم حل البلاغ',
  [NOTIFICATION_TYPES.TICKET_REOPENED]: 'إعادة فتح البلاغ',
  [NOTIFICATION_TYPES.TICKET_FEEDBACK]: 'تقييم خدمة',
})

let initialized = false
let channel = null
let unsubscribers = []

const uniqueIds = (ids) => [...new Set(ids.filter(Boolean))]
const createId = () => `notification-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
const getAllStored = () => localStorageAdapter.get(STORAGE_KEY, [])
const saveAll = (notifications) => localStorageAdapter.set(STORAGE_KEY, notifications)

function getActiveRecipientIds() {
  const staff = mockTechnicianService.getAll()
  const activeTechnicianIds = staff
    .filter((person) => person.active && person.role === 'technician')
    .map((person) => person.id)
  const storedManagers = new Map(staff.filter((person) => person.role === 'manager').map((person) => [person.id, person]))
  const managerIds = DEMO_USERS
    .filter((person) => person.role === 'manager' && storedManagers.get(person.id)?.active !== false)
    .map((person) => person.id)
  staff.filter((person) => person.active && person.role === 'manager').forEach((person) => managerIds.push(person.id))
  return { technicianIds: uniqueIds(activeTechnicianIds), managerIds: uniqueIds(managerIds) }
}

function notificationCopy(type, ticket) {
  const reference = ticket.reference ?? ticket.ticketReference ?? ticket.id
  const fault = ticket.faultTitle ?? ticket.title ?? ticket.faultCategory ?? ticket.category ?? 'بلاغ دعم فني'
  const copy = {
    [NOTIFICATION_TYPES.NEW_TICKET]: ['بلاغ جديد', `تم إنشاء البلاغ ${reference}: ${fault}`],
    [NOTIFICATION_TYPES.TICKET_ASSIGNMENT]: ['تم إسناد بلاغ إليك', `تم إسناد البلاغ ${reference}: ${fault}`],
    [NOTIFICATION_TYPES.TICKET_RESOLVED]: ['تم حل البلاغ', `تم تسجيل حل البلاغ ${reference}`],
    [NOTIFICATION_TYPES.TICKET_REOPENED]: ['أُعيد فتح البلاغ', `أفاد الموظف بأن مشكلة البلاغ ${reference} ما زالت موجودة`],
    [NOTIFICATION_TYPES.TICKET_FEEDBACK]: ['تم استلام تقييم خدمة', `تم تسجيل تقييم مرتبط بالبلاغ ${reference}`],
  }
  return copy[type]
}

function createNotifications(type, ticket, recipientIds, sound = null) {
  const [title, message] = notificationCopy(type, ticket)
  const createdAt = new Date().toISOString()
  const notifications = uniqueIds(recipientIds).map((recipientId) => ({
    id: createId(),
    type,
    recipientId,
    ticketId: ticket.id ?? ticket.ticketId,
    ticketReference: ticket.reference ?? ticket.ticketReference ?? ticket.id ?? ticket.ticketId,
    title,
    message,
    sound,
    createdAt,
    readAt: null,
  }))
  if (!notifications.length) return []
  saveAll([...notifications, ...getAllStored()])
  notifications.forEach((notification) => appEvents.publish(EVENT_NAMES.NOTIFICATION_CREATED, notification))
  channel?.postMessage({ action: 'created', notifications })
  return notifications
}

function handleTicketCreated(ticket) {
  const { technicianIds, managerIds } = getActiveRecipientIds()
  createNotifications(NOTIFICATION_TYPES.NEW_TICKET, ticket, [...technicianIds, ...managerIds], 'new_ticket')
}

function handleTicketAssigned(ticket) {
  createNotifications(NOTIFICATION_TYPES.TICKET_ASSIGNMENT, ticket, [ticket.assignedTechnicianId], 'assignment')
}

function handleTicketResolved(ticket) {
  const { managerIds } = getActiveRecipientIds()
  createNotifications(NOTIFICATION_TYPES.TICKET_RESOLVED, ticket, [ticket.reporterAccountId, ...managerIds])
}

function handleTicketReopened(ticket) {
  const { managerIds } = getActiveRecipientIds()
  createNotifications(NOTIFICATION_TYPES.TICKET_REOPENED, ticket, [ticket.assignedTechnicianId, ...managerIds])
}

function handleTicketFeedback(payload) {
  const { managerIds } = getActiveRecipientIds()
  createNotifications(NOTIFICATION_TYPES.TICKET_FEEDBACK, payload, [payload.technicianId, ...managerIds])
}

function publishChanged(payload) {
  appEvents.publish(EVENT_NAMES.NOTIFICATIONS_CHANGED, payload)
  channel?.postMessage({ action: 'changed', payload })
}

export const notificationService = {
  initialize() {
    if (initialized) return
    initialized = true
    unsubscribers = [
      appEvents.subscribe(EVENT_NAMES.TICKET_CREATED, handleTicketCreated),
      appEvents.subscribe(EVENT_NAMES.TICKET_ASSIGNED, handleTicketAssigned),
      appEvents.subscribe(EVENT_NAMES.TICKET_RESOLVED, handleTicketResolved),
      appEvents.subscribe(EVENT_NAMES.TICKET_REOPENED, handleTicketReopened),
      appEvents.subscribe(EVENT_NAMES.TICKET_FEEDBACK, handleTicketFeedback),
    ]
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      channel = new window.BroadcastChannel(CHANNEL_NAME)
      channel.onmessage = ({ data }) => {
        if (data?.action === 'created') data.notifications?.forEach((item) => appEvents.publish(EVENT_NAMES.NOTIFICATION_CREATED, item))
        if (data?.action === 'changed') appEvents.publish(EVENT_NAMES.NOTIFICATIONS_CHANGED, data.payload)
      }
    }
  },
  dispose() {
    unsubscribers.forEach((unsubscribe) => unsubscribe())
    unsubscribers = []
    channel?.close()
    channel = null
    initialized = false
  },
  getForRecipient(recipientId, { unreadOnly = false, limit } = {}) {
    const notifications = getAllStored()
      .filter((item) => item.recipientId === recipientId && (!unreadOnly || !item.readAt))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    return Number.isFinite(limit) ? notifications.slice(0, limit) : notifications
  },
  getUnreadCount(recipientId) {
    return this.getForRecipient(recipientId, { unreadOnly: true }).length
  },
  markAsRead(notificationId, recipientId) {
    let updated = null
    const notifications = getAllStored().map((item) => {
      if (item.id !== notificationId || item.recipientId !== recipientId || item.readAt) return item
      updated = { ...item, readAt: new Date().toISOString() }
      return updated
    })
    if (updated) {
      saveAll(notifications)
      publishChanged({ recipientId, notificationId })
    }
    return updated
  },
  markAllAsRead(recipientId) {
    const readAt = new Date().toISOString()
    let changed = false
    const notifications = getAllStored().map((item) => {
      if (item.recipientId !== recipientId || item.readAt) return item
      changed = true
      return { ...item, readAt }
    })
    if (changed) {
      saveAll(notifications)
      publishChanged({ recipientId, all: true })
    }
    return changed
  },
  getTicketRoute(notification, role) {
    if (!notification?.ticketId) return null
    if (role === 'technician' && notification.type === NOTIFICATION_TYPES.NEW_TICKET) return null
    const bases = { employee: '/employee/tickets', technician: '/technician/tickets', manager: '/manager/tickets' }
    return bases[role] ? `${bases[role]}/${notification.ticketId}` : null
  },
}
