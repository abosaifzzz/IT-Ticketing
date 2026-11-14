import assert from 'node:assert/strict'
import { before, after, test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { randomUUID, randomBytes } from 'node:crypto'
import { once } from 'node:events'
import { parse } from 'dotenv'
import { testEnvironment } from '../support/database.js'
import { createPool } from '../../src/db/pool.js'
import { createApp } from '../../src/app.js'
import { createMySqlUserRepository } from '../../src/repositories/mysqlUserRepository.js'
import { createMySqlSessionRepository } from '../../src/repositories/mysqlSessionRepository.js'
import { createMySqlReferenceRepository } from '../../src/repositories/mysqlReferenceRepository.js'
import { createMySqlItUserRepository } from '../../src/repositories/mysqlItUserRepository.js'
import { createMySqlTicketRepository } from '../../src/repositories/mysqlTicketRepository.js'
import { createMySqlTicketWorkflowRepository } from '../../src/repositories/mysqlTicketWorkflowRepository.js'
import { createMySqlAssetRepository } from '../../src/repositories/mysqlAssetRepository.js'
import { createMySqlNotificationRepository } from '../../src/repositories/mysqlNotificationRepository.js'
import { createMySqlDashboardRepository } from '../../src/repositories/mysqlDashboardRepository.js'
import { createMySqlReportRepository } from '../../src/repositories/mysqlReportRepository.js'
import { createLocalAccountService } from '../../src/auth/localAccountService.js'
import { createLocalPasswordProvider } from '../../src/auth/localPasswordProvider.js'
import { createAuthService } from '../../src/auth/authService.js'
import { createNotificationService } from '../../src/notifications/service.js'
import { openStream } from '../support/sse.js'

const suffix = randomUUID(), password = `Fictional-${randomBytes(16).toString('hex')}`, newPassword = `Replacement-${randomBytes(16).toString('hex')}`
const origin = 'http://localhost:5173', accounts = {}, cookies = {}, departments = [], categories = [], extraAccounts = []
let pool, runtime, server, url, app, provision, sessions, users, manualId
const config = (e) => ({ host: e.DB_HOST, port: Number(e.DB_PORT), database: e.DB_NAME, user: e.DB_USER, password: e.DB_PASSWORD })
before(async () => {
  const env = await testEnvironment()
  pool = createPool(config(env))
  if (process.env.HELPDESK_TEST_ENV === '.env.fresh.test') {
    const e = parse(await readFile(new URL('../../.env.fresh.runtime', import.meta.url)))
    assert.equal(e.DB_NAME, env.DB_NAME); assert.notEqual(e.DB_USER, env.DB_USER); assert.notEqual(e.DB_USER, 'root')
    runtime = createPool(config(e))
  } else runtime = pool
  users = createMySqlUserRepository(runtime); sessions = createMySqlSessionRepository(runtime); provision = createLocalAccountService(users)
  for (const [key, role] of [['employee', 'employee'], ['other', 'employee'], ['engineer', 'technician'], ['engineerB', 'technician'], ['manager', 'manager']]) accounts[key] = await provision.create({ email: `audit-${key}-${suffix}@demo.example`, fullName: `Fictional ${key}`, role, password })
  const managementRepositories = { departments: createMySqlReferenceRepository(runtime, 'departments'), categories: createMySqlReferenceRepository(runtime, 'categories'), subcategories: createMySqlReferenceRepository(runtime, 'subcategories'), itUsers: createMySqlItUserRepository(runtime) }
  const notifications = createNotificationService()
  app = createApp({ authService: createAuthService({ provider: await createLocalPasswordProvider(users), sessions }), config: { nodeEnv: 'test', appOrigin: origin }, managementRepositories,
    ticketRepository: createMySqlTicketRepository(runtime, { notifications }), ticketWorkflowRepository: createMySqlTicketWorkflowRepository(runtime, { notifications }),
    assetRepository: createMySqlAssetRepository(runtime), notificationRepository: createMySqlNotificationRepository(runtime), dashboardRepository: createMySqlDashboardRepository(runtime), reportRepository: createMySqlReportRepository(runtime) })
  server = app.listen(0, '127.0.0.1'); await once(server, 'listening'); url = `http://127.0.0.1:${server.address().port}`
  for (const key of Object.keys(accounts)) cookies[key] = await login(accounts[key].email)
  for (let i = 0; i < 2; i++) {
    departments.push(await managementRepositories.departments.save({ name: `Audit department ${i} ${suffix}`, isActive: true }))
    categories.push(await managementRepositories.categories.save({ name: `Audit category ${i} ${suffix}`, isActive: true }))
  }
})
after(async () => {
  app?.locals.closeNotificationStreams?.()
  if (server) await new Promise((resolve) => server.close(resolve))
  if (pool) {
    try {
      // Cleanup uses the separate test account. Runtime cannot delete immutable history.
      await pool.execute('UPDATE tickets SET related_asset_id = NULL WHERE related_asset_id IN (SELECT asset_id FROM assets WHERE name = ?)', [`Audit asset ${suffix}`])
      await pool.execute('DELETE FROM asset_withdrawals WHERE asset_id IN (SELECT asset_id FROM assets WHERE name = ?)', [`Audit asset ${suffix}`])
      for (const account of [...Object.values(accounts), ...extraAccounts]) await pool.execute('DELETE FROM tickets WHERE created_by_account_id = ?', [account.id])
      await pool.execute('DELETE FROM assets WHERE name = ?', [`Audit asset ${suffix}`])
      for (const [table, records] of [['departments', departments], ['fault_categories', categories], ['users', [...Object.values(accounts), ...extraAccounts]]]) for (const item of records) await pool.execute(`DELETE FROM ${table} WHERE id = ?`, [item.id])
    } finally { if (runtime && runtime !== pool) await runtime.end(); await pool.end() }
  }
})
async function login(identifier, secret = password) {
  const response = await fetch(`${url}/api/auth/login`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ username: identifier, password: secret }) })
  assert.equal(response.status, 200); return response.headers.get('set-cookie').split(';')[0]
}
async function request(path, { role = 'manager', method = 'GET', body, cookie = cookies[role], originHeader = origin } = {}) {
  return fetch(`${url}/api${path}`, { method, headers: { Cookie: cookie ?? '', ...(originHeader ? { Origin: originHeader } : {}), 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
}
async function json(path, options) { const response = await request(path, options); assert.equal(response.status, 200); return response.json() }
async function createTicket(role = 'employee', extra = {}) {
  const response = await request('/tickets', { role, method: 'POST', body: { reporterName: 'Fictional manual name', departmentId: departments[0].id, categoryId: categories[0].id, title: `Audit ${suffix}`, description: 'Fictional details', ...extra } })
  assert.equal(response.status, 201); return (await response.json()).item
}

test('dashboard status and recurring summaries enforce account and assignment scope with stable snapshot grouping', async () => {
  const all = []
  for (let i = 0; i < 4; i++) {
    const item = await createTicket(i === 3 ? 'other' : 'employee', i === 2 ? { departmentId: departments[1].id } : {})
    all.push(item)
    await json(`/tickets/${item.id}/assignment`, { method: 'POST', body: { technicianId: accounts[i === 3 ? 'engineerB' : 'engineer'].id, expectedVersion: 0 } })
  }
  await json(`/tickets/${all[0].id}/status`, { role: 'engineer', method: 'POST', body: { status: 'resolved', solutionDescription: 'Fictional solution' } })
  const manager = await json('/dashboard/recurring-problems')
  assert.equal(manager.items[0].count, 3); assert.equal(manager.items[0].openCount, 2)
  const engineer = await json('/dashboard/recurring-problems', { role: 'engineer' })
  assert.equal(engineer.items[0].count, 2); assert.equal(engineer.items[0].openCount, 1)
  assert.equal(engineer.items[0].ticketIds.includes(all[3].id), false)
  assert.equal((await json('/dashboard', { role: 'employee' })).tickets.total, 3)
  assert.equal((await json('/dashboard', { role: 'engineerB' })).tickets.total, 1)
  assert.equal((await request('/dashboard/recurring-problems', { role: 'employee' })).status, 403)
  for (const query of ['technicianId=other', 'minimumOccurrences=1', 'limit=101', 'limit=1&limit=2']) assert.equal((await request(`/dashboard/recurring-problems?${query}`)).status, 400)
  assert.equal((await request('/dashboard', { cookie: '' })).status, 401)
  await json(`/fault-categories/${categories[0].id}`, { method: 'PATCH', body: { name: `Renamed ${suffix}` } })
  assert.deepEqual((await json('/dashboard/recurring-problems')).items, manager.items)
})

test('administration searches literal text, returns ticket counts and separates password provisioning from forms', async () => {
  const matches = await json(`/it-users?search=${suffix}&role=technician`)
  assert.equal(matches.items.length, 2); assert.ok(matches.items.every((item) => typeof item.assignedTicketCount === 'number'))
  const engineer = matches.items.find((item) => item.id === accounts.engineer.id)
  assert.equal(engineer.assignedTicketCount, 3); assert.equal(engineer.activeTicketCount, 2)
  assert.equal((await json('/it-users?search=%25')).items.length, 0)
  assert.equal((await json(`/departments?search=${suffix}`)).items[0].ticketCount > 0, true)
  assert.equal((await json(`/fault-categories?search=Renamed`)).items.find((item) => item.id === categories[0].id).ticketCount, 4)
  const options = await json('/it-users', { role: 'employee' })
  assert.ok(options.items.every((item) => !Object.hasOwn(item, 'email') && !Object.hasOwn(item, 'assignedTicketCount')))
  const username = `fictional.${suffix}`
  const response = await request('/it-users', { method: 'POST', body: { username, fullName: 'Fictional new engineer', role: 'technician' } })
  assert.equal(response.status, 201)
  const account = (await response.json()).item; extraAccounts.push(account)
  assert.equal(account.username, username)
  const row = await users.findByEmail(username); assert.equal(row.password_hash, null)
  await provision.replacePassword(username, newPassword)
  const cookie = await login(username, newPassword)
  assert.equal((await request('/auth/me', { cookie })).status, 200)
  const stored = await users.findByEmail(username)
  assert.match(stored.password_hash, /^\$argon2id\$/); assert.equal(JSON.stringify(stored).includes(newPassword), false)
  await json(`/it-users/${account.id}`, { method: 'PATCH', body: { isActive: false } })
  await json(`/it-users/${account.id}`, { method: 'PATCH', body: { isActive: true } })
  assert.equal((await request('/auth/me', { cookie })).status, 401, 'Reactivation cannot resurrect sessions')
  for (const extra of [{ password: newPassword }, { phone: 'fictional' }, { extension: 'fictional' }]) assert.equal((await request(`/it-users/${account.id}`, { method: 'PATCH', body: extra })).status, 400)
})

test('password replacement revokes all sessions and rejects a login already authenticated with the old hash', async () => {
  const staleUser = await users.findByEmail(accounts.other.email)
  const cookieA = await login(accounts.other.email), cookieB = await login(accounts.other.email)
  await provision.replacePassword(accounts.other.email, newPassword)
  for (const cookie of [cookieA, cookieB]) assert.equal((await request('/auth/me', { cookie })).status, 401)
  assert.equal(await sessions.create({ tokenHash: randomBytes(32).toString('hex'), userId: accounts.other.id, expiresAt: new Date(Date.now() + 60000), authenticatedUser: staleUser }), false)
  const cookie = await login(accounts.other.email, newPassword)
  const stream = await openStream(`${url}/api/notifications/stream`, { Cookie: cookie })
  await stream.next('ready')
  assert.equal((await request('/auth/logout-all', { cookie, method: 'POST', body: {} })).status, 204)
  try { assert.equal((await stream.next('session-ended')).data.reauthenticate, true) }
  finally { await stream.close() }
  assert.equal((await request('/auth/me', { cookie })).status, 401)
  await pool.execute("UPDATE users SET auth_provider = 'external' WHERE id = ?", [accounts.other.id])
  try { await assert.rejects(provision.replacePassword(accounts.other.email, password), { status: 404 }) }
  finally { await pool.execute("UPDATE users SET auth_provider = 'local' WHERE id = ?", [accounts.other.id]) }
  await assert.rejects(provision.replacePassword(accounts.other.email, ''))
})

test('runtime permissions support inventory totals, linked-ticket ownership, withdrawal, notifications and reports', async () => {
  const response = await request('/assets', { role: 'engineer', method: 'POST', body: { assetId: `AUDIT-${suffix.slice(0, 20)}`, name: `Audit asset ${suffix}`, quantity: 1, manufacturer: 'Fictional', model: 'Fictional', holdingType: 'it_storage', location: 'Fictional IT storage', operationalStatus: 'working', conditionDescription: 'Fictional unit' } })
  assert.equal(response.status, 201); const asset = (await response.json()).item
  const stats = await json('/assets/statistics', { role: 'engineer' }); assert.equal(stats.total, 1); assert.equal(stats.working, 1)
  const ticket = await createTicket('manager', { assignedTechnicianId: accounts.engineer.id }); manualId = ticket.id
  const withdrawal = await json(`/assets/${asset.assetId}/withdraw`, { role: 'engineer', method: 'POST', body: { ticketId: ticket.id } })
  assert.equal(withdrawal.asset.quantity, 1)
  assert.equal((await json(`/tickets?relatedAssetId=${asset.assetId}`)).items[0].id, ticket.id)
  assert.equal((await json(`/tickets?relatedAssetId=${asset.assetId}`, { role: 'employee' })).total, 0)
  assert.equal((await json(`/tickets?relatedAssetId=${asset.assetId}`, { role: 'engineerB' })).total, 0)
  assert.equal((await json('/assets/statistics')).withdrawn, 1)
  assert.equal((await request('/assets/export.xlsx', { role: 'engineer' })).status, 200)
  assert.equal((await request('/assets/statistics', { role: 'employee' })).status, 403)
  assert.ok((await json('/notifications')).items.every((item) => item.recipientId === accounts.manager.id))
  assert.ok((await json('/reports')).tickets.total >= 5)
  if (runtime !== pool) {
    for (const sql of ['DELETE FROM ticket_history WHERE 1 = 0', 'UPDATE notification_events SET title = title WHERE 1 = 0', 'CREATE TABLE runtime_ddl_forbidden (id INT)']) await assert.rejects(runtime.query(sql), (error) => ['ER_TABLEACCESS_DENIED_ERROR', 'ER_DBACCESS_DENIED_ERROR'].includes(error.code))
  }
})

test('availability and role changes enforce ownership and revoke sessions without rewriting snapshots', async () => {
  await json('/it-users/me/availability', { role: 'engineer', method: 'PATCH', body: { isAvailable: false } })
  assert.equal((await json(`/it-users/${accounts.engineer.id}`, { role: 'engineer' })).item.isAvailable, false)
  assert.equal((await request('/it-users/me/availability', { role: 'manager', method: 'PATCH', body: { isAvailable: true } })).status, 403)
  const old = cookies.engineerB
  await json(`/it-users/${accounts.engineerB.id}`, { method: 'PATCH', body: { role: 'manager' } })
  assert.equal((await request('/auth/me', { cookie: old })).status, 401)
  const current = await json(`/tickets/${manualId}`)
  assert.equal(current.item.assignedTechnicianId, accounts.engineer.id)
})
