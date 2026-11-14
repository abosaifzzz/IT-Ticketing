import { requireAssetAccess } from './permissions.js'
import { Router } from 'express'
import { ApiError, fields } from '../management/validation.js'
import { assetId, assetInput, assetFilters, version, withdrawalInput } from './validation.js'
import { inventoryWorkbook } from './export.js'

export function createAssetRouter({ authService, cookieName, repository }) {
  const router = Router()
  router.use(async (req, res, next) => {
    res.set('Cache-Control', 'no-store')
    req.user = await authService.getUser(req.cookies[cookieName])
    if (!req.user) throw new ApiError(401, 'يجب تسجيل الدخول.')
    requireAssetAccess(req.user)
    next()
  })
  router.get('/', async (req, res) => res.json(await repository.list(assetFilters(req.query), req.user)))
  router.get('/statistics', async (req, res) => {
    if (Object.keys(req.query).length) throw new ApiError(400, 'مرشحات غير صالحة.')
    res.json(await repository.statistics(req.user))
  })
  router.get('/export.xlsx', async (req, res) => {
    const result = await repository.list(assetFilters(req.query, true), req.user, true)
    const buffer = await inventoryWorkbook(result.items)
    res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.set('Content-Disposition', "attachment; filename=technical-assets.xlsx; filename*=UTF-8''%D8%A7%D9%84%D8%A3%D8%B5%D9%88%D9%84-%D8%A7%D9%84%D8%AA%D9%82%D9%86%D9%8A%D8%A9.xlsx")
    res.send(buffer)
  })
  router.get('/:assetId', async (req, res) => {
    const item = await repository.getById(assetId(req.params.assetId), req.user)
    if (!item) throw new ApiError(404, 'الأصل غير موجود.')
    res.json({ item })
  })
  router.post('/', async (req, res) => res.status(201).json({ item: await repository.create(assetInput(req.body), req.user) }))
  router.patch('/:assetId', async (req, res) => res.json({ item: await repository.update(assetId(req.params.assetId), assetInput(req.body, true), req.user) }))
  router.post('/:assetId/archive', async (req, res) => {
    fields(req.body, ['expectedVersion'])
    res.json({ item: await repository.archive(assetId(req.params.assetId), version(req.body.expectedVersion), req.user) })
  })
  router.post('/:assetId/withdraw', async (req, res) => {
    res.json(await repository.withdraw(assetId(req.params.assetId), withdrawalInput(req.body), req.user))
  })
  return router
}
