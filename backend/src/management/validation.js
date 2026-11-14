export class ApiError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

export function invalid() { throw new ApiError(400, 'البيانات المدخلة غير صالحة.') }

export function uuid(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value)) invalid()
  return value
}

export function fields(body, allowed) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || !Object.keys(body).length ||
    Object.keys(body).some((key) => !allowed.includes(key))) invalid()
}

export function text(value, max = 160) {
  if (typeof value !== 'string') invalid()
  const result = value.trim().normalize('NFC')
  if (!result || result.length > max || [...result].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) invalid()
  return result
}

export function boolean(value) {
  if (typeof value !== 'boolean') invalid()
  return value
}

export function referenceInput(body, { subcategory = false, patch = false } = {}) {
  fields(body, subcategory ? ['name', 'isActive', 'categoryId'] : ['name', 'isActive'])
  const result = {}
  if (!patch || Object.hasOwn(body, 'name')) result.name = text(body.name)
  if (Object.hasOwn(body, 'isActive')) result.isActive = boolean(body.isActive)
  else if (!patch) result.isActive = true
  if (subcategory && (!patch || Object.hasOwn(body, 'categoryId'))) result.categoryId = uuid(body.categoryId)
  return result
}

export function itUserInput(body, patch = false) {
  fields(body, ['email', 'username', 'fullName', 'role', 'isActive'])
  if (Object.hasOwn(body, 'email') && Object.hasOwn(body, 'username')) invalid()
  const result = {}
  if (!patch || Object.hasOwn(body, 'email') || Object.hasOwn(body, 'username')) {
    result.email = text(body.username ?? body.email, body.username === undefined ? 254 : 80).toLowerCase()
    if (body.username === undefined ? !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email) : !/^[a-z0-9][a-z0-9._@+-]{2,79}$/.test(result.email)) invalid()
  }
  if (!patch || Object.hasOwn(body, 'fullName')) {
    result.fullName = text(body.fullName)
    if (result.fullName.length < 2) invalid()
  }
  if (!patch || Object.hasOwn(body, 'role')) {
    if (!['technician', 'manager'].includes(body.role)) invalid()
    result.role = body.role
  }
  if (Object.hasOwn(body, 'isActive')) result.isActive = boolean(body.isActive)
  else if (!patch) result.isActive = true
  return result
}

export function employeeDirectoryInput(body) {
  fields(body, ['fullName', 'departmentId'])
  const fullName = text(body.fullName, 160)
  if (fullName.length < 2) invalid()
  return { fullName, departmentId: uuid(body.departmentId) }
}

export function managementFilters(query, { subcategory = false, users = false } = {}) {
  const allowed = ['search', 'activeOnly', ...(subcategory ? ['categoryId'] : []), ...(users ? ['role'] : [])]
  if (Object.keys(query).some((key) => !allowed.includes(key)) || Object.values(query).some((value) => typeof value !== 'string')) invalid()
  const search = query.search?.trim() ?? ''
  if (search.length > 200 || (query.activeOnly !== undefined && !['true', 'false'].includes(query.activeOnly)) || (query.role !== undefined && !['technician', 'manager'].includes(query.role))) invalid()
  return { search, activeOnly: query.activeOnly === 'true', ...(subcategory && query.categoryId !== undefined ? { categoryId: uuid(query.categoryId) } : {}), ...(query.role ? { role: query.role } : {}) }
}
