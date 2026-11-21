import {seedFixtureProfiles,clearFixtureProfiles} from '../support/profiles.js'
import { testEnvironment } from '../support/database.js'
import assert from 'node:assert/strict'
import { before, after, test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { randomUUID, randomBytes } from 'node:crypto'
import { once } from 'node:events'
import { parse } from 'dotenv'
import { createPool } from '../../src/db/pool.js'
import { createMySqlUserRepository } from '../../src/repositories/mysqlUserRepository.js'
import { createMySqlSessionRepository } from '../../src/repositories/mysqlSessionRepository.js'
import { createMySqlReferenceRepository } from '../../src/repositories/mysqlReferenceRepository.js'
import { createMySqlTicketRepository } from '../../src/repositories/mysqlTicketRepository.js'
import { createMySqlTicketWorkflowRepository } from '../../src/repositories/mysqlTicketWorkflowRepository.js'
import { createMySqlNotificationRepository } from '../../src/repositories/mysqlNotificationRepository.js'
import { createNotificationService } from '../../src/notifications/service.js'
import { notificationFilters } from '../../src/notifications/validation.js'
import { createLocalAccountService } from '../support/accounts.js'
import { createLocalPasswordProvider } from '../../src/auth/localPasswordProvider.js'
import { createAuthService } from '../../src/auth/authService.js'
import { ticketInput } from '../../src/tickets/validation.js'
import { createApp } from '../../src/app.js'
import { openStream } from '../support/sse.js'

const suffix = randomUUID(), password = `Fictional-${randomBytes(16).toString('hex')}`
const accounts = {}, cookies = {}, origin = 'http://localhost:5173'
let pool, app, server, url, department, category, tickets, workflow, notifications, service
before(async () => {
  const e = await testEnvironment()
  const dev = parse(await readFile(new URL('../../.env', import.meta.url)))
  assert.match(e.DB_NAME, /^hospital_it_helpdesk_test(?:_fresh_[a-f0-9]{12})?$/); assert.notEqual(e.DB_NAME, dev.DB_NAME); assert.notEqual(e.DB_USER, 'root')
  pool = createPool({ host: e.DB_HOST, port: Number(e.DB_PORT), database: e.DB_NAME, user: e.DB_USER, password: e.DB_PASSWORD })
  try { for (const table of ['notification_events', 'notification_accounts', 'notifications']) await pool.query(`SELECT * FROM ${table} LIMIT 0`) }
  catch (error) { throw new Error(`Notification integration tests require migration 006 and its grants, staged for your migration batch. Database code: ${error.code}`) }
  const users = createMySqlUserRepository(pool), provision = createLocalAccountService(users)
  for (const [key, role] of [['employee', 'employee'], ['other', 'employee'], ['engineer', 'technician'], ['manager', 'manager'], ['inactive', 'manager']]) accounts[key] = await provision.create({ email: `notification-${key}-${suffix}@demo.example`, fullName: `Fictional ${key}`, role, password })
  await pool.execute('UPDATE users SET is_active = FALSE WHERE id = ?', [accounts.inactive.id])
  await pool.execute('UPDATE users SET is_available = FALSE WHERE id = ?', [accounts.engineer.id])
  department = await createMySqlReferenceRepository(pool, 'departments').save({ name: `Notification department ${suffix}`, isActive: true })
  category = await createMySqlReferenceRepository(pool, 'categories').save({ name: `Notification category ${suffix}`, isActive: true })
  await seedFixtureProfiles(pool,accounts,[department])
  service = createNotificationService(); notifications = createMySqlNotificationRepository(pool)
  tickets = createMySqlTicketRepository(pool, { notifications: service }); workflow = createMySqlTicketWorkflowRepository(pool, { notifications: service })
  const authService = createAuthService({ provider: await createLocalPasswordProvider(users), sessions: createMySqlSessionRepository(pool) })
  app = createApp({ authService, notificationRepository: notifications, notificationStreamOptions: { intervalMs: 20, heartbeatMs: 50 }, config: { appOrigin: origin, nodeEnv: 'test' } })
  server = app.listen(0, '127.0.0.1'); await once(server, 'listening'); url = `http://127.0.0.1:${server.address().port}`
  for (const key of ['employee', 'other', 'engineer', 'manager']) {
    const response = await fetch(`${url}/api/auth/login`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: accounts[key].email, password }) })
    assert.equal(response.status, 200); cookies[key] = response.headers.get('set-cookie').split(';')[0]
  }
})
after(async () => {
  app?.locals.closeNotificationStreams()
  if (server) await new Promise((resolve) => server.close(resolve))
  if (pool) {
      await clearFixtureProfiles(pool,accounts)
    try {
      for (const account of Object.values(accounts)) await pool.execute('DELETE FROM tickets WHERE created_by_account_id = ?', [account.id])
      if (category) await pool.execute('DELETE FROM fault_categories WHERE id = ?', [category.id])
      if (department) await pool.execute('DELETE FROM departments WHERE id = ?', [department.id])
      for (const account of Object.values(accounts)) await pool.execute('DELETE FROM users WHERE id = ?', [account.id])
    } finally { await pool.end() }
  }
})
function input(extra = {}, user = accounts.employee) { return ticketInput({ reporterName: 'Fictional reporter', departmentId: department.id, categoryId: category.id, title: 'Fictional notification ticket', description: 'No real data', ...extra }, user) }
async function create(extra = {}) { return (await tickets.create(input(extra), accounts.employee)).item }
async function recipients(id, type) {
  const [rows] = await pool.execute('SELECT n.recipient_id FROM notifications n JOIN notification_events e ON e.id = n.event_id WHERE e.ticket_id = ? AND e.type = ?', [id, type])
  return rows.map((row) => row.recipient_id).filter((id) => Object.values(accounts).some((user) => user.id === id)).sort()
}
async function request(path, role = 'manager', method = 'GET', body) {
  return fetch(`${url}/api/notifications${path}`, { method, headers: { Cookie: cookies[role] ?? '', Origin: origin, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
}

test('server resolves active recipients for creation, assignment, resolution and reopening', async () => {
  const ticket = await create()
  assert.deepEqual(await recipients(ticket.id, 'new_ticket'), [accounts.engineer.id, accounts.manager.id].sort())
  await workflow.execute(ticket.id, 'assign', { technicianId: accounts.engineer.id, expectedVersion: 0 }, accounts.manager)
  assert.deepEqual(await recipients(ticket.id, 'ticket_assignment'), [accounts.engineer.id])
  await workflow.execute(ticket.id, 'note', { text: 'PRIVATE INTERNAL', visibility: 'internal' }, accounts.engineer)
  await workflow.execute(ticket.id, 'status', { status: 'resolved', text: 'PRIVATE SOLUTION' }, accounts.engineer)
  assert.deepEqual(await recipients(ticket.id, 'ticket_resolved'), [accounts.employee.id, accounts.manager.id].sort())
  await workflow.execute(ticket.id, 'reopen', { text: 'Fictional reopen' }, accounts.employee)
  assert.deepEqual(await recipients(ticket.id, 'ticket_reopened'), [accounts.engineer.id, accounts.manager.id].sort())
  const history = await notifications.history(accounts.employee.id, notificationFilters({}))
  assert.equal(JSON.stringify(history).includes('PRIVATE'), false)
  const manual = (await tickets.create(ticketInput({ reporterName: 'Fictional senior manager', categoryId: category.id, title: 'Fictional management ticket', description: 'No real data', requesterType: 'top_management', managementPosition: 'Fictional office', assignedTechnicianId: accounts.engineer.id }, accounts.manager), accounts.manager)).item
  await workflow.execute(manual.id, 'status', { status: 'resolved', text: 'Fictional solution' }, accounts.engineer)
  assert.deepEqual(await recipients(manual.id, 'ticket_resolved'), [accounts.manager.id])
})

test('retry deduplication and notification failures preserve transactional ticket writes', async () => {
  const body = input({ clientRequestId: `retry-${suffix}` })
  const results = await Promise.all([tickets.create(body, accounts.employee), tickets.create(body, accounts.employee)])
  assert.equal(results.filter((result) => result.created).length, 1)
  const id = results[0].item.id
  const [[event]] = await pool.execute('SELECT * FROM notification_events WHERE ticket_id = ?', [id])
  const before = await notifications.state(accounts.manager.id)
  const connection = await pool.getConnection()
  try { await connection.beginTransaction(); await service.record(connection, { eventId: event.id, type: event.type, ticket: results[0].item, now: new Date() }); await connection.commit() }
  finally { connection.release() }
  assert.deepEqual(await notifications.state(accounts.manager.id), before)
  const failing = createMySqlTicketRepository(pool, { notifications: { async record(connection, event) { await service.record(connection, event); throw new Error('Fictional injected failure') } } })
  await assert.rejects(failing.create(input({ clientRequestId: `rollback-${suffix}` }), accounts.employee), /Fictional injected failure/)
  const [[count]] = await pool.execute('SELECT COUNT(*) n FROM tickets WHERE created_by_account_id = ? AND client_request_id = ?', [accounts.employee.id, `rollback-${suffix}`])
  assert.equal(count.n, 0); assert.deepEqual(await notifications.state(accounts.manager.id), before)
})

test('persisted history, pagination and read APIs are scoped to the authenticated account', async () => {
  await create(); await create()
  const first = await notifications.history(accounts.manager.id, notificationFilters({ limit: '1' }))
  const next = await notifications.history(accounts.manager.id, notificationFilters({ before: first.nextBefore, limit: '1' }))
  assert.notEqual(first.items[0].id, next.items[0].id)
  assert.equal((await request(`/${first.items[0].id}/read`, 'employee', 'PATCH', {})).status, 404)
  assert.equal((await request('?recipientId=other')).status, 400)
  assert.equal((await request('', 'anonymous')).status, 401)
  const response = await request(`/${first.items[0].id}/read`, 'manager', 'PATCH', {})
  assert.equal(response.status, 200)
  const read = await response.json(), repeat = await notifications.markRead(accounts.manager.id, first.items[0].id)
  assert.equal(read.revision, repeat.revision); assert.equal(repeat.changed, false)
  const employeeBefore = await notifications.state(accounts.employee.id)
  assert.equal((await request('/read-all', 'manager', 'POST', {})).status, 200)
  assert.equal((await notifications.state(accounts.manager.id)).unreadCount, 0)
  assert.deepEqual(await notifications.state(accounts.employee.id), employeeBefore)
  const restored = createMySqlNotificationRepository(pool)
  const history = await restored.history(accounts.manager.id, notificationFilters({}))
  assert.ok(history.items.every((item) => item.recipientId === accounts.manager.id && item.readAt))
  assert.equal((await request('/read-all', 'employee', 'POST', { recipientId: accounts.manager.id })).status, 400)
})

test('reconnect refresh and polling recover durable changes after a disconnected stream', async () => {
  const headers = { Cookie: cookies.manager }
  let stream = await openStream(`${url}/api/notifications/stream`, headers)
  const ready = await stream.next('ready'); await stream.close()
  await create()
  stream = await openStream(`${url}/api/notifications/stream`, { ...headers, 'Last-Event-ID': ready.id })
  try {
    const reconnected = await stream.next('ready')
    assert.equal(reconnected.data.changed, true); assert.notEqual(reconnected.id, ready.id)
    await notifications.markRead(accounts.manager.id)
    const refresh = await stream.next('refresh'); assert.equal(refresh.data.unreadCount, 0)
    const fallback = await request(`/state?since=${ready.id}`).then((response) => response.json())
    assert.equal(fallback.changed, true); assert.equal(fallback.revision, refresh.id)
  } finally { await stream.close() }
})
