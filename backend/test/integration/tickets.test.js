import {createMySqlEmployeeDirectoryRepository} from '../../src/repositories/mysqlEmployeeDirectoryRepository.js'
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
import { createLocalAccountService } from '../../src/auth/localAccountService.js'
import { createLocalPasswordProvider } from '../../src/auth/localPasswordProvider.js'
import { createAuthService, hashSessionToken } from '../../src/auth/authService.js'
import { createApp } from '../../src/app.js'

const suffix = randomUUID(), password = `Fictional-${randomBytes(16).toString('hex')}`
const origin = 'http://localhost:5173'
const accounts = {}, cookies = {}, departments = [], categories = [], subcategories = []
let pool, server, url, first, other, assignedA, assignedB, manual

before(async () => {
  const e = await testEnvironment()
  const dev = parse(await readFile(new URL('../../.env', import.meta.url)))
  assert.match(e.DB_NAME, /^hospital_it_helpdesk_test(?:_fresh_[a-f0-9]{12})?$/)
  assert.notEqual(e.DB_NAME, dev.DB_NAME)
  assert.equal(e.DB_HOST, '127.0.0.1')
  assert.notEqual(e.DB_USER, 'root')
  pool = createPool({ host: e.DB_HOST, port: Number(e.DB_PORT), database: e.DB_NAME, user: e.DB_USER, password: e.DB_PASSWORD })
  await pool.query('SELECT id FROM tickets LIMIT 0')
  await pool.query('SELECT id FROM ticket_history LIMIT 0')
  const users = createMySqlUserRepository(pool), provision = createLocalAccountService(users)
  for (const [key, role] of [['employeeA', 'employee'], ['employeeB', 'employee'], ['engineerA', 'technician'], ['engineerB', 'technician'], ['manager', 'manager']]) {
    accounts[key] = await provision.create({ email: `ticket-${key}-${suffix}@demo.example`, fullName: `حساب خيالي ${key}`, role, password })
  }
  for (const kind of ['departments', 'categories', 'subcategories']) {
    const repo = createMySqlReferenceRepository(pool, kind)
    const target = { departments, categories, subcategories }[kind]
    for (let index = 0; index < 2; index++) {
      target.push(await repo.save({ name: `${kind} خيالي ${index} ${suffix}`, isActive: true,
        ...(kind === 'subcategories' ? { categoryId: categories[index].id } : {}) }))
    }
  }
  const authService = createAuthService({ provider: await createLocalPasswordProvider(users), sessions: createMySqlSessionRepository(pool) })
  server = createApp({ authService, ticketRepository: createMySqlTicketRepository(pool), config: { appOrigin: origin, nodeEnv: 'test' } }).listen(0, '127.0.0.1')
  await once(server, 'listening')
  url = `http://127.0.0.1:${server.address().port}`
  for (const key of Object.keys(accounts)) {
    const response = await fetch(`${url}/api/auth/login`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: accounts[key].email, password }) })
    assert.equal(response.status, 200)
    cookies[key] = response.headers.get('set-cookie').split(';')[0]
  }
})

after(async () => {
  try {
    if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  } finally {
    if (pool) {
      try {
        for (const account of Object.values(accounts)) await pool.execute('DELETE FROM tickets WHERE created_by_account_id = ?', [account.id])
        for (const account of Object.values(accounts)) await pool.execute('DELETE FROM employee_directory WHERE created_by_account_id=?',[account.id])
        for (const [table, records] of [['fault_subcategories', subcategories], ['fault_categories', categories], ['departments', departments], ['users', Object.values(accounts)]]) {
          for (const record of records) await pool.execute(`DELETE FROM ${table} WHERE id = ?`, [record.id])
        }
      } finally { await pool.end() }
    }
  }
})

function input(extra = {}) {
  return { reporterName: 'اسم موظف مدخل يدويًا', departmentId: departments[0].id, categoryId: categories[0].id,
    subcategoryId: subcategories[0].id, title: `Printer ${suffix}`, description: 'تفاصيل خيالية\nدون بيانات حساسة', ...extra }
}

async function request(path = '', { role = 'employeeA', method = 'GET', body, originHeader = origin } = {}) {
  const response = await fetch(`${url}/api/tickets${path}`, {
    method, headers: { ...(cookies[role] ? { Cookie: cookies[role] } : {}), ...(originHeader ? { Origin: originHeader } : {}), 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  return { status: response.status, data: await response.json() }
}

async function create(body = input(), role = 'employeeA') {
  const result = await request('', { role, method: 'POST', body })
  assert.equal(result.status, 201)
  return result.data.item
}

test('personal and on-behalf tickets use session ownership and explicit reporter data', async () => {
  first = await create()
  other = await create(input({ createdFor: 'other', employeeNumber: 'FICTIONAL-001', title: `Blue ${suffix}` }))
  const sameName = await create(input({ reporterName: first.reporterName }), 'employeeB')
  assert.equal(first.reporterAccountId, accounts.employeeA.id)
  assert.equal(first.createdFor, 'self')
  assert.equal(first.reporterName, 'اسم موظف مدخل يدويًا')
  assert.notEqual(first.reporterName, accounts.employeeA.fullName)
  assert.equal(first.department, departments[0].name)
  assert.equal(first.category, categories[0].name)
  assert.equal(first.subcategory, subcategories[0].name)
  assert.equal(other.createdFor, 'other')
  assert.equal(other.reporterAccountId, accounts.employeeA.id)
  assert.equal(other.employeeNumber, 'FICTIONAL-001')
  assert.equal(first.status, 'new')
  assert.equal(first.assignedTechnicianId, null)
  assert.equal(first.history.length, 1)
  assert.equal(first.history[0].actorAccountId, accounts.employeeA.id)
  assert.equal((await request(`/${first.id}`, { role: 'employeeB' })).status, 404)
  assert.equal((await request(`/${sameName.id}`)).status, 404)
  for (const field of ['reporterAccountId', 'createdByAccountId', 'createdByName', 'createdByRole']) {
    assert.equal((await request('', { method: 'POST', body: input({ [field]: accounts.employeeB.id }) })).status, 400)
  }
})

test('account-scoped searching, status/date/reference filters, sorting and pagination stay scoped', async () => {
  await pool.execute('UPDATE tickets SET created_at = ? WHERE id = ?', [new Date('2026-01-01T23:59:59.999Z'), first.id])
  await pool.execute('UPDATE tickets SET created_at = ? WHERE id = ?', [new Date('2026-01-02T00:00:00.000Z'), other.id])
  const all = await request(`?search=${suffix}&sort=oldest&pageSize=1`)
  assert.equal(all.status, 200)
  assert.equal(all.data.total, 2)
  assert.equal(all.data.items.length, 1)
  assert.equal(all.data.items[0].id, first.id)
  assert.equal((await request(`?search=${suffix}&sort=oldest&pageSize=1&page=2`)).data.items[0].id, other.id)
  assert.equal((await request(`?search=${suffix}&sort=newest`)).data.items[0].id, other.id)
  assert.equal((await request(`?search=${first.id}`)).data.total, 1)
  assert.equal((await request('?creationDate=2026-01-01')).data.items[0].id, first.id)
  assert.equal((await request('?creationDate=2026-01-02')).data.items[0].id, other.id)
  assert.equal((await request('?status=assigned')).data.total, 0)
  assert.equal((await request(`?categoryId=${categories[1].id}`)).data.total, 0)
  assert.equal((await request(`?departmentId=${departments[1].id}`)).data.total, 0)
  assert.equal((await request('?search=%25')).data.total, 0, 'Percent must be literal, not a SQL wildcard')
  assert.equal((await request(`?search=${suffix}`, { role: 'employeeB' })).data.total, 1)
})

test('manual employee and senior-management requests retain creator identity without employee ownership', async () => {
  manual = await create(input({ requesterType: 'employee', employeeNumber: 'FICTIONAL-002' }), 'engineerA')
  const seniorInput = input({ requesterType: 'top_management', managementPosition: 'مكتب خيالي' })
  delete seniorInput.departmentId
  const senior = await create(seniorInput, 'manager')
  for (const ticket of [manual, senior]) {
    assert.equal(ticket.source, 'manual')
    assert.equal(ticket.reporterAccountId, null)
    assert.equal(ticket.createdFor, null)
    assert.equal((await request(`/${ticket.id}`)).status, 404)
    assert.equal((await request(`/${ticket.id}`, { role: 'employeeB' })).status, 404)
    assert.equal((await request(`/${ticket.id}`, { role: 'manager' })).status, 200)
  }
  assert.equal(manual.createdByAccountId, accounts.engineerA.id)
  assert.equal(manual.createdByName, accounts.engineerA.fullName)
  assert.equal(manual.createdByRole, 'technician')
  assert.equal((await request(`/${manual.id}`, { role: 'engineerA' })).status, 200, 'The shared queue is readable without granting edit access')
  assert.equal(senior.requesterType, 'top_management')
  assert.equal(senior.departmentId, null)
  assert.equal(senior.department, null)
  assert.equal(senior.managementPosition, 'مكتب خيالي')
  assert.equal(senior.createdByAccountId, accounts.manager.id)
  assert.equal((await request('', { method: 'POST', body: input({ source: 'manual' }) })).status, 403)
  assert.equal((await request('', { role: 'manager', method: 'POST', body: input({ source: 'portal' }) })).status, 403)
  assert.equal((await request('', { role: 'manager', method: 'POST', body: input({ requesterType: 'top_management' }) })).status, 400)
})

test('manager manual creation atomically assigns active engineers, including temporarily unavailable engineers', async () => {
  await pool.execute('UPDATE users SET is_available = FALSE WHERE id = ?', [accounts.engineerA.id])
  assignedA = await create(input({ assignedTechnicianId: accounts.engineerA.id }), 'manager')
  assignedB = await create(input({ assignedTechnicianId: accounts.engineerB.id }), 'manager')
  assert.equal(assignedA.status, 'assigned')
  assert.equal(assignedA.assignedTechnician, accounts.engineerA.fullName)
  assert.equal(assignedA.assignedByManagerId, accounts.manager.id)
  assert.equal(assignedA.assignedByManagerName, accounts.manager.fullName)
  assert.deepEqual(assignedA.history.map((event) => event.status), ['new', 'assigned'])
  assert.equal(assignedA.history[1].type, 'assignment')
  for (const role of ['employeeA', 'engineerA']) {
    assert.equal((await request('', { role, method: 'POST', body: input({ assignedTechnicianId: accounts.engineerB.id }) })).status, 403)
  }
  await pool.execute('UPDATE users SET is_active = FALSE WHERE id = ?', [accounts.engineerB.id])
  try {
    for (const id of [accounts.engineerB.id, accounts.manager.id, randomUUID()]) {
      assert.equal((await request('', { role: 'manager', method: 'POST', body: input({ assignedTechnicianId: id }) })).status, 400)
    }
  } finally { await pool.execute('UPDATE users SET is_active = TRUE WHERE id = ?', [accounts.engineerB.id]) }
})

test('engineer dashboard list remains assigned; shared ticket list and details are read-only for other work', async () => {
  const a = await request('', { role: 'engineerA' }), b = await request('', { role: 'engineerB' })
  assert.deepEqual(a.data.items.map((ticket) => ticket.id), [assignedA.id])
  assert.deepEqual(b.data.items.map((ticket) => ticket.id), [assignedB.id])
  assert.equal((await request(`/${assignedA.id}`, { role: 'engineerA' })).status, 200)
  const all = await request('?scope=all', { role: 'engineerA' })
  for (const ticket of [assignedA, assignedB, first, manual]) {
    assert.equal(all.data.items.some((row) => row.id === ticket.id), true)
    assert.equal((await request(`/${ticket.id}`, { role: 'engineerA' })).status, 200)
  }
  assert.equal((await request('?scope=all')).status, 400)
  assert.equal((await request('?scope=all', { role: 'manager' })).status, 400)
  const list = await request(`?search=${suffix}`, { role: 'manager' })
  for (const ticket of [first, other, manual, assignedA, assignedB]) {
    assert.equal(list.data.items.some((row) => row.id === ticket.id), true)
    assert.equal((await request(`/${ticket.id}`, { role: 'manager' })).status, 200)
  }
  const filtered = await request(`?status=assigned&assignment=assigned&search=${suffix}`, { role: 'manager' })
  assert.equal(filtered.data.total, 2)
  const reporterSearch = encodeURIComponent(manual.reporterName)
  assert.equal((await request(`?search=${reporterSearch}`, { role: 'engineerA' })).data.total, 1)
  assert.equal((await request(`?search=${reporterSearch}`)).data.total, 0, 'Employee search follows frontend ID/title contract')
})

test('duplicate submissions are atomic and idempotency keys are scoped to the authenticated creator', async () => {
  const key = `request-${randomUUID()}`, body = input({ clientRequestId: key })
  const results = await Promise.all(Array.from({ length: 3 }, () => request('', { method: 'POST', body })))
  assert.deepEqual(results.map((row) => row.status).sort(), [200, 200, 201])
  assert.equal(new Set(results.map((row) => row.data.item.id)).size, 1)
  const id = results[0].data.item.id
  const [[count]] = await pool.execute('SELECT COUNT(*) AS total FROM ticket_history WHERE ticket_id = ?', [id])
  assert.equal(count.total, 1)
  assert.equal((await request('', { method: 'POST', body: { ...body, title: 'طلب مختلف' } })).status, 409)
  const otherOwner = await create(body, 'employeeB')
  assert.notEqual(otherOwner.id, id)
  assert.equal(otherOwner.reporterAccountId, accounts.employeeB.id)
})

test('reference labels are snapshotted; inactive or mismatched references fail without partial tickets', async () => {
  const key = `snapshot-${randomUUID()}`
  const body = input({ clientRequestId: key })
  const ticket = await create(body)
  await pool.execute('UPDATE departments SET name = ?, is_active = FALSE WHERE id = ?', [`renamed-department-${suffix}`, departments[0].id])
  await pool.execute('UPDATE fault_categories SET name = ?, is_active = FALSE WHERE id = ?', [`renamed-category-${suffix}`, categories[0].id])
  await pool.execute('UPDATE fault_subcategories SET name = ?, is_active = FALSE WHERE id = ?', [`renamed-subcategory-${suffix}`, subcategories[0].id])
  try {
    const details = (await request(`/${ticket.id}`)).data.item
    assert.equal(details.department, departments[0].name)
    assert.equal(details.category, categories[0].name)
    assert.equal(details.subcategory, subcategories[0].name)
    assert.equal((await request('', { method: 'POST', body })).status, 200, 'An exact retry still works after reference deactivation')
    assert.equal((await request('', { method: 'POST', body: input() })).status, 400)
  } finally {
    for (const [table, record] of [['departments', departments[0]], ['fault_categories', categories[0]], ['fault_subcategories', subcategories[0]]]) {
      await pool.execute(`UPDATE ${table} SET name = ?, is_active = TRUE WHERE id = ?`, [record.name, record.id])
    }
  }
  const [[beforeCount]] = await pool.execute('SELECT COUNT(*) AS total FROM tickets WHERE created_by_account_id = ?', [accounts.employeeA.id])
  for (const extra of [{ subcategoryId: subcategories[1].id }, { departmentId: randomUUID() }, { categoryId: randomUUID() }, { subcategoryId: randomUUID() }]) {
    assert.equal((await request('', { method: 'POST', body: input(extra) })).status, 400)
  }
  for (const [table, record] of [['departments', departments[0]], ['fault_categories', categories[0]], ['fault_subcategories', subcategories[0]]]) {
    await pool.execute(`UPDATE ${table} SET is_active = FALSE WHERE id = ?`, [record.id])
    try { assert.equal((await request('', { method: 'POST', body: input() })).status, 400) }
    finally { await pool.execute(`UPDATE ${table} SET is_active = TRUE WHERE id = ?`, [record.id]) }
  }
  const [[afterCount]] = await pool.execute('SELECT COUNT(*) AS total FROM tickets WHERE created_by_account_id = ?', [accounts.employeeA.id])
  assert.equal(afterCount.total, beforeCount.total)
})

test('frontend-style label inputs resolve active references; optional subcategory uses the general label', async () => {
  const body = input()
  delete body.departmentId; delete body.categoryId; delete body.subcategoryId
  const ticket = await create({ ...body, department: departments[0].name, category: categories[0].name, subcategory: subcategories[0].name })
  assert.equal(ticket.departmentId, departments[0].id)
  assert.equal(ticket.subcategoryId, subcategories[0].id)
  const withoutSub = await create(input({ subcategoryId: null }))
  assert.equal(withoutSub.subcategoryId, null)
  assert.equal(withoutSub.subcategory, 'عام')
  assert.equal(Object.keys(ticket).some((key) => /priority|rating|maintenance|fingerprint|token|password/.test(key)), false)
})

test('missing required fields, forbidden fields, scope filters and malformed IDs are rejected', async () => {
  for (const field of ['reporterName', 'departmentId', 'categoryId', 'title', 'description']) {
    const body = input(); delete body[field]
    assert.equal((await request('', { method: 'POST', body })).status, 400)
  }
  for (const extra of [{ reporterName: '   ' }, { priority: 'high' }, { rating: 5 }, { maintenance: true }, { status: 'closed' }, { history: [] }, { assignedByManagerId: accounts.manager.id }]) {
    assert.equal((await request('', { method: 'POST', body: input(extra) })).status, 400)
  }
  for (const query of [`reporterAccountId=${accounts.employeeB.id}`, `technicianId=${accounts.engineerB.id}`, 'creationDate=2026-02-30', 'status=unknown', 'pageSize=101', 'page=-1', 'priority=high']) {
    assert.equal((await request(`?${query}`)).status, 400)
  }
  assert.equal((await request('?assignment=all')).status, 403)
  assert.equal((await request('/not-a-uuid')).status, 400)
  assert.equal((await request(`/${randomUUID()}`)).status, 404)
  assert.equal((await request('', { method: 'POST', originHeader: null, body: input() })).status, 403)
  assert.equal((await request('', { role: 'anonymous' })).status, 401)
})

test('role changes immediately change ticket scope without trusting the old login role', async () => {
  await pool.execute("UPDATE users SET role = 'employee' WHERE id = ?", [accounts.engineerA.id])
  try {
    assert.equal((await request(`/${assignedA.id}`, { role: 'engineerA' })).status, 404)
    assert.equal((await request('', { role: 'engineerA' })).data.total, 0)
  } finally { await pool.execute("UPDATE users SET role = 'technician' WHERE id = ?", [accounts.engineerA.id]) }
  await pool.execute("UPDATE users SET role = 'employee' WHERE id = ?", [accounts.manager.id])
  try { assert.equal((await request(`/${first.id}`, { role: 'manager' })).status, 404) }
  finally { await pool.execute("UPDATE users SET role = 'manager' WHERE id = ?", [accounts.manager.id]) }
})

test('ticket references are database allocated, unique under concurrency, searchable, and stable on retries', async () => {
 const body=input({clientRequestId:randomUUID()})
 const ticket=await create(body)
 assert.match(ticket.reference,/^IT[0-9]+$/)
 const retry=await request('',{method:'POST',body});assert.equal(retry.status,200);assert.equal(retry.data.item.reference,ticket.reference)
 const found=await request('?search='+ticket.reference);assert.ok(found.data.items.some(item=>item.id===ticket.id&&item.reference===ticket.reference))
 const concurrent=await Promise.all(Array.from({length:8},()=>create(input({clientRequestId:randomUUID()}))))
 assert.equal(new Set(concurrent.map(item=>item.reference)).size,8)
 assert.ok(concurrent.every(item=>BigInt(item.reference.slice(2))>BigInt(ticket.reference.slice(2))))
 const details=await request('/'+ticket.id);assert.equal(details.data.item.reference,ticket.reference)
})

test('directory selection derives reporter/department server-side, validates activity, snapshots labels and preserves ownership',async()=>{
 const directory=await createMySqlEmployeeDirectoryRepository(pool).create({fullName:'Fictional selected employee '+suffix,departmentId:departments[0].id},accounts.manager)
 const body=input({reporterEmployeeId:directory.id,clientRequestId:randomUUID()});delete body.reporterName;delete body.departmentId
 const ticket=await create(body)
 assert.equal(ticket.reporterName,directory.fullName);assert.equal(ticket.departmentId,directory.departmentId);assert.equal(ticket.reporterAccountId,accounts.employeeA.id)
 assert.equal((await request('/'+ticket.id,{role:'employeeB'})).status,404)
 for(const extra of [{reporterEmployeeId:randomUUID()},{reporterName:'Forged name'},{departmentId:departments[1].id},{employeeNumber:'forged'}])assert.equal((await request('',{method:'POST',body:{...body,...extra,clientRequestId:randomUUID()}})).status,400)
 await pool.execute('UPDATE employee_directory SET full_name=?,is_active=FALSE WHERE id=?',['Fictional renamed employee',directory.id])
 assert.equal((await request('',{method:'POST',body:{...body,clientRequestId:randomUUID()}})).status,400)
 assert.equal((await request('',{method:'POST',body})).data.item.id,ticket.id)
 assert.equal((await request('/'+ticket.id)).data.item.reporterName,directory.fullName)
 await pool.execute('UPDATE employee_directory SET is_active=TRUE WHERE id=?',[directory.id])
 await pool.execute('UPDATE departments SET is_active=FALSE WHERE id=?',[directory.departmentId])
 try {assert.equal((await request('',{method:'POST',body:{...body,clientRequestId:randomUUID()}})).status,400)}
 finally {await pool.execute('UPDATE departments SET is_active=TRUE WHERE id=?',[directory.departmentId])}
})

test('inactive accounts and expired sessions lose ticket access on every request', async () => {
  await pool.execute('UPDATE users SET is_active = FALSE WHERE id = ?', [accounts.employeeA.id])
  assert.equal((await request()).status, 401)
  assert.equal((await request(`/${first.id}`)).status, 401)
  assert.equal((await request('', { method: 'POST', body: input() })).status, 401)
  const token = cookies.engineerB.split('=')[1]
  await pool.execute('UPDATE auth_sessions SET expires_at = ? WHERE token_hash = ?', [new Date(Date.now() - 1000), hashSessionToken(token)])
  assert.equal((await request('', { role: 'engineerB' })).status, 401)
  assert.equal((await request(`/${assignedB.id}`, { role: 'engineerB' })).status, 401)
})
