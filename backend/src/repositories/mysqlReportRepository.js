import { ApiError } from '../management/validation.js'

export function createMySqlReportRepository(pool) {
  return {
    async dashboard(filters, user) {
      if (user?.role !== 'manager') throw new ApiError(403, 'التقارير متاحة للمدير فقط.')
      const connection = await pool.getConnection()
      try {
        await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ')
        await connection.beginTransaction()
        const [[actor]] = await connection.execute('SELECT role, is_active FROM users WHERE id = ? FOR SHARE', [user.id])
        if (!actor?.is_active || actor.role !== 'manager') throw new ApiError(403, 'التقارير متاحة للمدير فقط.')
        const clauses = [], values = []
        if (filters.from) { clauses.push('t.created_at >= ?'); values.push(filters.from) }
        if (filters.until) { clauses.push('t.created_at < ?'); values.push(filters.until) }
        const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
        const [[counts]] = await connection.execute(`SELECT COUNT(*) total,
          COALESCE(SUM(t.status IN ('resolved', 'closed')), 0) solved,
          COALESCE(SUM(t.status = 'reopened' OR EXISTS (SELECT 1 FROM ticket_history h WHERE h.ticket_id = t.id AND (h.type = 'reopened' OR h.status = 'reopened'))), 0) reopened
          FROM tickets t ${where}`, values)
        const [faults] = await connection.query(`SELECT LOWER(TRIM(t.category_label)) COLLATE utf8mb4_bin category_key,
          LOWER(TRIM(t.subcategory_label)) COLLATE utf8mb4_bin subcategory_key,
          MIN(t.category_label COLLATE utf8mb4_bin) category, MIN(t.subcategory_label COLLATE utf8mb4_bin) subcategory, COUNT(*) ticketCount
          FROM tickets t ${where} ${where ? 'AND' : 'WHERE'} t.requester_type <> 'it_internal' GROUP BY category_key, subcategory_key
          ORDER BY ticketCount DESC, category COLLATE utf8mb4_unicode_ci, subcategory COLLATE utf8mb4_unicode_ci, category_key, subcategory_key LIMIT ?`, [...values, filters.limit])
        // Reporting keys deliberately contain no ownership/account identifiers.
        const [employees] = await connection.query(`WITH filtered AS (
          SELECT t.*, CASE WHEN TRIM(employee_number) <> '' THEN 1 ELSE 0 END numbered,
            (CASE WHEN TRIM(employee_number) <> '' THEN TRIM(employee_number) ELSE '' END) COLLATE utf8mb4_bin number_key,
            (CASE WHEN TRIM(employee_number) <> '' THEN '' ELSE LOWER(TRIM(reporter_name)) END) COLLATE utf8mb4_bin name_key,
            (CASE WHEN TRIM(employee_number) <> '' THEN '' ELSE LOWER(TRIM(department_label)) END) COLLATE utf8mb4_bin department_key
          FROM tickets t ${where} ${where ? 'AND' : 'WHERE'} t.requester_type = 'employee'
        ), ranked AS (
          SELECT filtered.*, COUNT(*) OVER (PARTITION BY numbered, number_key, name_key, department_key) ticket_count,
            SUM(status IN ('resolved', 'closed')) OVER (PARTITION BY numbered, number_key, name_key, department_key) closed_count,
            ROW_NUMBER() OVER (PARTITION BY numbered, number_key, name_key, department_key ORDER BY created_at DESC, id DESC) representative
          FROM filtered
        ) SELECT numbered, number_key, name_key, department_key, NULLIF(TRIM(employee_number), '') employeeNumber,
          reporter_name employeeName, department_label department, ticket_count ticketCount, closed_count closedCount, created_at latestTicketAt
          FROM ranked WHERE representative = 1
          ORDER BY ticketCount DESC, latestTicketAt DESC, employeeName COLLATE utf8mb4_unicode_ci, department COLLATE utf8mb4_unicode_ci, numbered DESC, number_key, name_key, department_key LIMIT ?`, [...values, filters.limit])
        await connection.commit()
        const total = Number(counts.total), solved = Number(counts.solved)
        return { filters: { dateFrom: filters.dateFrom, dateTo: filters.dateTo, limit: filters.limit },
          tickets: { total, solved, unsolved: total - solved, reopened: Number(counts.reopened) },
          mostReportedProblems: faults.map(({ category_key, subcategory_key, ...item }) => ({ ...item, key: JSON.stringify([category_key, subcategory_key]), ticketCount: Number(item.ticketCount) })),
          topEmployees: employees.map(({ numbered, number_key, name_key, department_key, ...item }) => ({ ...item,
            key: JSON.stringify([numbered, number_key, name_key, department_key]), ticketCount: Number(item.ticketCount),
            closedCount: Number(item.closedCount), openCount: Number(item.ticketCount) - Number(item.closedCount) })) }
      } catch (error) { await connection.rollback(); throw error }
      finally { connection.release() }
    },
  }
}
