import { randomUUID } from 'node:crypto'

export const NOTIFICATION_TYPES = Object.freeze({ NEW_TICKET: 'new_ticket', ASSIGNMENT: 'ticket_assignment', RESOLVED: 'ticket_resolved', REOPENED: 'ticket_reopened' })

export function notificationCopy(type, ticket) {
  const reference = ticket.reference ?? ticket.id
  const copy = {
    new_ticket: ['بلاغ جديد', `تم إنشاء البلاغ ${reference}: ${ticket.title}`],
    ticket_assignment: ['تم إسناد بلاغ إليك', `تم إسناد البلاغ ${reference}: ${ticket.title}`],
    ticket_resolved: ['تم حل البلاغ', `تم تسجيل حل البلاغ ${reference}`],
    ticket_reopened: ['أُعيد فتح البلاغ', `أفاد الموظف بأن مشكلة البلاغ ${reference} ما زالت موجودة`],
  }[type]
  if (!copy) throw new Error('Unsupported notification type')
  return copy
}

export async function lockNotificationAccount(connection, accountId) {
  await connection.execute('INSERT INTO notification_accounts (account_id, revision) VALUES (?, 0) ON DUPLICATE KEY UPDATE account_id = account_id', [accountId])
}

export async function advanceNotificationRevision(connection, accountId) {
  await connection.execute('UPDATE notification_accounts SET revision = revision + 1 WHERE account_id = ?', [accountId])
  const [[row]] = await connection.execute('SELECT CAST(revision AS CHAR) AS revision FROM notification_accounts WHERE account_id = ?', [accountId])
  return row.revision
}

// Called only by trusted ticket repositories, within their ticket transaction.
// The immutable activity ID is the event's deduplication key, across retries/processes.
export function createNotificationService() {
  return {
    async record(connection, { eventId, type, ticket, now }) {
      const [title, message] = notificationCopy(type, ticket)
      try {
        await connection.execute('INSERT INTO notification_events (id, ticket_id, type, title, message, created_at) VALUES (?, ?, ?, ?, ?, ?)',
          [eventId, ticket.id, type, title, message, now])
      } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') return
        throw error
      }
      let predicate, values = []
      if (type === NOTIFICATION_TYPES.NEW_TICKET) predicate = "role IN ('technician', 'manager')"
      else if (type === NOTIFICATION_TYPES.ASSIGNMENT) {
        predicate = "role = 'technician' AND id = ?"
        values = [ticket.assignedTechnicianId]
      } else if (type === NOTIFICATION_TYPES.RESOLVED) {
        predicate = "(role = 'manager' OR id = ?)"
        values = [ticket.reporterAccountId]
      } else {
        predicate = "(role = 'manager' OR (role = 'technician' AND id = ?))"
        values = [ticket.assignedTechnicianId]
      }
      const [recipients] = await connection.execute(`SELECT id FROM users WHERE is_active = TRUE AND (${predicate}) ORDER BY id FOR SHARE`, values)
      // Stable per-account lock order serializes revision allocation and commits.
      // Unlike an auto-increment event cursor, a revision cannot commit out of order.
      for (const { id } of recipients) {
        await lockNotificationAccount(connection, id)
        const revision = await advanceNotificationRevision(connection, id)
        await connection.execute(`INSERT INTO notifications (id, event_id, recipient_id, created_revision, created_at) VALUES (?, ?, ?, ?, ?)`,
          [randomUUID(), eventId, id, revision, now])
      }
    },
  }
}
