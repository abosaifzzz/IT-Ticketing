import { ApiError } from '../management/validation.js'
import { ticketScope } from '../tickets/ticketView.js'

export function createMySqlDashboardRepository(pool) {
  return {
    async summary(user) {
      const scope = ticketScope(user)
      const [rows] = await pool.execute(`SELECT status, COUNT(*) n FROM tickets WHERE ${scope.sql} GROUP BY status`, scope.values)
      const counts = Object.fromEntries(['new', 'assigned', 'in_progress', 'pending', 'resolved', 'closed', 'reopened'].map((status) => [status, 0]))
      for (const row of rows) counts[row.status] = Number(row.n)
      const total = Object.values(counts).reduce((sum, count) => sum + count, 0), solved = counts.resolved + counts.closed
      return { tickets: { total, solved, unsolved: total - solved, byStatus: counts } }
    },
    async recurring(user, { limit = 6, minimumOccurrences = 2 } = {}) {
      if (!['technician', 'manager'].includes(user.role)) throw new ApiError(403, 'الطلب غير مسموح.')
      const scope = ticketScope(user)
      const [rows] = await pool.query(`WITH scoped AS (
        SELECT id, CONCAT('IT', ticket_sequence - 1) AS reference, category_label, department_label, status, created_at,
          LOWER(TRIM(category_label)) COLLATE utf8mb4_bin category_key,
          LOWER(TRIM(department_label)) COLLATE utf8mb4_bin department_key
        FROM tickets WHERE ${scope.sql}
      ), ranked AS (
        SELECT scoped.*, ROW_NUMBER() OVER (PARTITION BY category_key, department_key ORDER BY created_at DESC, id DESC) rn FROM scoped
      ) SELECT category_key, department_key, MAX(CASE WHEN rn = 1 THEN category_label END) category,
        MAX(CASE WHEN rn = 1 THEN department_label END) department, COUNT(*) count,
        SUM(status NOT IN ('resolved', 'closed')) openCount, JSON_ARRAYAGG(id) ticketIds, JSON_ARRAYAGG(reference) ticketReferences,
        MAX(CASE WHEN rn = 1 THEN id END) latestTicketId, MAX(created_at) latestOccurredAt
      FROM ranked GROUP BY category_key, department_key HAVING COUNT(*) >= ?
      ORDER BY count DESC, latestOccurredAt DESC, category_key, department_key LIMIT ?`, [...scope.values, minimumOccurrences, limit])
      return rows.map(({ category_key, department_key, ...row }) => ({ ...row, key: JSON.stringify([category_key, department_key]), count: Number(row.count), openCount: Number(row.openCount), ticketReferences: typeof row.ticketReferences === 'string' ? JSON.parse(row.ticketReferences) : row.ticketReferences, ticketIds: (typeof row.ticketIds === 'string' ? JSON.parse(row.ticketIds) : row.ticketIds).sort() }))
    },
  }
}
