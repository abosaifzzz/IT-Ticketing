import { Router } from 'express'
import { ApiError } from '../management/validation.js'
import { reportFilters } from './validation.js'
import { reportCsv } from './export.js'

export function createReportRouter({ authService, cookieName, repository }) {
  const router = Router()
  router.use(async (req, res, next) => {
    res.set('Cache-Control', 'no-store')
    req.user = await authService.getUser(req.cookies[cookieName])
    if (!req.user) throw new ApiError(401, 'يرجى تسجيل الدخول.')
    if (req.user.role !== 'manager') throw new ApiError(403, 'التقارير متاحة للمدير فقط.')
    next()
  })
  for (const path of ['/', '/summary', '/fault-types', '/employees', '/export.csv']) router.get(path, async (req, res) => {
    const report = await repository.dashboard(reportFilters(req.query), req.user)
    if (path === '/export.csv') return res.type('text/csv; charset=utf-8').attachment('ticket-reports.csv').send(reportCsv(report))
    const field = { '/summary': 'tickets', '/fault-types': 'mostReportedProblems', '/employees': 'topEmployees' }[path]
    return res.json(field ? { filters: report.filters, [field]: report[field] } : report)
  })
  return router
}
