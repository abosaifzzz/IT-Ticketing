import { ApiError, fields, invalid, text, uuid } from '../management/validation.js'
import { assetId } from '../assets/validation.js'

export const ticketStatuses = Object.freeze(['new', 'assigned', 'in_progress', 'pending', 'resolved', 'closed', 'reopened'])

function optionalText(value, max) {
  return value === undefined || value === '' ? '' : text(value, max)
}

function reference(body, name, required) {
  const id = body[`${name}Id`], label = body[name]
  const hasId = id !== undefined && id !== null && id !== ''
  const hasLabel = label !== undefined && label !== ''
  if (hasId && hasLabel) invalid()
  if (hasId) return { id: uuid(id) }
  if (hasLabel) return { name: text(label) }
  if (required) invalid()
  return null
}

export function ticketInput(body, user) {
  fields(body, ['reporterEmployeeId', 'reporterName', 'employeeNumber', 'departmentId', 'department', 'categoryId', 'category',
    'subcategoryId', 'subcategory', 'title', 'description', 'source', 'createdFor', 'requesterType',
    'managementPosition', 'clientRequestId', 'assignedTechnicianId'])
  const source = body.source ?? (user.role === 'employee' ? 'portal' : 'manual')
  if (!['portal', 'manual'].includes(source)) invalid()
  if ((source === 'portal' && user.role !== 'employee') || (source === 'manual' && !['technician', 'manager'].includes(user.role))) {
    throw new ApiError(403, 'لا يمكنك إنشاء هذا النوع من البلاغات.')
  }
  const createdFor = source === 'portal' ? (body.createdFor ?? 'self') : null
  if (source === 'portal' && !['self', 'other'].includes(createdFor)) invalid()
  if (source === 'manual' && body.createdFor !== undefined) invalid()
  const requesterType = body.requesterType ?? 'employee'
  if (!['employee', 'top_management'].includes(requesterType) || (source === 'portal' && requesterType !== 'employee')) invalid()
  const managementPosition = optionalText(body.managementPosition, 160)
  const employeeNumber = optionalText(body.employeeNumber, 80)
  if (requesterType === 'top_management' ? (!managementPosition || employeeNumber) : managementPosition) invalid()
  const reporterEmployeeId = body.reporterEmployeeId === undefined ? null : uuid(body.reporterEmployeeId)
  if (reporterEmployeeId && requesterType !== 'employee') invalid()
  if (requesterType === 'top_management' && (body.departmentId !== undefined || body.department !== undefined)) invalid()
  const reporterName = reporterEmployeeId && body.reporterName === undefined ? '' : text(body.reporterName)
  if ((!reporterEmployeeId || body.reporterName !== undefined) && reporterName.length < 2) invalid()
  if (typeof body.description !== 'string') invalid()
  const description = body.description.trim().normalize('NFC')
  if (!description || description.length > 4000 || [...description].some((char) => {
    const code = char.charCodeAt(0)
    return (code < 32 && !['\r', '\n', '\t'].includes(char)) || code === 127
  })) invalid()
  let assignedTechnicianId = null
  if (body.assignedTechnicianId !== undefined && body.assignedTechnicianId !== null && body.assignedTechnicianId !== '') {
    if (user.role !== 'manager' || source !== 'manual') throw new ApiError(403, 'لا يمكنك إسناد البلاغ.')
    assignedTechnicianId = uuid(body.assignedTechnicianId)
  }
  const clientRequestId = body.clientRequestId ?? null
  if (clientRequestId !== null && (typeof clientRequestId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(clientRequestId))) invalid()
  return { reporterName, employeeNumber, department: requesterType === 'top_management' ? null : reference(body, 'department', !reporterEmployeeId),
    category: reference(body, 'category', true), subcategory: reference(body, 'subcategory', false),
    title: text(body.title, 200), description, source, createdFor, requesterType, managementPosition,
    assignedTechnicianId, clientRequestId, ...(reporterEmployeeId ? { reporterEmployeeId } : {}) }
}

export function ticketFilters(query, user) {
  const allowed = ['search', 'status', 'creationDate', 'sort', 'assignment', 'departmentId', 'categoryId', 'relatedAssetId', 'page', 'pageSize', 'scope']
  if (Object.keys(query).some((key) => !allowed.includes(key)) || Object.values(query).some((value) => typeof value !== 'string')) invalid()
  const status = query.status ?? 'all', sort = query.sort ?? 'newest', assignment = query.assignment ?? 'all'
  if (!['all', ...ticketStatuses].includes(status) || !['newest', 'oldest'].includes(sort) || !['all', 'assigned', 'unassigned'].includes(assignment)) invalid()
  if (query.assignment !== undefined && user.role !== 'manager') throw new ApiError(403, 'مرشح الإسناد للمدير فقط.')
  if (query.scope !== undefined && (user.role !== 'technician' || !['assigned', 'all'].includes(query.scope))) invalid()
  const search = query.search?.trim() ?? ''
  if (search.length > 200) invalid()
  let creationDate = null
  if (query.creationDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(query.creationDate)) invalid()
    const date = new Date(`${query.creationDate}T00:00:00.000Z`)
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== query.creationDate || date.getUTCFullYear() < 1000 || date.getUTCFullYear() > 9998) invalid()
    creationDate = date
  }
  const integer = (value, fallback, max) => {
    if (value === undefined) return fallback
    if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) > max) invalid()
    return Number(value)
  }
  return { search, status, sort, assignment, scope: query.scope ?? 'assigned', creationDate,
    relatedAssetId: query.relatedAssetId === undefined ? null : assetId(query.relatedAssetId),
    departmentId: query.departmentId === undefined ? null : uuid(query.departmentId),
    categoryId: query.categoryId === undefined ? null : uuid(query.categoryId),
    page: integer(query.page, 1, 1000000), pageSize: integer(query.pageSize, 50, 100) }
}
