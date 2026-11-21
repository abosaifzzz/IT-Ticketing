import { randomUUID } from 'node:crypto'
import { ApiError } from '../management/validation.js'
import { requireActionRole, transition, workingStatuses } from '../tickets/workflow.js'
import { ticketDetails, mapTicket } from '../tickets/ticketView.js'
import { NOTIFICATION_TYPES } from '../notifications/service.js'

export function createMySqlTicketWorkflowRepository(pool, { notifications } = {}) {
  return {
    async execute(id, action, input, user) {
      requireActionRole(action, user.role)
      for (let attempt = 0; attempt < 3; attempt++) {
        const connection = await pool.getConnection()
        try {
          await connection.beginTransaction()
          // Lock identities in a fixed order before the ticket. Availability/account edits
          // serialize with this check; ticket locking serializes all history and state writes.
          const actors = new Map()
          for (const userId of [...new Set([user.id, ...(action === 'assign' ? [input.technicianId] : [])])].sort()) {
            const [[row]] = await connection.execute('SELECT id, full_name, role, is_active, is_available FROM users WHERE id = ? FOR SHARE', [userId])
            actors.set(userId, row)
          }
          const actor = actors.get(user.id)
          if (!actor?.is_active || actor.role !== user.role) throw new ApiError(403, 'الطلب غير مسموح.')
          const [[ticket]] = await connection.execute('SELECT * FROM tickets WHERE id = ? FOR UPDATE', [id])
          if (!ticket) throw new ApiError(404, 'البلاغ غير موجود.')
          if (!['assign', 'claim'].includes(action)) {
            const allowed = actor.role === 'employee' ? ticket.reporter_account_id === actor.id : ticket.assigned_technician_id === actor.id
            if (!allowed) throw new ApiError(404, 'البلاغ غير موجود.')
          }
          if (input.expectedVersion !== undefined && ticket.version !== input.expectedVersion) throw new ApiError(409, 'تم تعديل البلاغ. حدّث الصفحة وحاول مجددًا.')
          const now = new Date(), changes = {}, events = []
          const event = (type, status, note = null, data = null, visibility = 'public') => events.push({ type, status, note, data, visibility })
          if (action === 'assign' || action === 'claim') {
            const engineer = action === 'claim' ? actor : actors.get(input.technicianId)
            if (!engineer?.is_active || engineer.role !== 'technician') throw new ApiError(400, 'اختر مهندسًا نشطًا.')
            if (action === 'claim' && (!actor.is_available || ticket.status !== 'new' || ticket.assigned_technician_id)) {
              throw new ApiError(409, 'البلاغ غير متاح للتولي أو المهندس غير متاح حاليًا.')
            }
            if (action === 'assign' && ticket.assigned_technician_id === engineer.id) {
              const item = await ticketDetails(connection, ticket, user)
              await connection.commit()
              return item
            }
            const status = ticket.status === 'new' ? 'assigned' : ticket.status
            Object.assign(changes, { assigned_technician_id: engineer.id, assigned_technician_name: engineer.full_name,
              assigned_at: now, status, assigned_by_manager_id: action === 'assign' ? actor.id : null,
              assigned_by_manager_name: action === 'assign' ? actor.full_name : null,
              assigned_by_technician_id: action === 'claim' ? actor.id : null,
              assigned_by_technician_name: action === 'claim' ? actor.full_name : null })
            event(action === 'claim' ? 'claim' : 'assignment', status, null, {
              previousStatus: ticket.status, previousTechnicianId: ticket.assigned_technician_id,
              previousTechnicianName: ticket.assigned_technician_name,
              technicianId: engineer.id, technicianName: engineer.full_name,
              assignedByManagerId: changes.assigned_by_manager_id, assignedByManagerName: changes.assigned_by_manager_name,
              assignedByTechnicianId: changes.assigned_by_technician_id, assignedByTechnicianName: changes.assigned_by_technician_name,
            })
            // An engineer who claims a ticket is starting on it: record the start in the same transaction.
            if (action === 'claim') {
              changes.status = 'in_progress'
              event('status', 'in_progress', null, { previousStatus: status })
            }
          } else if (action === 'status') {
            changes.status = transition(input.status, ticket.status)
            changes.pending_reason = input.status === 'pending' ? input.text : null
            changes.pending_at = input.status === 'pending' ? now : null
            if (input.status === 'resolved') Object.assign(changes, { solution_description: input.text, resolved_at: now, resolution_confirmed_at: null })
            if (input.status === 'resolved') {
              event('resolution', 'resolved', input.text, { previousStatus: ticket.status })
              event('status', 'closed', null, { previousStatus: 'resolved' })
            } else event('status', changes.status, input.text ?? null, { previousStatus: ticket.status })
          } else if (action === 'note' || action === 'comment') {
            if (action === 'note' && ![...workingStatuses, 'resolved', 'closed'].includes(ticket.status)) throw new ApiError(409, 'حالة البلاغ لا تسمح بإضافة ملاحظات.')
            event(action === 'note' ? 'technician_note' : 'comment', ticket.status, input.text, null, input.visibility ?? 'public')
          } else if (action === 'confirm' || action === 'reopen') {
            changes.status = transition(action, ticket.status)
            if (action === 'confirm') {
              if (ticket.resolution_confirmed_at) throw new ApiError(409, 'تم تأكيد حل البلاغ مسبقًا.')
              changes.resolution_confirmed_at = now
              event('confirmation', 'closed', 'أكد الموظف حل المشكلة', { previousStatus: ticket.status })
              if (ticket.status !== 'closed') event('status', 'closed', null, { previousStatus: ticket.status })
            } else {
              Object.assign(changes, { reopening_reason: input.text, reopened_at: now, resolution_confirmed_at: null })
              event('reopened', 'reopened', input.text, { previousStatus: ticket.status })
            }
          }
          changes.version = ticket.version + 1
          changes.updated_at = now
          const entries = Object.entries(changes)
          await connection.execute(`UPDATE tickets SET ${entries.map(([column]) => `${column} = ?`).join(', ')} WHERE id = ?`, [...entries.map(([, value]) => value), id])
          const [[last]] = await connection.execute('SELECT sequence_number FROM ticket_history WHERE ticket_id = ? ORDER BY sequence_number DESC LIMIT 1 FOR SHARE', [id])
          let sequence = Number(last?.sequence_number ?? 0)
          for (const entry of events) {
            const eventId = randomUUID()
            await connection.execute(`INSERT INTO ticket_history
              (id, ticket_id, type, status, actor_account_id, actor_name, actor_role, occurred_at, sequence_number, note, visibility, event_data)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [eventId, id, entry.type, entry.status, actor.id, actor.full_name, actor.role, now, ++sequence, entry.note, entry.visibility, entry.data ? JSON.stringify(entry.data) : null])
            const type = { assignment: NOTIFICATION_TYPES.ASSIGNMENT, claim: NOTIFICATION_TYPES.ASSIGNMENT,
              resolution: NOTIFICATION_TYPES.RESOLVED, reopened: NOTIFICATION_TYPES.REOPENED }[entry.type]
            if (notifications && type) await notifications.record(connection, { eventId, type, ticket: mapTicket({ ...ticket, ...changes }), now })
          }
          const item = await ticketDetails(connection, { ...ticket, ...changes }, user)
          await connection.commit()
          return item
        } catch (error) {
          await connection.rollback()
          if (error.code === 'ER_LOCK_DEADLOCK' && attempt < 2) continue
          if (['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT'].includes(error.code)) throw new ApiError(409, 'تعارض متزامن. حدّث البلاغ وحاول مجددًا.')
          throw error
        } finally { connection.release() }
      }
    },
  }
}
