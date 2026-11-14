import { requireAssetAccess as requireIT } from '../assets/permissions.js'
import { randomUUID } from 'node:crypto'
import { ApiError } from '../management/validation.js'
import { workingStatuses } from '../tickets/workflow.js'
import { ticketDetails } from '../tickets/ticketView.js'

const columns = { name: 'name', quantity: 'quantity', manufacturer: 'manufacturer', model: 'model', serialNumber: 'serial_number',
  holdingType: 'holding_type', departmentId: 'department_id', department: 'department_label', location: 'location',
  purchaseDate: 'purchase_date', operationalStatus: 'operational_status', conditionDescription: 'condition_description',
  maintenanceNotes: 'maintenance_notes', lastMaintenanceDate: 'last_maintenance_date' }
const join = 'FROM assets a LEFT JOIN asset_withdrawals w ON w.asset_id = a.asset_id'
const projection = 'a.*, w.ticket_id, w.source_asset_id, w.engineer_id, w.engineer_name, w.withdrawn_at'
const json = (value) => typeof value === 'string' ? JSON.parse(value) : value
const day = (value) => value instanceof Date ? value.toISOString().slice(0, 10) : value
function map(row) {
  const item = { assetId: row.asset_id }
  for (const [key, column] of Object.entries(columns)) item[key] = key.endsWith('Date') ? day(row[column]) : row[column]
  return { ...item, archivedAt: row.archived_at, version: row.version, createdAt: row.created_at, updatedAt: row.updated_at,
    sourceAssetId: row.source_asset_id ?? null, withdrawnForTicketId: row.ticket_id ?? null,
    takenByEngineerId: row.engineer_id ?? null, takenByEngineerName: row.engineer_name ?? null, withdrawnAt: row.withdrawn_at ?? null }
}



async function detail(connection, id) {
  const [[row]] = await connection.execute(`SELECT ${projection} ${join} WHERE a.asset_id = ?`, [id])
  if (!row) return null
  const [history] = await connection.execute(`SELECT id, type, actor_account_id AS actorAccountId, actor_name AS actorName,
    actor_role AS actorRole, occurred_at AS timestamp, event_data AS data FROM asset_history WHERE asset_id = ? ORDER BY sequence_number`, [id])
  return { ...map(row), history: history.map((event) => ({ ...event, data: json(event.data) })) }
}

async function audit(connection, id, type, actor, now, before, after, extra = {}) {
  const [[last]] = await connection.execute('SELECT sequence_number FROM asset_history WHERE asset_id = ? ORDER BY sequence_number DESC LIMIT 1 FOR SHARE', [id])
  const changes = before ? Object.keys(columns).filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]))
    .map((field) => ({ field, previousValue: before[field], nextValue: after[field] })) : []
  await connection.execute(`INSERT INTO asset_history (id, asset_id, type, actor_account_id, actor_name, actor_role, occurred_at, sequence_number, event_data)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [randomUUID(), id, type, actor.id, actor.full_name, actor.role, now, Number(last?.sequence_number ?? 0) + 1,
    JSON.stringify({ before, after, changes, ...extra })])
}

async function insert(connection, item, now) {
  await connection.execute(`INSERT INTO assets (asset_id, ${Object.values(columns).join(', ')}, created_at, updated_at)
    VALUES (${Array(Object.keys(columns).length + 3).fill('?').join(', ')})`,
  [item.assetId, ...Object.keys(columns).map((key) => item[key]), now, now])
}

async function department(connection, input, current = null) {
  const holdingType = input.holdingType ?? current?.holdingType
  if (holdingType === 'it_storage') {
    if (input.department) throw new ApiError(400, 'المخزون التقني لا يتبع قسمًا.')
    return { holdingType, departmentId: null, department: 'مخزن تكنولوجيا المعلومات' }
  }
  if (!Object.hasOwn(input, 'department') && current?.holdingType === 'department') {
    return { holdingType, departmentId: current.departmentId, department: current.department }
  }
  const selector = input.department
  if (!selector) throw new ApiError(400, 'اختر قسمًا نشطًا.')
  const [[row]] = await connection.execute(`SELECT id, name, is_active FROM departments WHERE ${selector.id ? 'id' : 'name'} = ? FOR SHARE`, [selector.id ?? selector.name])
  if (!row?.is_active) throw new ApiError(400, 'اختر قسمًا نشطًا.')
  return { holdingType: 'department', departmentId: row.id, department: row.name }
}

function where(filters) {
  const conditions = [], values = []
  if (!filters.includeArchived) conditions.push('a.archived_at IS NULL')
  for (const [column, value] of [['a.operational_status', filters.operationalStatus], ['a.holding_type', filters.holdingType], ['a.department_id', filters.departmentId], ['a.department_label', filters.department]]) {
    if (value && value !== 'all') { conditions.push(`${column} = ?`); values.push(value) }
  }
  if (filters.search) {
    conditions.push('(LOCATE(?, CONVERT(a.asset_id USING utf8mb4) COLLATE utf8mb4_unicode_ci) > 0 OR LOCATE(?, a.name) > 0 OR LOCATE(?, a.model) > 0 OR LOCATE(?, a.serial_number) > 0)')
    values.push(...Array(4).fill(filters.search))
  }
  return { sql: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '', values }
}

export function createMySqlAssetRepository(pool) {
  async function transaction(user, _action, run) {
    requireIT(user)
    for (let attempt = 0; attempt < 3; attempt++) {
      const connection = await pool.getConnection()
      try {
        await connection.beginTransaction()
        const [[actor]] = await connection.execute('SELECT id, full_name, role, is_active FROM users WHERE id = ? FOR SHARE', [user.id])
        if (!actor?.is_active || actor.role !== user.role) throw new ApiError(403, 'الطلب غير مسموح.')
        const result = await run(connection, actor, new Date())
        await connection.commit()
        return result
      } catch (error) {
        await connection.rollback()
        if (error.code === 'ER_LOCK_DEADLOCK' && attempt < 2) continue
        if (['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT'].includes(error.code)) throw new ApiError(409, 'تعارض متزامن. أعد تحميل السجل.')
        throw error
      } finally { connection.release() }
    }
  }

  return {
    async statistics(user) {
      requireIT(user)
      const [rows] = await pool.query('SELECT operational_status, COUNT(*) record_count, SUM(quantity) quantity FROM assets WHERE archived_at IS NULL GROUP BY operational_status')
      const result = { total: 0, recordCount: 0, working: 0, needs_maintenance: 0, out_of_service: 0, under_repair: 0, retired: 0, withdrawn: 0 }
      for (const row of rows) { result[row.operational_status] = Number(row.quantity); result.total += Number(row.quantity); result.recordCount += Number(row.record_count) }
      return result
    },
    async getById(id, user) {
      requireIT(user)
      const connection = await pool.getConnection()
      try {
        await connection.beginTransaction()
        const item = await detail(connection, id)
        await connection.commit()
        return item
      } catch (error) { await connection.rollback(); throw error }
      finally { connection.release() }
    },
    async list(filters, user, exporting = false) {
      requireIT(user)
      if (exporting && filters.includeArchived) throw new ApiError(400, 'لا يمكن تصدير السجلات المؤرشفة.')
      const condition = where(filters)
      const connection = await pool.getConnection()
      try {
        await connection.beginTransaction()
        const [[count]] = await connection.execute(`SELECT COUNT(*) AS total ${join} ${condition.sql}`, condition.values)
        if (exporting && count.total > 10000) throw new ApiError(413, 'نتائج التصدير تتجاوز 10000 سجل. ضيّق المرشحات.')
        const [rows] = await connection.query(`SELECT ${projection} ${join} ${condition.sql} ORDER BY a.asset_id LIMIT ? OFFSET ?`,
          [...condition.values, exporting ? 10000 : filters.pageSize, exporting ? 0 : (filters.page - 1) * filters.pageSize])
        await connection.commit()
        return { items: rows.map(map), total: count.total, page: filters.page, pageSize: filters.pageSize }
      } catch (error) { await connection.rollback(); throw error }
      finally { connection.release() }
    },
    async create(input, user) {
      return transaction(user, 'create', async (connection, actor, now) => {
        if (input.operationalStatus === 'withdrawn') throw new ApiError(400, 'حالة السحب محجوزة لعملية سحب الأصل.')
        const item = { ...input, ...await department(connection, input) }
        await insert(connection, item, now)
        const created = await detail(connection, item.assetId)
        await audit(connection, item.assetId, 'created', actor, now, null, { ...created, history: undefined })
        return detail(connection, item.assetId)
      })
    },
    async update(id, input, user) {
      return transaction(user, 'update', async (connection, actor, now) => {
        const [[row]] = await connection.execute('SELECT * FROM assets WHERE asset_id = ? FOR UPDATE', [id])
        if (!row) throw new ApiError(404, 'الأصل غير موجود.')
        if (row.archived_at || row.version !== input.expectedVersion) throw new ApiError(409, 'الأصل مؤرشف أو تم تعديله. أعد تحميله.')
        if ((input.operationalStatus === 'withdrawn' && row.operational_status !== 'withdrawn') ||
          (row.operational_status === 'withdrawn' && ((input.operationalStatus !== undefined && input.operationalStatus !== 'withdrawn') || (input.quantity !== undefined && input.quantity !== 1)))) {
          throw new ApiError(409, 'لا يمكن تعديل حالة أو كمية الوحدة المسحوبة.')
        }
        const before = await detail(connection, id)
        const after = { ...before, ...input, ...await department(connection, input, before), version: row.version + 1, updatedAt: now }
        await connection.execute(`UPDATE assets SET ${Object.values(columns).map((column) => `${column} = ?`).join(', ')}, version = ?, updated_at = ? WHERE asset_id = ?`,
          [...Object.keys(columns).map((key) => after[key]), after.version, now, id])
        await audit(connection, id, 'updated', actor, now, { ...before, history: undefined }, { ...after, history: undefined, expectedVersion: undefined })
        return detail(connection, id)
      })
    },
    async archive(id, expectedVersion, user) {
      return transaction(user, 'archive', async (connection, actor, now) => {
        const [[row]] = await connection.execute('SELECT * FROM assets WHERE asset_id = ? FOR UPDATE', [id])
        if (!row) throw new ApiError(404, 'الأصل غير موجود.')
        if (row.version !== expectedVersion) throw new ApiError(409, 'تم تعديل الأصل. أعد تحميله.')
        const before = await detail(connection, id)
        if (row.archived_at) return before
        await connection.execute('UPDATE assets SET archived_at = ?, updated_at = ?, version = version + 1 WHERE asset_id = ?', [now, now, id])
        await audit(connection, id, 'archived', actor, now, { ...before, history: undefined }, { ...before, history: undefined, archivedAt: now, version: row.version + 1, updatedAt: now })
        return detail(connection, id)
      })
    },
    async withdraw(id, input, user) {
      return transaction(user, 'withdraw', async (connection, actor, now) => {
        // Same user -> ticket -> stock lock order as the ticket workflow.
        const [[ticket]] = await connection.execute('SELECT * FROM tickets WHERE id = ? FOR UPDATE', [input.ticketId])
        if (!ticket) throw new ApiError(404, 'البلاغ غير موجود.')
        if (!ticket.assigned_technician_id || !workingStatuses.includes(ticket.status)) throw new ApiError(409, 'البلاغ غير نشط.')
        if (ticket.related_asset_id) throw new ApiError(409, 'تم سحب وحدة لهذا البلاغ بالفعل.')
        const [[source]] = await connection.execute('SELECT * FROM assets WHERE asset_id = ? FOR UPDATE', [id])
        if (!source) throw new ApiError(404, 'الأصل غير موجود.')
        if (source.archived_at || source.operational_status !== 'working' || source.quantity < 1 ||
          (input.expectedVersion !== undefined && input.expectedVersion !== source.version)) throw new ApiError(409, 'الأصل غير متاح للسحب أو تم تعديله.')
        // Establish the read snapshot only after stock locking, so a waiter sees
        // every audit entry committed by preceding withdrawals from this stock.
        const [[used]] = await connection.execute('SELECT ticket_id FROM asset_withdrawals WHERE ticket_id = ?', [ticket.id])
        if (used) throw new ApiError(409, 'تم سحب وحدة لهذا البلاغ بالفعل.')
        const before = map(source), split = source.quantity > 1
        const withdrawnId = split ? `WD-${randomUUID().replaceAll('-', '').toUpperCase()}` : id
        const unit = { ...before, assetId: withdrawnId, quantity: 1, operationalStatus: 'withdrawn', location: `بعهدة المهندس ${actor.full_name}`,
          serialNumber: split ? '' : before.serialNumber }
        if (split) {
          await connection.execute('UPDATE assets SET quantity = quantity - 1, version = version + 1, updated_at = ? WHERE asset_id = ? AND quantity > 1', [now, id])
          await insert(connection, unit, now)
        } else {
          await connection.execute("UPDATE assets SET operational_status = 'withdrawn', location = ?, version = version + 1, updated_at = ? WHERE asset_id = ?", [unit.location, now, id])
        }
        await connection.execute('INSERT INTO asset_withdrawals (ticket_id, asset_id, source_asset_id, engineer_id, engineer_name, withdrawn_at) VALUES (?, ?, ?, ?, ?, ?)',
          [ticket.id, withdrawnId, id, actor.id, actor.full_name, now])
        const extra = { ticketId: ticket.id, sourceAssetId: id, withdrawnAssetId: withdrawnId, engineerId: actor.id, engineerName: actor.full_name }
        const sourceAfter = await detail(connection, id)
        await audit(connection, id, 'withdrawn', actor, now, before, { ...sourceAfter, history: undefined }, extra)
        if (split) {
          const withdrawn = await detail(connection, withdrawnId)
          await audit(connection, withdrawnId, 'withdrawn', actor, now, null, { ...withdrawn, history: undefined }, extra)
        }
        await connection.execute('UPDATE tickets SET related_asset_id = ?, version = version + 1, updated_at = ? WHERE id = ?', [withdrawnId, now, ticket.id])
        const [[last]] = await connection.execute('SELECT sequence_number FROM ticket_history WHERE ticket_id = ? ORDER BY sequence_number DESC LIMIT 1 FOR SHARE', [ticket.id])
        await connection.execute(`INSERT INTO ticket_history (id, ticket_id, type, status, actor_account_id, actor_name, actor_role, occurred_at, sequence_number, note, visibility, event_data)
          VALUES (?, ?, 'asset_withdrawal', ?, ?, ?, ?, ?, ?, ?, 'internal', ?)`,
        [randomUUID(), ticket.id, ticket.status, actor.id, actor.full_name, actor.role, now, Number(last?.sequence_number ?? 0) + 1,
          `سحب المهندس ${actor.full_name} وحدة من الأصل ${id}`, JSON.stringify(extra)])
        return { asset: await detail(connection, withdrawnId), remainingSource: split ? await detail(connection, id) : null,
          ticket: await ticketDetails(connection, { ...ticket, related_asset_id: withdrawnId, version: ticket.version + 1, updated_at: now }, user) }
      })
    },
  }
}
