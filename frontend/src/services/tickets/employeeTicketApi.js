import { deriveTicketTitle } from './deriveTicketTitle.js'

export function createEmployeeTicketApi(client) {
  const query = (filters) => {
    const allowed = ['search', 'status', 'creationDate', 'sort', 'page', 'pageSize', 'scope']
    return new URLSearchParams(Object.entries(filters).filter(([key, value]) => allowed.includes(key) && value !== '' && value !== undefined)).toString()
  }
  const item = async (path, options) => (await client.request(path, options)).item
  return {
    list(filters = {}, signal) { return client.request('/tickets?' + query(filters), { signal }) },
    summary(signal) { return client.request('/dashboard', { signal }) },
    details(id, signal) { return item('/tickets/' + encodeURIComponent(id), { signal }) },
    async options(signal) {
      const [departments, categories, subcategories] = await Promise.all(['/departments', '/fault-categories', '/fault-subcategories'].map((path) => client.request(path, { signal })))
      return { departments: departments.items, categories: categories.items.map((category) => ({ ...category, subcategories: subcategories.items.filter((sub) => sub.categoryId === category.id) })) }
    },
    create(form, clientRequestId) {
      // Explicit allowlist. Ownership, source, status and actor fields are never submitted.
      const body = { categoryId: form.category,
        title: deriveTicketTitle(form.description), description: form.description.trim(), clientRequestId,
        ...(form.departmentId ? { departmentId: form.departmentId } : {}),
        ...(form.anydeskId ? { anydeskId: form.anydeskId } : {}),
        ...(form.subcategory ? { subcategoryId: form.subcategory } : {}) }
      return item('/tickets', { method: 'POST', body })
    },
    comment(ticket, text) { return item('/tickets/' + ticket.id + '/comments', { method: 'POST', body: { text, expectedVersion: ticket.version } }) },
    confirm(ticket) { return item('/tickets/' + ticket.id + '/confirm-resolution', { method: 'POST', body: { expectedVersion: ticket.version } }) },
    reopen(ticket, reason) { return item('/tickets/' + ticket.id + '/reopen', { method: 'POST', body: { reason, expectedVersion: ticket.version } }) },
  }
}
