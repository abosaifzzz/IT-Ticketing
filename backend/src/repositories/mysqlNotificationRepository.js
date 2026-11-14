import { ApiError } from '../management/validation.js'
import { lockNotificationAccount, advanceNotificationRevision } from '../notifications/service.js'

const projection = `n.id, n.event_id AS eventId, n.recipient_id AS recipientId, e.ticket_id AS ticketId,
  e.type, e.title, e.message, e.resource_type AS resourceType, e.resource_id AS resourceId, CAST(n.created_revision AS CHAR) AS createdRevision, n.created_at AS createdAt, n.read_at AS readAt`
const join = 'FROM notifications n JOIN notification_events e ON e.id = n.event_id'

async function state(connection, accountId) {
  const [[row]] = await connection.execute(`SELECT COALESCE((SELECT CAST(revision AS CHAR) FROM notification_accounts WHERE account_id = ?), '0') AS revision,
    (SELECT COUNT(*) FROM notifications WHERE recipient_id = ? AND read_at IS NULL) AS unreadCount`, [accountId, accountId])
  return row
}

export function createMySqlNotificationRepository(pool) {
  return {
    async state(accountId) { return state(pool, accountId) },
    async history(accountId, filters) {
      const connection = await pool.getConnection()
      try {
        await connection.beginTransaction()
        const snapshot = await state(connection, accountId)
        const where = ['n.recipient_id = ?'], params = [accountId]
        if (filters.before !== null) { where.push('n.created_revision < ?'); params.push(filters.before) }
        if (filters.unreadOnly) where.push('n.read_at IS NULL')
        const [rows] = await connection.query(`SELECT ${projection} ${join} WHERE ${where.join(' AND ')} ORDER BY n.created_revision DESC LIMIT ?`, [...params, filters.limit + 1])
        const more = rows.length > filters.limit, items = rows.slice(0, filters.limit)
        await connection.commit()
        return { items, ...snapshot, nextBefore: more ? items.at(-1).createdRevision : null }
      } catch (error) { await connection.rollback(); throw error }
      finally { connection.release() }
    },
    async markRead(accountId, notificationId = null) {
      const connection = await pool.getConnection()
      try {
        await connection.beginTransaction()
        const [[user]] = await connection.execute('SELECT is_active FROM users WHERE id = ? FOR SHARE', [accountId])
        if (!user?.is_active) throw new ApiError(401, 'يجب تسجيل الدخول.')
        await lockNotificationAccount(connection, accountId)
        let changed = false
        if (notificationId) {
          const [[row]] = await connection.execute('SELECT id, read_at FROM notifications WHERE id = ? AND recipient_id = ? FOR UPDATE', [notificationId, accountId])
          if (!row) throw new ApiError(404, 'الإشعار غير موجود.')
          if (!row.read_at) {
            await connection.execute('UPDATE notifications SET read_at = ? WHERE id = ? AND recipient_id = ?', [new Date(), notificationId, accountId])
            changed = true
          }
        } else {
          const [result] = await connection.execute('UPDATE notifications SET read_at = ? WHERE recipient_id = ? AND read_at IS NULL', [new Date(), accountId])
          changed = result.affectedRows > 0
        }
        if (changed) await advanceNotificationRevision(connection, accountId)
        const snapshot = await state(connection, accountId)
        let item
        if (notificationId) [[item]] = await connection.execute(`SELECT ${projection} ${join} WHERE n.id = ? AND n.recipient_id = ?`, [notificationId, accountId])
        await connection.commit()
        return { ...(item ? { item } : {}), ...snapshot, changed }
      } catch (error) { await connection.rollback(); throw error }
      finally { connection.release() }
    },
  }
}
