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
    details: tickets.details, summary: tickets.summary, options: tickets.options,
    userOptions(search = '', page = 1, signal) { return client.request('/user-options?' + new URLSearchParams({ search: search.trim(), page: String(page) }), { signal }) },
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
        // IT tickets ('it_internal') carry no requester, department or contact fields.
        ...(form.requesterType === 'employee' ? { reporterUserId: form.reporterUserId, departmentId: form.departmentId, ...(form.reporterPhone ? { reporterPhone: form.reporterPhone.trim() } : {}) } : form.requesterType === 'it_internal' ? {} : {
          reporterName: form.reporterName.trim(),
          managementPosition: form.managementPosition.trim(),
        }),
        title: deriveTicketTitle(form.description), description: form.description.trim(),
        // IT tickets are direct commands without a fault category.
        ...(form.requesterType === 'it_internal' ? {} : { categoryId: form.category, ...(form.subcategory ? { subcategoryId: form.subcategory } : {}) }), clientRequestId,
        ...(form.anydeskId ? { anydeskId: form.anydeskId } : {}),
      } })
    },
    assets(search = '', page = 1, signal) { return client.request('/assets?' + new URLSearchParams({ search, operationalStatus: 'working', page, pageSize: 10 }), { signal }) },
    asset(id, signal) { return item('/assets/' + encodeURIComponent(id), { signal }) },
    // Asset registry (asset-management/simple): pick an asset and record it as used for the ticket.
    registryAssets(search = '', page = 1, signal) { return client.request('/asset-management/simple/assets?' + new URLSearchParams({ search, page, pageSize: 10 }), { signal }) },
    linkAsset(ticket, assetId, clientRequestId) { return client.request('/asset-management/ticket-links', { method: 'POST', body: { assetId, ticketId: ticket.id, clientRequestId } }) },
    withdraw(ticket, asset) {
      // expectedVersion is the STOCK record version, not the ticket version.
      return client.request('/assets/' + encodeURIComponent(asset.assetId) + '/withdraw', { method: 'POST', body: { ticketId: ticket.id, expectedVersion: asset.version } })
    },
  }
}
