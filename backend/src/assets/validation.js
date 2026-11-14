import { ApiError, fields, invalid, text, uuid } from '../management/validation.js'
import { workflowText } from '../tickets/workflow.js'

export const operationalStatusLabels = Object.freeze({ working: 'يعمل', needs_maintenance: 'يحتاج إلى صيانة',
  out_of_service: 'خارج الخدمة', under_repair: 'قيد الإصلاح', retired: 'مستبعد', withdrawn: 'تم السحب' })
export const operationalStatuses = Object.freeze(Object.keys(operationalStatusLabels))

export function assetId(value) {
  if (typeof value !== 'string' || !/^[A-Z0-9][A-Z0-9._-]{2,39}$/i.test(value.trim())) invalid()
  return value.trim().toUpperCase()
}

export function version(value, required = true) {
  if (value === undefined && !required) return undefined
  if (!Number.isInteger(value) || value < 0 || value > 4294967294) invalid()
  return value
}

function date(value) {
  if (value === null || value === '') return null
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) invalid()
  const parsed = new Date(`${value}T00:00:00.000Z`)
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value || parsed.getUTCFullYear() < 1000) invalid()
  return value
}

export function assetInput(body, patch = false) {
  fields(body, ['name', 'quantity', 'manufacturer', 'model', 'serialNumber', 'holdingType', 'departmentId', 'department',
    'location', 'purchaseDate', 'operationalStatus', 'conditionDescription', 'maintenanceNotes', 'lastMaintenanceDate',
    ...(patch ? ['expectedVersion'] : ['assetId'])])
  const output = {}
  if (!patch) output.assetId = assetId(body.assetId)
  else output.expectedVersion = version(body.expectedVersion)
  for (const [key, max] of [['name', 160], ['manufacturer', 160], ['model', 160], ['location', 200]]) {
    if (!patch || Object.hasOwn(body, key)) output[key] = text(body[key], max)
  }
  if (!patch || Object.hasOwn(body, 'quantity')) {
    if (!Number.isInteger(body.quantity) || body.quantity < 1 || body.quantity > 1000000) invalid()
    output.quantity = body.quantity
  }
  if (!patch || Object.hasOwn(body, 'operationalStatus')) {
    if (!operationalStatuses.includes(body.operationalStatus) || (!patch && body.operationalStatus === 'withdrawn')) invalid()
    output.operationalStatus = body.operationalStatus
  }
  if (!patch || Object.hasOwn(body, 'holdingType')) {
    output.holdingType = body.holdingType === undefined ? 'department' : body.holdingType
    if (!['department', 'it_storage'].includes(output.holdingType)) invalid()
  }
  if (Object.hasOwn(body, 'departmentId') && Object.hasOwn(body, 'department')) invalid()
  if (Object.hasOwn(body, 'departmentId')) output.department = body.departmentId === null ? null : { id: uuid(body.departmentId) }
  if (Object.hasOwn(body, 'department')) output.department = { name: text(body.department) }
  if (!patch && output.holdingType === 'department' && !output.department) invalid()
  if (output.holdingType === 'it_storage' && output.department) invalid()
  if (!patch || Object.hasOwn(body, 'serialNumber')) output.serialNumber = body.serialNumber === undefined || body.serialNumber === '' ? '' : text(body.serialNumber)
  if (!patch || Object.hasOwn(body, 'conditionDescription')) output.conditionDescription = workflowText(body.conditionDescription)
  if (!patch || Object.hasOwn(body, 'maintenanceNotes')) output.maintenanceNotes = workflowText(body.maintenanceNotes ?? '', 4000, true)
  for (const key of ['purchaseDate', 'lastMaintenanceDate']) {
    if (!patch || Object.hasOwn(body, key)) output[key] = date(body[key] ?? null)
  }
  if (patch && Object.keys(output).length === 1) invalid()
  return output
}

export function assetFilters(query, exporting = false) {
  const allowed = ['search', 'departmentId', 'department', 'operationalStatus', 'holdingType', 'includeArchived', ...(exporting ? [] : ['page', 'pageSize'])]
  if (Object.keys(query).some((key) => !allowed.includes(key)) || Object.values(query).some((value) => typeof value !== 'string')) invalid()
  const search = query.search?.trim() ?? ''
  if (search.length > 200 || (query.departmentId && query.department)) invalid()
  const operationalStatus = query.operationalStatus ?? 'all', holdingType = query.holdingType ?? 'all'
  if (!['all', ...operationalStatuses].includes(operationalStatus) || !['all', 'department', 'it_storage'].includes(holdingType)) invalid()
  if (query.includeArchived !== undefined && !['true', 'false'].includes(query.includeArchived)) invalid()
  if (exporting && query.includeArchived === 'true') throw new ApiError(400, 'التصدير للمخزون غير المؤرشف فقط.')
  const integer = (value, fallback, max) => {
    if (value === undefined) return fallback
    if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) > max) invalid()
    return Number(value)
  }
  return { search, operationalStatus, holdingType, departmentId: query.departmentId === undefined ? null : uuid(query.departmentId),
    department: query.department && query.department !== 'all' ? text(query.department) : null,
    includeArchived: query.includeArchived === 'true', page: integer(query.page, 1, 1000000), pageSize: integer(query.pageSize, 50, 100) }
}

export function withdrawalInput(body) {
  fields(body, ['ticketId', 'expectedVersion'])
  return { ticketId: uuid(body.ticketId), expectedVersion: version(body.expectedVersion, false) }
}
