import { createHash, randomUUID } from 'node:crypto'
import { ApiError } from '../management/validation.js'
import { mapTicket as map, mapTicketForUser, ticketScope as scope, ticketReadScope as readScope, ticketDetails as details } from '../tickets/ticketView.js'
import { NOTIFICATION_TYPES } from '../notifications/service.js'

async function activeReference(connection, table, selector) {
  if (!selector) return null
  const [rows] = await connection.execute(`SELECT * FROM ${table} WHERE ${selector.id ? 'id' : 'name'} = ? FOR SHARE`, [selector.id ?? selector.name])
  if (!rows[0] || !rows[0].is_active) throw new ApiError(400, 'اختر قسمًا وتصنيفات نشطة وصحيحة.')
  return rows[0]
}

export function createMySqlTicketRepository(pool, { notifications } = {}) {
  async function replay(connection, user, key, fingerprint) {
    if (!key) return null
    const [[row]] = await connection.execute('SELECT * FROM tickets WHERE created_by_account_id = ? AND client_request_id = ?', [user.id, key])
    if (!row) return null
    if (row.request_fingerprint !== fingerprint) throw new ApiError(409, 'معرف الطلب مستخدم لبلاغ مختلف.')
    if (user.role === 'employee' && row.reporter_account_id !== user.id) throw new ApiError(404, 'البلاغ غير موجود.')
    if (user.role === 'technician' && row.assigned_technician_id !== user.id &&
      !(row.source === 'manual' && row.created_by_role === 'technician' && row.version === 0)) {
      throw new ApiError(404, 'البلاغ غير موجود.')
    }
    return details(connection, row, user)
  }
  return {
    async create(input, user) {
      scope(user)
      const fingerprint = createHash('sha256').update(JSON.stringify(input)).digest('hex')
      const connection = await pool.getConnection()
      try {
        await connection.beginTransaction()
        const [[actor]] = await connection.execute('SELECT id, full_name, role, is_active FROM users WHERE id = ? FOR SHARE', [user.id])
        if (!actor?.is_active || actor.role !== user.role) throw new ApiError(403, 'الطلب غير مسموح.')
        const existing = await replay(connection, user, input.clientRequestId, fingerprint)
        if (existing) { await connection.commit(); return { item: existing, created: false } }
        let reporterName = input.reporterName, departmentSelector = input.department
        if (input.reporterEmployeeId) {
          const [[employee]] = await connection.execute('SELECT full_name, department_id, is_active FROM employee_directory WHERE id=? FOR SHARE', [input.reporterEmployeeId])
          if (!employee?.is_active) throw new ApiError(400, 'اختر موظفًا نشطًا من القائمة.')
          if ((reporterName && reporterName !== employee.full_name) || input.employeeNumber ||
            (departmentSelector?.id && departmentSelector.id !== employee.department_id)) throw new ApiError(400, 'بيانات الموظف والقسم غير متطابقة. أعد الاختيار.')
          reporterName = employee.full_name
          departmentSelector = { id: employee.department_id }
        }
        const department = await activeReference(connection, 'departments', departmentSelector)
        if (input.reporterEmployeeId && input.department?.name && input.department.name !== department.name) throw new ApiError(400, 'القسم غير مطابق للموظف.')
        const category = await activeReference(connection, 'fault_categories', input.category)
        let subcategory = null
        if (input.subcategory) {
          const [rows] = await connection.execute(`SELECT * FROM fault_subcategories WHERE ${input.subcategory.id ? 'id' : 'name'} = ? AND category_id = ? FOR SHARE`,
            [input.subcategory.id ?? input.subcategory.name, category.id])
          if (!rows[0]?.is_active) throw new ApiError(400, 'التصنيف الفرعي غير نشط أو لا يتبع التصنيف المختار.')
          subcategory = rows[0]
        }
        let engineer = null
        if (input.assignedTechnicianId) {
          if (actor.role !== 'manager' || input.source !== 'manual') throw new ApiError(403, 'الطلب غير مسموح.')
          const [[row]] = await connection.execute("SELECT id, full_name FROM users WHERE id = ? AND role = 'technician' AND is_active = TRUE FOR SHARE", [input.assignedTechnicianId])
          if (!row) throw new ApiError(400, 'اختر مهندسًا نشطًا.')
          engineer = row
        }
        const id = randomUUID(), now = new Date()
        await connection.execute(`INSERT INTO tickets (
          id, reporter_account_id, reporter_name, employee_number, department_id, department_label,
          category_id, category_label, subcategory_id, subcategory_label, title, description, source, created_for,
          requester_type, management_position, created_by_account_id, created_by_name, created_by_role,
          status, assigned_technician_id, assigned_technician_name, assigned_at, assigned_by_manager_id,
          assigned_by_manager_name, client_request_id, request_fingerprint, created_at, updated_at
        ) VALUES (${Array(29).fill('?').join(', ')})`,
        [id, input.source === 'portal' ? actor.id : null, reporterName, input.employeeNumber, department?.id ?? null, department?.name ?? null,
          category.id, category.name, subcategory?.id ?? null, subcategory?.name ?? 'عام', input.title, input.description,
          input.source, input.createdFor, input.requesterType, input.managementPosition, actor.id, actor.full_name, actor.role,
          engineer ? 'assigned' : 'new', engineer?.id ?? null, engineer?.full_name ?? null, engineer ? now : null,
          engineer ? actor.id : null, engineer ? actor.full_name : null, input.clientRequestId, fingerprint, now, now])
        const createdEventId = randomUUID(), assignmentEventId = engineer ? randomUUID() : null
        await connection.execute(`INSERT INTO ticket_history (id, ticket_id, type, status, actor_account_id, actor_name, actor_role, occurred_at, sequence_number) VALUES (?, ?, 'status', 'new', ?, ?, ?, ?, 1)`,
          [createdEventId, id, actor.id, actor.full_name, actor.role, now])
        if (engineer) {
          await connection.execute(`INSERT INTO ticket_history (id, ticket_id, type, status, actor_account_id, actor_name, actor_role, occurred_at, sequence_number, event_data) VALUES (?, ?, 'assignment', 'assigned', ?, ?, ?, ?, 2, ?)`,
            [assignmentEventId, id, actor.id, actor.full_name, actor.role, now, JSON.stringify({ technicianId: engineer.id, technicianName: engineer.full_name, assignedByManagerId: actor.id, assignedByManagerName: actor.full_name })])
        }
        const [[row]] = await connection.execute('SELECT * FROM tickets WHERE id = ?', [id])
        if (notifications) {
          await notifications.record(connection, { eventId: createdEventId, type: NOTIFICATION_TYPES.NEW_TICKET, ticket: map(row), now })
          if (assignmentEventId) await notifications.record(connection, { eventId: assignmentEventId, type: NOTIFICATION_TYPES.ASSIGNMENT, ticket: map(row), now })
        }
        const item = await details(connection, row, user)
        await connection.commit()
        return { item, created: true }
      } catch (error) {
        await connection.rollback()
        if (error.code === 'ER_DUP_ENTRY' && input.clientRequestId) {
          const existing = await replay(connection, user, input.clientRequestId, fingerprint)
          if (existing) return { item: existing, created: false }
        }
        throw error
      } finally { connection.release() }
    },
    async getById(id, user) {
      const access = readScope(user)
      const connection = await pool.getConnection()
      try {
        await connection.beginTransaction()
        const [[row]] = await connection.execute(`SELECT * FROM tickets WHERE id = ? AND ${access.sql}`, [id, ...access.values])
        const item = row ? await details(connection, row, user) : null
        await connection.commit()
        return item
      } catch (error) { await connection.rollback(); throw error }
      finally { connection.release() }
    },
    async listUnassigned(filters, user) {
      if (!['technician', 'manager'].includes(user.role)) throw new ApiError(403, 'الطلب غير مسموح.')
      // The queue deliberately exposes only summaries, never unassigned-ticket details.
      const page = filters.page, pageSize = filters.pageSize
      const connection = await pool.getConnection()
      try {
        await connection.beginTransaction()
        const [[count]] = await connection.query("SELECT COUNT(*) total FROM tickets WHERE status = 'new' AND assigned_technician_id IS NULL")
        const [rows] = await connection.query(`SELECT id, CONCAT('IT', ticket_sequence - 1) AS reference, title, department_label AS department, category_label AS category,
        subcategory_label AS subcategory, status, created_at AS createdAt FROM tickets
        WHERE status = 'new' AND assigned_technician_id IS NULL ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
      [pageSize, (page - 1) * pageSize])
        await connection.commit()
        return { items: rows, total: Number(count.total), page, pageSize }
      } catch (error) { await connection.rollback(); throw error }
      finally { connection.release() }
    },
    async list(filters, user) {
      const access = user.role === 'technician' && filters.scope === 'all' ? readScope(user) : scope(user)
      const where = [access.sql], params = [...access.values]
      if (filters.status !== 'all') { where.push('status = ?'); params.push(filters.status) }
      if (filters.assignment !== 'all') where.push(`assigned_technician_id IS ${filters.assignment === 'assigned' ? 'NOT ' : ''}NULL`)
      for (const [field, value] of [['department_id', filters.departmentId], ['category_id', filters.categoryId]]) {
        if (value) { where.push(`${field} = ?`); params.push(value) }
      }
      if (filters.relatedAssetId) { where.push('related_asset_id = ?'); params.push(filters.relatedAssetId) }
      if (filters.creationDate) {
        where.push('created_at >= ? AND created_at < ?')
        params.push(filters.creationDate, new Date(filters.creationDate.getTime() + 86400000))
      }
      if (filters.search) {
        const columns = user.role === 'employee' ? ['id', 'reference', 'title'] : ['id', 'reference', 'title', 'reporter_name', 'department_label', 'assigned_technician_name']
        // LOCATE treats SQL wildcard characters as literal search text.
        where.push(`(${columns.map((column) => `LOCATE(?, ${column === 'id' ? 'CONVERT(id USING utf8mb4) COLLATE utf8mb4_unicode_ci' : column === 'reference' ? "CONVERT(CONCAT('IT', ticket_sequence - 1) USING utf8mb4) COLLATE utf8mb4_unicode_ci" : column}) > 0`).join(' OR ')})`)
        params.push(...columns.map(() => filters.search))
      }
      const order = filters.sort === 'oldest' ? 'ASC' : 'DESC'
      const sortColumn = user.role === 'technician' && filters.scope !== 'all' ? 'assigned_at' : 'created_at'
      const connection = await pool.getConnection()
      try {
        await connection.beginTransaction()
        const [[count]] = await connection.execute(`SELECT COUNT(*) AS total FROM tickets WHERE ${where.join(' AND ')}`, params)
        const [rows] = await connection.query(`SELECT * FROM tickets WHERE ${where.join(' AND ')} ORDER BY ${sortColumn} ${order}, id ${order} LIMIT ? OFFSET ?`,
          [...params, filters.pageSize, (filters.page - 1) * filters.pageSize])
        await connection.commit()
        return { items: rows.map((row) => mapTicketForUser(row, user)), total: count.total, page: filters.page, pageSize: filters.pageSize }
      } catch (error) { await connection.rollback(); throw error }
      finally { connection.release() }
    },
  }
}
