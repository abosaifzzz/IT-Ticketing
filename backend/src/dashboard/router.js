import { Router } from 'express'
import { ApiError, invalid } from '../management/validation.js'

export function createDashboardRouter({ authService, cookieName, repository }) {
  const router = Router()
  router.use(async (req, res, next) => {
    res.set('Cache-Control', 'no-store')
    req.user = await authService.getUser(req.cookies[cookieName])
    if (!req.user) throw new ApiError(401, 'يرجى تسجيل الدخول.')
    if(!['employee','technician','manager'].includes(req.user.role))throw new ApiError(403,'Operational dashboard access denied')
    next()
  })
  router.get('/', async (req, res) => {
    if (Object.keys(req.query).length) invalid()
    res.json(await repository.summary(req.user))
  })
  router.get('/recurring-problems', async (req, res) => {
    if (Object.keys(req.query).some((key) => !['limit', 'minimumOccurrences'].includes(key)) || Object.values(req.query).some((value) => typeof value !== 'string')) invalid()
    const integer = (key, fallback, min, max) => {
      if (req.query[key] === undefined) return fallback
      if (!/^[1-9]\d*$/.test(req.query[key])) invalid()
      const value = Number(req.query[key])
      if (!Number.isSafeInteger(value) || value < min || value > max) invalid()
      return value
    }
    res.json({ items: await repository.recurring(req.user, { limit: integer('limit', 6, 1, 100), minimumOccurrences: integer('minimumOccurrences', 2, 2, 1000000) }) })
  })
  return router
}
