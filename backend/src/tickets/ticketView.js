import { ApiError } from '../management/validation.js'

export function mapTicket(row) {
  return {
    id: row.id, reference: row.ticket_sequence == null ? null : `IT${BigInt(row.ticket_sequence) - 1n}`, reporterAccountId: row.reporter_account_id, reporterName: row.reporter_name,
    employeeNumber: row.employee_number, departmentId: row.department_id, department: row.department_label,
    categoryId: row.category_id, category: row.category_label, subcategoryId: row.subcategory_id, subcategory: row.subcategory_label,
    title: row.title, description: row.description, source: row.source, createdFor: row.created_for,
    requesterType: row.requester_type, managementPosition: row.management_position,
    createdByAccountId: row.created_by_account_id, createdByName: row.created_by_name, createdByRole: row.created_by_role,
    status: row.status, assignedTechnicianId: row.assigned_technician_id, assignedTechnician: row.assigned_technician_name,
    assignedAt: row.assigned_at, assignedByManagerId: row.assigned_by_manager_id, assignedByManagerName: row.assigned_by_manager_name,
    assignedByTechnicianId: row.assigned_by_technician_id, assignedByTechnicianName: row.assigned_by_technician_name,
    pendingReason: row.pending_reason, pendingAt: row.pending_at, solutionDescription: row.solution_description,
    resolvedAt: row.resolved_at, resolutionConfirmedAt: row.resolution_confirmed_at,
    reopeningReason: row.reopening_reason, reopenedAt: row.reopened_at, version: row.version,
    relatedAssetId: row.related_asset_id ?? null, createdAt: row.created_at, updatedAt: row.updated_at,
  }
}

export function mapTicketForUser(row, user) {
  const item = mapTicket(row)
  if (user.role === 'employee') delete item.solutionDescription
  return item
}

export function ticketScope(user) {
  if (user.role === 'employee') return { sql: 'reporter_account_id = ?', values: [user.id] }
  if (user.role === 'technician') return { sql: 'assigned_technician_id = ?', values: [user.id] }
  if (user.role === 'manager') return { sql: '1 = 1', values: [] }
  throw new ApiError(403, 'الطلب غير مسموح.')
}

// Engineers may inspect the shared queue, but workflow mutations remain scoped
// to the engineer actually assigned to the ticket in the workflow repository.
export function ticketReadScope(user) {
  if (user.role === 'technician' || user.role === 'manager') return { sql: '1 = 1', values: [] }
  return ticketScope(user)
}

export async function ticketDetails(connection, row, user) {
  const employee = user.role === 'employee'
  const [rows] = await connection.execute(`SELECT id, type, status, actor_account_id AS actorAccountId,
    actor_name AS actorName, actor_role AS actorRole, occurred_at AS timestamp, note, visibility, event_data AS data
    FROM ticket_history WHERE ticket_id = ? ${employee ? "AND visibility = 'public'" : ''} ORDER BY sequence_number`, [row.id])
  const history = rows.map((event) => ({ ...event,
    note: employee && event.type === 'resolution' ? null : event.note,
    data: typeof event.data === 'string' ? JSON.parse(event.data) : event.data }))
  const notes = (visibility) => history.filter((event) => event.type === 'technician_note' && event.visibility === visibility)
    .map((event) => ({ id: event.id, authorAccountId: event.actorAccountId, authorName: event.actorName, text: event.note, visibility, createdAt: event.timestamp }))
  return { ...mapTicketForUser(row, user), history, publicTechnicianNotes: notes('public'),
    ...(!employee ? { internalTechnicianNotes: notes('internal') } : {}),
    comments: history.filter((event) => event.type === 'comment')
      .map((event) => ({ id: event.id, authorAccountId: event.actorAccountId, authorName: event.actorName, text: event.note, createdAt: event.timestamp })) }
}
