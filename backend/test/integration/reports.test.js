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
import { createMySqlReportRepository } from '../../src/repositories/mysqlReportRepository.js'
import { createLocalAccountService } from '../support/accounts.js'
import { createLocalPasswordProvider } from '../../src/auth/localPasswordProvider.js'
import { createAuthService } from '../../src/auth/authService.js'
import { ticketInput } from '../../src/tickets/validation.js'
import { reportFilters } from '../../src/reports/validation.js'
import { createApp } from '../../src/app.js'

const suffix = randomUUID(), password = `Fictional-${randomBytes(16).toString('hex')}`
const accounts = {}, cookies = {}, refs = {}, tickets = []
const origin = 'http://localhost:5173', range = '?dateFrom=2091-02-01&dateTo=2091-02-02'
let pool, server, url, reports, repository

before(async () => {
  const e = await testEnvironment()
  const dev = parse(await readFile(new URL('../../.env', import.meta.url)))
  assert.match(e.DB_NAME, /^hospital_it_helpdesk_test(?:_fresh_[a-f0-9]{12})?$/); assert.notEqual(e.DB_NAME, dev.DB_NAME); assert.notEqual(e.DB_USER, 'root')
  pool = createPool({ host: e.DB_HOST, port: Number(e.DB_PORT), database: e.DB_NAME, user: e.DB_USER, password: e.DB_PASSWORD })
  const users = createMySqlUserRepository(pool), provision = createLocalAccountService(users)
  for (const [key, role] of [['a', 'employee'], ['b', 'employee'], ['engineer', 'technician'], ['manager', 'manager']]) accounts[key] = await provision.create({ email: `report-${key}-${suffix}@demo.example`, fullName: `Fictional ${key}`, role, password })
  for (const kind of ['departments', 'categories', 'subcategories']) {
    refs[kind] = []
    for (let i = 0; i < 2; i++) refs[kind].push(await createMySqlReferenceRepository(pool, kind).save({ name: `${kind}-${i}-${suffix}`, isActive: true, ...(kind === 'subcategories' ? { categoryId: refs.categories[i].id } : {}) }))
  }
  repository = createMySqlTicketRepository(pool); reports = createMySqlReportRepository(pool)
  const authService = createAuthService({ provider: await createLocalPasswordProvider(users), sessions: createMySqlSessionRepository(pool) })
  server = createApp({ authService, reportRepository: reports, config: { appOrigin: origin, nodeEnv: 'test' } }).listen(0, '127.0.0.1')
  await once(server, 'listening'); url = `http://127.0.0.1:${server.address().port}/api/reports`
  for (const key of Object.keys(accounts)) {
    const response = await fetch(url.replace('/api/reports', '/api/auth/login'), { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: accounts[key].email, password }) })
    assert.equal(response.status, 200); cookies[key] = response.headers.get('set-cookie').split(';')[0]
  }
  // All seven states, plus a second ticket for the numbered employee.
  for (const [i, status] of ['new', 'assigned', 'in_progress', 'pending', 'resolved', 'closed', 'reopened', 'new'].entries()) {
    const user = accounts[i === 7 ? 'manager' : i % 2 ? 'b' : 'a']
    const body = { reporterName: i < 3 ? `Numbered ${i}` : i === 3 || i === 4 ? 'Shared Name' : i === 5 ? '=FORMULA' : 'Other Name', employeeNumber: i < 3 ? 'F-001' : '',
      ...(i === 7 ? {} : { departmentId: refs.departments[i === 4 ? 1 : 0].id }), categoryId: refs.categories[i === 6 ? 1 : 0].id,
      subcategoryId: refs.subcategories[i === 6 ? 1 : 0].id, title: 'Fictional report fixture', description: 'No real data',
      ...(i === 7 ? { requesterType: 'top_management', managementPosition: 'Fictional office' } : {}) }
    // Historical report fixtures deliberately preserve pre-profile reporter snapshots.
    const historical={...ticketInput(body,user),accountReporter:false,reporterName:body.reporterName,employeeNumber:body.employeeNumber};
    const { item } = await repository.create(historical, user); tickets.push(item)
    await pool.execute('UPDATE tickets SET status = ?, created_at = ? WHERE id = ?', [status, new Date(i === 0 ? '2091-02-01T00:00:00.000Z' : i === 7 ? '2091-02-02T23:59:59.999Z' : `2091-02-02T0${i}:00:00.000Z`), item.id])
  }
  // Historical reopen events must count a solved ticket once, not multiply totals.
  for (const sequence of [2, 3]) await pool.execute("INSERT INTO ticket_history (id, ticket_id, type, status, actor_account_id, actor_name, actor_role, occurred_at, sequence_number) VALUES (?, ?, 'reopened', 'reopened', ?, 'Fictional', 'employee', ?, ?)", [randomUUID(), tickets[4].id, accounts.a.id, new Date('2092-01-01T00:00:00Z'), sequence])
})

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve))
  if (pool) {
    try {
      for (const account of Object.values(accounts)) await pool.execute('DELETE FROM tickets WHERE created_by_account_id = ?', [account.id])
      for (const [table, records] of [['fault_subcategories', refs.subcategories], ['fault_categories', refs.categories], ['departments', refs.departments], ['users', Object.values(accounts)]]) for (const item of records ?? []) await pool.execute(`DELETE FROM ${table} WHERE id = ?`, [item.id])
    } finally { await pool.end() }
  }
})

async function request(path = '', role = 'manager') { return fetch(`${url}${path}`, { headers: cookies[role] ? { Cookie: cookies[role] } : {} }) }

test('manager aggregation includes every status and distinct historical/current reopenings', async () => {
  const response = await request(range); assert.equal(response.status, 200)
  const data = await response.json()
  assert.deepEqual(data.tickets, { total: 8, solved: 2, unsolved: 6, reopened: 2 })
  assert.deepEqual(data.mostReportedProblems.map((item) => item.ticketCount), [7, 1])
  assert.equal(data.topEmployees.reduce((sum, item) => sum + item.ticketCount, 0), 7)
  assert.equal(data.topEmployees[0].ticketCount, 3)
  assert.equal(data.topEmployees[0].employeeName, 'Numbered 2')
  assert.equal(data.topEmployees.filter((item) => item.employeeName === 'Shared Name').length, 2, 'Department distinguishes unnumbered names')
  assert.equal(JSON.stringify(data).includes(accounts.a.id), false)
  assert.equal(await repository.getById(tickets[1].id, accounts.a), null, 'Reporting grouping must not change ownership')
})

test('creation-day boundaries, open bounds, limits and empty results use the same filters', async () => {
  assert.equal((await request('/summary?dateFrom=2091-02-01&dateTo=2091-02-01').then((r) => r.json())).tickets.total, 1)
  assert.equal((await request('/summary?dateFrom=2091-02-02&dateTo=2091-02-02').then((r) => r.json())).tickets.total, 7)
  const empty = await request('?dateFrom=2091-02-03&dateTo=2091-02-03').then((r) => r.json())
  assert.deepEqual(empty.tickets, { total: 0, solved: 0, unsolved: 0, reopened: 0 }); assert.deepEqual(empty.topEmployees, [])
  assert.equal((await request(`/fault-types${range}&limit=1`).then((r) => r.json())).mostReportedProblems.length, 1)
  assert.equal((await request(`/employees${range}&limit=1`).then((r) => r.json())).topEmployees.length, 1)
  const open = await reports.dashboard(reportFilters({ dateFrom: '2091-02-01' }), accounts.manager)
  assert.equal(open.tickets.total, 8)
  for (const query of ['dateFrom=2091-02-30', 'dateFrom=2091-02-02&dateTo=2091-02-01', 'accountId=other', 'limit=101', 'dateFrom=2091-02-01%27%20OR%201=1']) assert.equal((await request(`?${query}`)).status, 400)
})

test('historical fault and department snapshots survive reference edits', async () => {
  const before = await request(range).then((r) => r.json())
  await pool.execute('UPDATE fault_categories SET name = ? WHERE id = ?', [`Renamed-${suffix}`, refs.categories[0].id])
  await pool.execute('UPDATE departments SET name = ? WHERE id = ?', [`Renamed-${suffix}`, refs.departments[0].id])
  assert.deepEqual(await request(range).then((r) => r.json()), before)
})

test('CSV export is authenticated, filtered, Arabic and formula safe', async () => {
  const response = await request(`/export.csv${range}`)
  assert.equal(response.status, 200); assert.match(response.headers.get('content-type'), /text\/csv/)
  assert.match(response.headers.get('content-disposition'), /attachment; filename="?ticket-reports\.csv"?/)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  const csv = await response.text(); assert.ok(csv.includes('عدد البلاغات')); assert.ok(csv.includes('"\'=FORMULA"'))
  assert.ok(csv.includes('"إجمالي البلاغات","","","","","","8"'))
  const empty = await request('/export.csv?dateFrom=2091-02-03&dateTo=2091-02-03').then((r) => r.text())
  assert.equal(empty.includes('FORMULA'), false)
})

test('all report routes require an active manager, with repository authorization too', async () => {
  for (const path of ['', '/summary', '/fault-types', '/employees', '/export.csv']) {
    assert.equal((await request(path, 'anonymous')).status, 401)
    for (const role of ['a', 'b', 'engineer']) assert.equal((await request(path, role)).status, 403)
  }
  await assert.rejects(reports.dashboard(reportFilters({}), accounts.a), { status: 403 })
  await pool.execute('UPDATE users SET is_active = FALSE WHERE id = ?', [accounts.manager.id])
  try {
    assert.equal((await request(range)).status, 401)
    await assert.rejects(reports.dashboard(reportFilters({}), accounts.manager), { status: 403 })
  } finally { await pool.execute('UPDATE users SET is_active = TRUE WHERE id = ?', [accounts.manager.id]) }
})

test('employee grouping crosses owners, includes manual employee requests and distinguishes employee-number case', async () => {
  for (const [index, key] of ['a', 'b', 'manager', 'a', 'b'].entries()) {
    const user = accounts[key]
    const body = { reporterName: index < 3 ? ' Same Reporter ' : 'Numbered', employeeNumber: index === 3 ? 'CASE' : index === 4 ? 'case' : '', departmentId: refs.departments[0].id, categoryId: refs.categories[0].id, title: 'Fictional grouping', description: 'Fictional data' }
    const historical={...ticketInput({...body,...(user.role==='manager'?{reporterUserId:accounts.a.id}:{})},user),accountReporter:false,reporterName:body.reporterName.trim(),employeeNumber:body.employeeNumber};
    const { item } = await repository.create(historical,user)
    tickets.push(item)
    await pool.execute('UPDATE tickets SET created_at = ? WHERE id = ?', [new Date(`2093-01-01T0${index}:00:00Z`), item.id])
    if (index === 1) await pool.execute('UPDATE tickets SET reporter_name = ?, department_label = ?, category_label = ? WHERE id = ?', [' same reporter ', ` ${item.department.toUpperCase()} `, ` ${item.category.toUpperCase()} `, item.id])
  }
  const data = await reports.dashboard(reportFilters({ dateFrom: '2093-01-01', dateTo: '2093-01-01' }), accounts.manager)
  assert.equal(data.tickets.total, 5)
  assert.equal(data.topEmployees.length, 3)
  assert.equal(data.topEmployees[0].ticketCount, 3)
  assert.equal(data.mostReportedProblems.length, 1)
  assert.equal(data.mostReportedProblems[0].ticketCount, 5)
  assert.deepEqual(data.topEmployees.slice(1).map((item) => item.employeeNumber).sort(), ['CASE', 'case'])
  assert.equal(await repository.getById(tickets.at(-4).id, accounts.a), null)
})
