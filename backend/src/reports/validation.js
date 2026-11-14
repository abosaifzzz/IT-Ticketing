import { invalid } from '../management/validation.js'

export function reportFilters(query) {
  if (Object.keys(query).some((key) => !['dateFrom', 'dateTo', 'limit'].includes(key)) || Object.values(query).some((value) => typeof value !== 'string')) invalid()
  function date(value) {
    if (!value) return null
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) invalid()
    const result = new Date(`${value}T00:00:00.000Z`)
    if (!Number.isFinite(result.getTime()) || result.toISOString().slice(0, 10) !== value || result.getUTCFullYear() < 1000 || result.getUTCFullYear() > 9998) invalid()
    return result
  }
  const from = date(query.dateFrom), to = date(query.dateTo)
  if (from && to && from > to) invalid()
  const limit = query.limit === undefined ? 10 : Number(query.limit)
  if ((query.limit !== undefined && !/^[1-9]\d*$/.test(query.limit)) || !Number.isInteger(limit) || limit > 100) invalid()
  return { dateFrom: query.dateFrom || '', dateTo: query.dateTo || '', from, until: to ? new Date(to.getTime() + 86400000) : null, limit }
}
