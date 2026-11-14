import { invalid } from '../management/validation.js'

export function revision(value) {
  if (typeof value !== 'string' || !/^(0|[1-9]\d{0,19})$/.test(value) || BigInt(value) > 18446744073709551615n) invalid()
  return value
}

export function notificationFilters(query) {
  if (Object.keys(query).some((key) => !['before', 'limit', 'unreadOnly'].includes(key)) || Object.values(query).some((value) => typeof value !== 'string')) invalid()
  if (query.unreadOnly !== undefined && !['true', 'false'].includes(query.unreadOnly)) invalid()
  if (query.limit !== undefined && (!/^[1-9]\d*$/.test(query.limit) || Number(query.limit) > 100)) invalid()
  return { before: query.before === undefined ? null : revision(query.before), limit: query.limit === undefined ? 50 : Number(query.limit), unreadOnly: query.unreadOnly === 'true' }
}

export function emptyBody(body) {
  if (body === undefined) return
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length) invalid()
}
