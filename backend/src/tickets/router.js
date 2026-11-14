import { Router } from 'express'
import { ApiError, uuid } from '../management/validation.js'
import { ticketInput, ticketFilters } from './validation.js'
import { requireActionRole, workflowInput } from './workflow.js'

export function createTicketRouter({ authService, cookieName, repository, workflowRepository }) {
  const router = Router()
  router.use(async (req, res, next) => {
    res.set('Cache-Control', 'no-store')
    req.user = await authService.getUser(req.cookies[cookieName])
    if (!req.user) throw new ApiError(401, 'يجب تسجيل الدخول.')
    if (!['employee', 'technician', 'manager'].includes(req.user.role)) throw new ApiError(403, 'الطلب غير مسموح.')
    next()
  })
  router.post('/', async (req, res) => {
    const result = await repository.create(ticketInput(req.body, req.user), req.user)
    res.status(result.created ? 201 : 200).json({ item: result.item })
  })
  router.get('/', async (req, res) => {
    res.json(await repository.list(ticketFilters(req.query, req.user), req.user))
  })
  router.get('/unassigned', async (req, res) => {
    if (Object.keys(req.query).some((key) => !['page', 'pageSize'].includes(key))) throw new ApiError(400, 'مرشحات غير صالحة.')
    res.json(await repository.listUnassigned(ticketFilters(req.query, req.user), req.user))
  })
  if (workflowRepository) {
    for (const [path, action] of [['assignment', 'assign'], ['claim', 'claim'], ['status', 'status'], ['notes', 'note'],
      ['comments', 'comment'], ['confirm-resolution', 'confirm'], ['reopen', 'reopen']]) {
      router.post(`/:id/${path}`, async (req, res) => {
        requireActionRole(action, req.user.role)
        const input = workflowInput(action, req.body)
        res.json({ item: await workflowRepository.execute(uuid(req.params.id), action, input, req.user) })
      })
    }
  }
  router.get('/:id', async (req, res) => {
    const item = await repository.getById(uuid(req.params.id), req.user)
    if (!item) throw new ApiError(404, 'البلاغ غير موجود.')
    res.json({ item })
  })
  return router
}
