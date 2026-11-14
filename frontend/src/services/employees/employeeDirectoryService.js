import { httpClient } from '../auth/authService.js'

export const employeeDirectoryService = {
  async list(search = '', page = 1, signal) {
    const query = new URLSearchParams()
    if (search.trim()) query.set('search', search.trim())
    query.set('page', String(page))
    return httpClient.request(`/employees?${query}`, { signal })
  },
  async departments(signal) {
    return (await httpClient.request('/departments?activeOnly=true', { signal })).items
  },
  async create(input) {
    return (await httpClient.request('/employees', { method: 'POST', body: input })).item
  },
}
