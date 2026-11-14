import { Router } from 'express'
import { ApiError, boolean, employeeDirectoryInput, fields, itUserInput, referenceInput, uuid, managementFilters } from './validation.js'

export function createManagementRouter({ authService, cookieName, repositories }) {
  const router = Router()
  router.use(async (req, res, next) => {
    res.set('Cache-Control', 'no-store')
    req.user = await authService.getUser(req.cookies[cookieName])
    if (!req.user) throw new ApiError(401, 'يجب تسجيل الدخول.')
    if (!['employee', 'technician', 'manager'].includes(req.user.role)) throw new ApiError(403, 'الطلب غير مسموح.')
    next()
  })
  const manager = (req, _res, next) => {
    if (req.user.role !== 'manager') throw new ApiError(403, 'الطلب غير مسموح.')
    next()
  }
  const found = (record) => {
    if (!record) throw new ApiError(404, 'السجل غير موجود.')
    return record
  }
  if (repositories.employees) {
    router.get('/employee-options', async (req, res) => {
      if (Object.keys(req.query).some(key => !['search', 'page'].includes(key)) ||
        typeof (req.query.search ?? '') !== 'string' || (req.query.search ?? '').length > 200 ||
        (req.query.page !== undefined && (typeof req.query.page !== 'string' || !/^[1-9]\d{0,4}$/.test(req.query.page)))) {
        throw new ApiError(400, 'البحث غير صالح.')
      }
      res.json(await repositories.employees.list(req.query.search ?? '', Number(req.query.page ?? 1), { options: true }))
    })
    router.get('/employees', async (req, res) => {
      if (!['technician', 'manager'].includes(req.user.role)) throw new ApiError(403, 'ليس لديك صلاحية لعرض دليل الموظفين.')
      const keys = Object.keys(req.query)
      if (keys.some((key) => !['search', 'page'].includes(key)) || typeof (req.query.search ?? '') !== 'string' || (req.query.search ?? '').length > 200 ||
        (req.query.page !== undefined && (typeof req.query.page !== 'string' || !/^[1-9]\d{0,4}$/.test(req.query.page)))) {
        throw new ApiError(400, 'البحث غير صالح.')
      }
      res.json(await repositories.employees.list(req.query.search ?? '', Number(req.query.page ?? 1)))
    })
    router.post('/employees', async (req, res) => {
      if (!['technician', 'manager'].includes(req.user.role)) throw new ApiError(403, 'ليس لديك صلاحية لإضافة موظف.')
      res.status(201).json({ item: await repositories.employees.create(employeeDirectoryInput(req.body), req.user) })
    })
  }
  for (const [path, key] of [['departments', 'departments'], ['fault-categories', 'categories'], ['fault-subcategories', 'subcategories']]) {
    const repository = repositories[key]
    router.get(`/${path}`, async (req, res) => {
      const filters = managementFilters(req.query, { subcategory: key === 'subcategories' })
      res.json({ items: await repository.list({ ...filters, activeOnly: req.user.role !== 'manager' || filters.activeOnly, includeCounts: req.user.role === 'manager' }) })
    })
    router.get(`/${path}/:id`, async (req, res) => {
      res.json({ item: found(await repository.getById(uuid(req.params.id), req.user.role !== 'manager')) })
    })
    router.post(`/${path}`, manager, async (req, res) => {
      res.status(201).json({ item: await repository.save(referenceInput(req.body, { subcategory: key === 'subcategories' }), null, req.user) })
    })
    router.patch(`/${path}/:id`, manager, async (req, res) => {
      res.json({ item: await repository.save(referenceInput(req.body, { subcategory: key === 'subcategories', patch: true }), uuid(req.params.id), req.user) })
    })
  }
  router.get('/it-users', async (req, res) => {
    res.json({ items: await repositories.itUsers.list(req.user.role !== 'manager', managementFilters(req.query, { users: true })) })
  })
  router.patch('/it-users/me/availability', async (req, res) => {
    if (req.user.role !== 'technician') throw new ApiError(403, 'الطلب غير مسموح.')
    fields(req.body, ['isAvailable'])
    res.json({ item: await repositories.itUsers.setOwnAvailability(req.user.id, boolean(req.body.isAvailable)) })
  })
  router.get('/it-users/:id', async (req, res) => {
    res.json({ item: found(await repositories.itUsers.getById(uuid(req.params.id), req.user.role !== 'manager')) })
  })
  router.post('/it-users', manager, async (req, res) => {
    res.status(201).json({ item: await repositories.itUsers.create(itUserInput(req.body), req.user) })
  })
  router.patch('/it-users/:id', manager, async (req, res) => {
    res.json({ item: await repositories.itUsers.update(uuid(req.params.id), itUserInput(req.body, true), req.user) })
  })
  return router
}
