import { createEmployeeTicketApi } from './employeeTicketApi.js'
import { deriveTicketTitle } from './deriveTicketTitle.js'

export function assignmentSource(ticket) {
  if (ticket.assignedByTechnicianId) return 'إسناد ذاتي بواسطة ' + (ticket.assignedByTechnicianName || ticket.assignedTechnician || 'المهندس')
  return ticket.assignedByManagerName || 'لم يتم الإسناد بواسطة مدير'
}
export function createEngineerTicketApi(client) {
  const tickets = createEmployeeTicketApi(client)
  const item = async (path, options) => (await client.request(path, options)).item
  const action = (ticket, path, body) => item('/tickets/' + encodeURIComponent(ticket.id) + '/' + path, { method: 'POST', body: { ...body, expectedVersion: ticket.version } })
  return {
    list: tickets.list, allTickets(filters = {}, signal) { return tickets.list({ ...filters, scope: 'all' }, signal) },
    details: tickets.details, summary: tickets.summary, options: tickets.options, employeeOptions: tickets.employeeOptions,
    ownState(userId, signal) { return item('/it-users/' + encodeURIComponent(userId), { signal }) },
    availability(isAvailable) { return item('/it-users/me/availability', { method: 'PATCH', body: { isAvailable } }) },
    recurring(signal) { return client.request('/dashboard/recurring-problems', { signal }) },
    unassigned(page = 1, signal) { return client.request('/tickets/unassigned?page=' + page + '&pageSize=10', { signal }) },
    claim(id) { return item('/tickets/' + encodeURIComponent(id) + '/claim', { method: 'POST', body: {} }) },
    start(ticket) { return action(ticket, 'status', { status: 'in_progress' }) },
    pending(ticket, pendingReason) { return action(ticket, 'status', { status: 'pending', pendingReason }) },
    resolve(ticket, solutionDescription) { return action(ticket, 'status', { status: 'resolved', solutionDescription }) },
    note(ticket, text, visibility) { return action(ticket, 'notes', { text, visibility }) },
    manual(form, clientRequestId) {
      return item('/tickets', { method: 'POST', body: {
        requesterType: form.requesterType,
        ...(form.requesterType === 'employee' ? { reporterEmployeeId: form.reporterEmployeeId } : {
          reporterName: form.reporterName.trim(),
          managementPosition: form.managementPosition.trim(),
        }),
        title: deriveTicketTitle(form.description), categoryId: form.category, description: form.description.trim(),
        ...(form.subcategory ? { subcategoryId: form.subcategory } : {}), clientRequestId,
      } })
    },
    assets(search = '', page = 1, signal) { return client.request('/assets?' + new URLSearchParams({ search, operationalStatus: 'working', page, pageSize: 10 }), { signal }) },
    asset(id, signal) { return item('/assets/' + encodeURIComponent(id), { signal }) },
    withdraw(ticket, asset) {
      // expectedVersion is the STOCK record version, not the ticket version.
      return client.request('/assets/' + encodeURIComponent(asset.assetId) + '/withdraw', { method: 'POST', body: { ticketId: ticket.id, expectedVersion: asset.version } })
    },
  }
}
