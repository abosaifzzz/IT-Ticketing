const storage = new Map()
const channels = []

class FakeBroadcastChannel {
  constructor(name) { this.name = name; this.onmessage = null; channels.push(this) }
  postMessage(data) { channels.filter((channel) => channel !== this && channel.name === this.name).forEach((channel) => channel.onmessage?.({ data })) }
  close() { const index = channels.indexOf(this); if (index >= 0) channels.splice(index, 1) }
}

globalThis.window = {
  localStorage: {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  },
  BroadcastChannel: FakeBroadcastChannel,
  addEventListener: () => {},
  removeEventListener: () => {},
}

const { appEvents, EVENT_NAMES } = await import('../src/services/events/eventBus.js')
const { mockTicketService } = await import('../src/services/mock/mockTicketService.js')
const { notificationService, NOTIFICATION_TYPES } = await import('../src/services/notifications/notificationService.js')
const { notificationSoundService } = await import('../src/services/notifications/notificationSoundService.js')
const { mockTechnicianService } = await import('../src/services/mock/mockTechnicianService.js')

const broadcastMessages = []
const broadcastProbe = new FakeBroadcastChannel('hospital-helpdesk-notifications')
broadcastProbe.onmessage = ({ data }) => broadcastMessages.push(data)
notificationService.initialize()
mockTechnicianService.setActive('demo-engineer-03', false)

const created = mockTicketService.create({
  reporterAccountId: 'demo-employee-01', reporterName: 'موظف تجريبي', department: 'الحسابات',
  category: 'الشبكة', title: 'اختبار إشعارات الشبكة', description: 'بلاغ تجريبي للتحقق من نظام الإشعارات.',
})

const newTicketRecipients = ['demo-engineer-01', 'demo-engineer-02', 'demo-manager-01', 'demo-manager-02', 'demo-manager-03']
for (const recipientId of newTicketRecipients) {
  const notification = notificationService.getForRecipient(recipientId).find((item) => item.ticketId === created.id && item.type === NOTIFICATION_TYPES.NEW_TICKET)
  if (!notification || notification.sound !== 'new_ticket') throw new Error(`New-ticket notification missing for ${recipientId}`)
}
if (notificationService.getForRecipient('demo-engineer-03').length) throw new Error('Inactive engineer received a notification')
if (notificationService.getForRecipient('demo-employee-01').length) throw new Error('Ticket owner incorrectly received a new-ticket notification')
if (!broadcastMessages.some((message) => message.action === 'created')) throw new Error('Notification changes were not broadcast to another tab')

const assigned = mockTicketService.assign(created.id, 'demo-engineer-02', { id: 'demo-manager-01', name: 'مدير تجريبي' })
const assignmentNotifications = notificationService.getForRecipient('demo-engineer-02').filter((item) => item.ticketId === created.id && item.type === NOTIFICATION_TYPES.TICKET_ASSIGNMENT)
if (assignmentNotifications.length !== 1 || assignmentNotifications[0].sound !== 'assignment') throw new Error('Assignment notification routing or sound failed')
if (notificationService.getForRecipient('demo-engineer-01').some((item) => item.ticketId === created.id && item.type === NOTIFICATION_TYPES.TICKET_ASSIGNMENT)) throw new Error('Assignment notification leaked to another engineer')

mockTicketService.startWork(assigned.id, 'demo-engineer-02')
const resolved = mockTicketService.resolve(assigned.id, 'demo-engineer-02', 'تم تنفيذ حل تجريبي للمشكلة.')
if (!notificationService.getForRecipient('demo-employee-01').some((item) => item.ticketId === created.id && item.type === NOTIFICATION_TYPES.TICKET_RESOLVED)) throw new Error('Ticket owner did not receive resolution notification')
if (!notificationService.getForRecipient('demo-manager-03').some((item) => item.ticketId === created.id && item.type === NOTIFICATION_TYPES.TICKET_RESOLVED)) throw new Error('Managers did not receive resolution notification')

mockTicketService.reopen(resolved.id, 'demo-employee-01', 'ما زالت المشكلة موجودة')
if (!notificationService.getForRecipient('demo-engineer-02').some((item) => item.ticketId === created.id && item.type === NOTIFICATION_TYPES.TICKET_REOPENED)) throw new Error('Assigned engineer did not receive reopen notification')
if (!notificationService.getForRecipient('demo-manager-02').some((item) => item.ticketId === created.id && item.type === NOTIFICATION_TYPES.TICKET_REOPENED)) throw new Error('Managers did not receive reopen notification')

appEvents.publish(EVENT_NAMES.TICKET_FEEDBACK, { ticketId: created.id, ticketReference: created.id, technicianId: 'demo-engineer-02' })
if (!notificationService.getForRecipient('demo-engineer-02').some((item) => item.ticketId === created.id && item.type === NOTIFICATION_TYPES.TICKET_FEEDBACK)) throw new Error('Feedback event did not route to relevant engineer')

const managerNotifications = notificationService.getForRecipient('demo-manager-01')
const firstManagerNotification = managerNotifications[0]
notificationService.markAsRead(firstManagerNotification.id, 'demo-manager-01')
if (!notificationService.getForRecipient('demo-manager-01').find((item) => item.id === firstManagerNotification.id)?.readAt) throw new Error('Mark-as-read was not persisted')
notificationService.markAllAsRead('demo-manager-01')
if (notificationService.getUnreadCount('demo-manager-01') !== 0) throw new Error('Mark-all-as-read failed')
if (notificationService.markAsRead(firstManagerNotification.id, 'demo-employee-01')) throw new Error('Another recipient changed notification state')

if (notificationService.getTicketRoute(firstManagerNotification, 'manager') !== `/manager/tickets/${created.id}`) throw new Error('Role-aware ticket route failed')
if (JSON.stringify(notificationSoundService.getPattern('new_ticket')) === JSON.stringify(notificationSoundService.getPattern('assignment'))) throw new Error('Notification sound patterns are not distinct')

notificationService.dispose()
broadcastProbe.close()
console.log('PASS notification creation, recipient filtering, routing, persistence, cross-tab broadcast, and distinct sound patterns')
