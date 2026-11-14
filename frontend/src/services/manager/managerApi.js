import { createEngineerTicketApi } from '../tickets/engineerTicketApi.js'
const query = (filters, allowed) => new URLSearchParams(Object.entries(filters).filter(([key,value]) => allowed.includes(key) && value !== '' && value !== undefined)).toString()
export function engineerLabel(user) { return user.fullName + ' — ' + user.activeTicketCount + ' تذكرة نشطة' + (!user.isAvailable ? ' — غير متاح مؤقتًا' : '') }
export function createManagerApi(client) {
  const engineer = createEngineerTicketApi(client)
  const item = async (path, options) => (await client.request(path, options)).item
  const resources = ['departments','fault-categories','fault-subcategories','it-users']
  const resource = (name) => { if (!resources.includes(name)) throw Error('Invalid resource'); return '/' + name }
  const fields = (name, input) => Object.fromEntries((name === 'it-users' ? ['username','fullName','role','isActive'] : name === 'fault-subcategories' ? ['name','categoryId','isActive'] : ['name','isActive']).filter(key => input[key] !== undefined).map(key => [key,input[key]]))
  return {
    summary: engineer.summary, details: engineer.details, recurring: engineer.recurring, employeeOptions: engineer.employeeOptions,
    list(filters = {}, signal) { return client.request('/tickets?' + query(filters,['search','status','creationDate','sort','departmentId','categoryId','assignment','page','pageSize']),{signal}) },
    records(name, filters = {}, signal) { return client.request(resource(name) + '?' + query(filters,['search','activeOnly','role','categoryId']),{signal}) },
    save(name, record) { return item(resource(name) + (record.id ? '/' + encodeURIComponent(record.id) : ''), {method:record.id ? 'PATCH' : 'POST',body:fields(name,record)}) },
    async options(signal) {
      const [departments,categories,subcategories,engineers] = await Promise.all([
        ...['departments','fault-categories','fault-subcategories'].map(name => this.records(name,{activeOnly:true},signal)),
        this.records('it-users',{activeOnly:true,role:'technician'},signal)])
      return {departments:departments.items,categories:categories.items.map(category => ({...category,subcategories:subcategories.items.filter(sub => sub.categoryId === category.id)})),engineers:engineers.items}
    },
    async manual(form,key) {
      // Reuse the allowlisted manual payload and add only the optional manager assignment.
      const bridge = createEngineerTicketApi({request(path, options) { return client.request(path,{...options,body:{...options.body,...(form.assignedTechnicianId ? {assignedTechnicianId:form.assignedTechnicianId} : {})}}) }})
      return bridge.manual(form,key)
    },
    assign(ticket, technicianId) { return item('/tickets/' + encodeURIComponent(ticket.id) + '/assignment',{method:'POST',body:{technicianId,expectedVersion:ticket.version}}) },
    report(filters,signal) { return client.request('/reports?' + query(filters,['dateFrom','dateTo','limit']),{signal}) },
    exportReport(filters) { return client.request('/reports/export.csv?' + query(filters,['dateFrom','dateTo','limit']),{responseType:'csv'}) },
  }
}
