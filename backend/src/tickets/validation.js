import { ApiError, fields, invalid, text, uuid } from '../management/validation.js'
import { assetId } from '../assets/validation.js'
import {phoneInput} from '../auth/profiles.js'

// Stored reporter-name snapshot for internal IT tickets, which have no employee requester.
export const IT_TICKET_REPORTER_NAME = 'قسم تكنولوجيا المعلومات'
// Display labels stored for IT tickets, which have no fault category.
export const IT_TICKET_CATEGORY_LABEL = 'بلاغ تقنية المعلومات'
export const IT_TICKET_SUBCATEGORY_LABEL = 'مهمة داخلية'

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

// Optional AnyDesk ID: the numeric address (9–12 digits; spaces/dashes are ignored)
// or an AnyDesk alias such as "name@ad". Empty input means no ID.
export function anydeskIdInput(value) {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string') invalid()
  const trimmed = value.trim()
  if (!trimmed) return null
  const digits = trimmed.replace(/[\s-]/g, '')
  if (/^[0-9]{9,12}$/.test(digits)) return digits
  if (trimmed.length <= 64 && /^[A-Za-z0-9._-]{1,50}@[A-Za-z0-9._-]{1,13}$/.test(trimmed)) return trimmed.toLowerCase()
  throw new ApiError(400, 'معرّف AnyDesk غير صالح. أدخل الرقم المكوّن من ٩ إلى ١٢ رقمًا أو اتركه فارغًا.')
}

export function ticketInput(body, user) {
  fields(body, ['anydeskId', 'reporterPhone','reporterUserId','reporterEmployeeId', 'reporterName', 'employeeNumber', 'departmentId', 'department', 'categoryId', 'category',
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
  if (!['employee', 'top_management', 'it_internal'].includes(requesterType) || (source === 'portal' && requesterType !== 'employee')) invalid()
  // IT tickets: internal manager-to-engineer tasks with no employee requester or department
  // (e.g. "change the air-conditioner timer"). Only a manager may create them, and an engineer is required.
  const internal = requesterType === 'it_internal'
  if (internal) {
    if (user.role !== 'manager' || source !== 'manual') throw new ApiError(403, 'بلاغات تقنية المعلومات ينشئها مدير تقنية المعلومات فقط.')
    // A direct command, not a fault report: no requester, department, contact or fault category.
    for (const key of ['reporterName', 'reporterUserId', 'reporterEmployeeId', 'employeeNumber', 'managementPosition', 'departmentId', 'department', 'reporterPhone', 'categoryId', 'category', 'subcategoryId', 'subcategory']) if (body[key] !== undefined) invalid()
    if (body.assignedTechnicianId === undefined || body.assignedTechnicianId === null || body.assignedTechnicianId === '') throw new ApiError(400, 'اختر المهندس المسؤول عن بلاغ تقنية المعلومات.')
  }
  const managementPosition = optionalText(body.managementPosition, 160)
  const employeeNumber = optionalText(body.employeeNumber, 80)
  if (requesterType === 'top_management' ? (!managementPosition || employeeNumber) : managementPosition) invalid()
  const accountReporter=requesterType==='employee'
  if(source==='portal'&&body.reporterPhone!==undefined)invalid()
  const reporterPhone=body.reporterPhone===undefined?null:phoneInput(body.reporterPhone)
  if(!accountReporter&&body.reporterUserId!==undefined)invalid()
  if(body.assignedTechnicianId&&user.role!=='manager')throw new ApiError(403,'لا يمكنك إسناد البلاغ.')
  if(source==='portal'&&(body.reporterUserId!==undefined||createdFor!=='self'))invalid()
  const reporterUserId=source==='manual'&&accountReporter?uuid(body.reporterUserId):null
  const reporterEmployeeId = accountReporter?null:body.reporterEmployeeId === undefined ? null : uuid(body.reporterEmployeeId)
  if (reporterEmployeeId && requesterType !== 'employee') invalid()
  if (requesterType === 'top_management' && (body.departmentId !== undefined || body.department !== undefined)) invalid()
  const reporterName = internal ? IT_TICKET_REPORTER_NAME : accountReporter?'':reporterEmployeeId && body.reporterName === undefined ? '' : text(body.reporterName)
  if (!internal&&!accountReporter&&(!reporterEmployeeId || body.reporterName !== undefined) && reporterName.length < 2) invalid()
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
  return { reporterName, employeeNumber:accountReporter?'':employeeNumber, department: requesterType !== 'employee' ? null : reference(body, 'department', false),
    category: internal ? null : reference(body, 'category', true), subcategory: internal ? null : reference(body, 'subcategory', false),
    title: text(body.title, 200), description, source, createdFor, requesterType, managementPosition,
    assignedTechnicianId, clientRequestId,accountReporter,reporterUserId,anydeskId:anydeskIdInput(body.anydeskId),...(body.reporterPhone!==undefined?{reporterPhone}:{}), ...(reporterEmployeeId ? { reporterEmployeeId } : {}) }
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
