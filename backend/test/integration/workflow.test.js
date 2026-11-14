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
import { createMySqlItUserRepository } from '../../src/repositories/mysqlItUserRepository.js'
import { createMySqlTicketRepository } from '../../src/repositories/mysqlTicketRepository.js'
import { createMySqlTicketWorkflowRepository } from '../../src/repositories/mysqlTicketWorkflowRepository.js'
import { createLocalAccountService } from '../../src/auth/localAccountService.js'
import { createLocalPasswordProvider } from '../../src/auth/localPasswordProvider.js'
import { createAuthService, hashSessionToken } from '../../src/auth/authService.js'
import { createApp } from '../../src/app.js'

const suffix = randomUUID(), password = `Fictional-${randomBytes(16).toString('hex')}`
const internalSecret = `INTERNAL-ONLY-${randomUUID()}`
const origin = 'http://localhost:5173', accounts = {}, cookies = {}
let pool, server, url, department, category

before(async () => {
  const e = await testEnvironment()
  const dev = parse(await readFile(new URL('../../.env', import.meta.url)))
  assert.match(e.DB_NAME, /^hospital_it_helpdesk_test(?:_fresh_[a-f0-9]{12})?$/)
  assert.notEqual(e.DB_NAME, dev.DB_NAME)
  assert.equal(e.DB_HOST, '127.0.0.1')
  assert.notEqual(e.DB_USER, 'root')
  pool = createPool({ host: e.DB_HOST, port: Number(e.DB_PORT), database: e.DB_NAME, user: e.DB_USER, password: e.DB_PASSWORD })
  await pool.query('SELECT version, assigned_by_technician_id FROM tickets LIMIT 0')
  await pool.query('SELECT visibility, event_data FROM ticket_history LIMIT 0')
  const users = createMySqlUserRepository(pool), provision = createLocalAccountService(users)
  for (const [key, role] of [['employeeA', 'employee'], ['employeeB', 'employee'], ['engineerA', 'technician'], ['engineerB', 'technician'], ['managerA', 'manager'], ['managerB', 'manager']]) {
    accounts[key] = await provision.create({ email: `workflow-${key}-${suffix}@demo.example`, fullName: `حساب خيالي ${key}`, role, password })
  }
  department = await createMySqlReferenceRepository(pool, 'departments').save({ name: `قسم خيالي ${suffix}`, isActive: true })
  category = await createMySqlReferenceRepository(pool, 'categories').save({ name: `نوع خيالي ${suffix}`, isActive: true })
  const authService = createAuthService({ provider: await createLocalPasswordProvider(users), sessions: createMySqlSessionRepository(pool) })
  const managementRepositories = {
    departments: createMySqlReferenceRepository(pool, 'departments'), categories: createMySqlReferenceRepository(pool, 'categories'),
    subcategories: createMySqlReferenceRepository(pool, 'subcategories'), itUsers: createMySqlItUserRepository(pool),
  }
  server = createApp({ authService, managementRepositories, ticketRepository: createMySqlTicketRepository(pool), ticketWorkflowRepository: createMySqlTicketWorkflowRepository(pool),
    config: { appOrigin: origin, nodeEnv: 'test' } }).listen(0, '127.0.0.1')
  await once(server, 'listening')
  url = `http://127.0.0.1:${server.address().port}`
  for (const key of Object.keys(accounts)) {
    const response = await fetch(`${url}/api/auth/login`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: accounts[key].email, password }) })
    assert.equal(response.status, 200)
    cookies[key] = response.headers.get('set-cookie').split(';')[0]
  }
})

after(async () => {
  try { if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())) }
  finally {
    if (pool) {
      try {
        for (const account of Object.values(accounts)) await pool.execute('DELETE FROM tickets WHERE created_by_account_id = ?', [account.id])
        if (category) await pool.execute('DELETE FROM fault_categories WHERE id = ?', [category.id])
        if (department) await pool.execute('DELETE FROM departments WHERE id = ?', [department.id])
        for (const account of Object.values(accounts)) await pool.execute('DELETE FROM users WHERE id = ?', [account.id])
      } finally { await pool.end() }
    }
  }
})

async function request(path, { role = 'managerA', body, method = body === undefined ? 'GET' : 'POST', originHeader = origin } = {}) {
  const response = await fetch(`${url}/api${path}`, { method,
    headers: { ...(cookies[role] ? { Cookie: cookies[role] } : {}), ...(originHeader ? { Origin: originHeader } : {}), 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  return { status: response.status, data: await response.json() }
}

function ticketInput(extra = {}) {
  return { reporterName: 'موظف خيالي مدخل يدويًا', departmentId: department.id, categoryId: category.id,
    title: `Workflow ${suffix}`, description: 'تفاصيل خيالية', ...extra }
}

async function create(extra = {}, role = 'employeeA') {
  const result = await request('/tickets', { role, body: ticketInput(extra) })
  assert.equal(result.status, 201)
  return result.data.item
}

async function act(ticket, action, body = {}, role = 'engineerA', expected = 200) {
  const response = await request(`/tickets/${ticket.id}/${action}`, { role, body })
  assert.equal(response.status, expected)
  return response.data.item
}

async function assign(ticket, engineer = 'engineerA', manager = 'managerA') {
  const current = await request(`/tickets/${ticket.id}`, { role: manager })
  return act(ticket, 'assignment', { technicianId: accounts[engineer].id, expectedVersion: current.data.item.version }, manager)
}

async function available(role, value) {
  const result = await request('/it-users/me/availability', { role, method: 'PATCH', body: { isAvailable: value } })
  assert.equal(result.status, 200)
}

test('assignment and reassignment record manager snapshots and revoke the previous engineer scope', async () => {
  let ticket = await create()
  ticket = await assign(ticket)
  assert.equal(ticket.status, 'assigned')
  assert.equal(ticket.assignedByManagerId, accounts.managerA.id)
  assert.equal(ticket.assignedByTechnicianId, null)
  assert.equal(ticket.history.at(-1).data.technicianId, accounts.engineerA.id)
  const unchanged = await act(ticket, 'assignment', { technicianId: accounts.engineerA.id, expectedVersion: ticket.version }, 'managerA')
  assert.equal(unchanged.version, ticket.version)
  ticket = await act(ticket, 'status', { status: 'in_progress' })
  ticket = await assign(ticket, 'engineerB', 'managerB')
  assert.equal(ticket.status, 'in_progress', 'Reassignment must preserve progress')
  assert.equal(ticket.assignedByManagerId, accounts.managerB.id)
  const events = ticket.history.filter((event) => event.type === 'assignment')
  assert.equal(events.length, 2)
  assert.equal(events[0].actorAccountId, accounts.managerA.id)
  assert.equal(events[1].data.previousTechnicianId, accounts.engineerA.id)
  assert.equal(events[1].data.assignedByManagerName, accounts.managerB.fullName)
  assert.equal((await request(`/tickets/${ticket.id}`, { role: 'engineerA' })).status, 200)
  await act(ticket, 'notes', { text: 'مرفوض' }, 'engineerA', 404)
  await act(ticket, 'status', { status: 'pending', pendingReason: 'مرفوض' }, 'engineerA', 404)
  assert.equal((await request(`/tickets/${ticket.id}`, { role: 'engineerB' })).status, 200)
})

test('self-claims are engineer-owned, cannot take over assignments, and queue responses expose summaries only', async () => {
  let ticket = await create()
  const queue = await request('/tickets/unassigned', { role: 'engineerA' })
  const summary = queue.data.items.find((item) => item.id === ticket.id)
  assert.ok(summary)
  assert.equal(Object.hasOwn(summary, 'description'), false)
  assert.equal(Object.hasOwn(summary, 'reporterAccountId'), false)
  assert.equal((await request('/tickets/unassigned', { role: 'employeeA' })).status, 403)
  ticket = await act(ticket, 'claim')
  assert.equal(ticket.assignedByManagerId, null)
  assert.equal(ticket.assignedByTechnicianId, accounts.engineerA.id)
  assert.equal(ticket.history.at(-1).type, 'claim')
  assert.equal(ticket.history.at(-1).data.assignedByManagerId, null)
  await act(ticket, 'claim', {}, 'engineerA', 409)
  await act(ticket, 'claim', {}, 'engineerB', 409)
  ticket = await assign(ticket, 'engineerB')
  assert.equal(ticket.assignedByTechnicianId, null)
  assert.equal(ticket.assignedByManagerId, accounts.managerA.id)
  assert.equal(ticket.history.find((entry) => entry.type === 'claim').data.assignedByTechnicianId, accounts.engineerA.id)
})

test('availability blocks claims but does not prevent manager assignment or existing assigned work', async () => {
  let ticket = await create()
  await available('engineerA', false)
  try {
    await act(ticket, 'claim', {}, 'engineerA', 409)
    ticket = await assign(ticket)
    ticket = await act(ticket, 'status', { status: 'in_progress' })
    assert.equal(ticket.status, 'in_progress')
    await act(ticket, 'notes', { text: 'ملاحظة أثناء عدم التوفر', visibility: 'public' })
  } finally { await available('engineerA', true) }
  await pool.execute('UPDATE users SET is_active = FALSE WHERE id = ?', [accounts.engineerB.id])
  try { await act(ticket, 'assignment', { technicianId: accounts.engineerB.id, expectedVersion: (await request(`/tickets/${ticket.id}`)).data.item.version }, 'managerA', 400) }
  finally { await pool.execute('UPDATE users SET is_active = TRUE WHERE id = ?', [accounts.engineerB.id]) }
})

test('pending, resume, solutions, confirmation and repeated reopenings preserve all earlier history', async () => {
  let ticket = await assign(await create())
  ticket = await act(ticket, 'status', { status: 'pending', pendingReason: 'انتظار قطعة خيالية' })
  assert.equal(ticket.pendingReason, 'انتظار قطعة خيالية')
  assert.ok(ticket.pendingAt)
  ticket = await act(ticket, 'status', { status: 'in_progress' })
  assert.equal(ticket.pendingReason, null)
  ticket = await act(ticket, 'status', { status: 'resolved', solutionDescription: 'حل خيالي أول' })
  assert.equal(ticket.status, 'closed')
  assert.equal(ticket.resolutionConfirmedAt, null)
  assert.deepEqual(ticket.history.slice(-2).map((event) => [event.type, event.status]), [['resolution', 'resolved'], ['status', 'closed']])
  const firstResolvedAt = ticket.resolvedAt
  assert.equal(ticket.solutionDescription, 'حل خيالي أول')
  ticket = await act(ticket, 'confirm-resolution', {}, 'employeeA')
  assert.equal(ticket.status, 'closed')
  assert.ok(ticket.resolutionConfirmedAt)
  ticket = await act(ticket, 'reopen', { reason: 'المشكلة الخيالية مستمرة' }, 'employeeA')
  assert.equal(ticket.status, 'reopened')
  assert.equal(ticket.resolutionConfirmedAt, null)
  assert.equal(ticket.resolvedAt, firstResolvedAt)
  ticket = await act(ticket, 'status', { status: 'in_progress' })
  ticket = await act(ticket, 'status', { status: 'resolved', solutionDescription: 'حل خيالي ثان' })
  ticket = await act(ticket, 'reopen', {}, 'employeeA')
  assert.equal(ticket.history.filter((event) => event.type === 'reopened').length, 2)
  assert.equal(ticket.solutionDescription, undefined)
  assert.ok(ticket.history.filter(event => event.type === 'resolution').every(event => event.note === null))
  const itTicket = (await request(`/tickets/${ticket.id}`, { role: 'managerA' })).data.item
  assert.deepEqual(itTicket.history.filter((event) => event.type === 'resolution').map((event) => event.note), ['حل خيالي أول', 'حل خيالي ثان'])
  assert.equal(ticket.history.filter((event) => event.type === 'confirmation').length, 1)
  assert.ok(ticket.history.some((event) => event.note === 'انتظار قطعة خيالية'))
  assert.equal(itTicket.solutionDescription, 'حل خيالي ثان')
})

test('internal notes never reach employees through details, list, comments, replay, confirmation or reopening', async () => {
  const input = { clientRequestId: `privacy-${randomUUID()}` }
  let ticket = await assign(await create(input))
  await act(ticket, 'notes', { text: 'ملاحظة عامة خيالية', visibility: 'public' })
  await act(ticket, 'notes', { text: internalSecret, visibility: 'internal' })
  for (const role of ['engineerA', 'managerA']) {
    const result = await request(`/tickets/${ticket.id}`, { role })
    assert.equal(result.data.item.internalTechnicianNotes[0].text, internalSecret)
    assert.equal(result.data.item.history.some((event) => event.note === internalSecret), true)
  }
  const replies = [await request(`/tickets/${ticket.id}`, { role: 'employeeA' }), await request('/tickets', { role: 'employeeA' }),
    await request('/tickets', { role: 'employeeA', body: ticketInput(input) })]
  const comment = await act(ticket, 'comments', { text: 'تعليق موظف خيالي' }, 'employeeA')
  replies.push({ data: comment })
  assert.equal(comment.comments[0].authorAccountId, accounts.employeeA.id)
  assert.equal(comment.comments[0].authorName, accounts.employeeA.fullName)
  ticket = await act(ticket, 'status', { status: 'resolved', solutionDescription: 'حل خيالي' })
  const employeeSolved = await request(`/tickets/${ticket.id}`, { role: 'employeeA' })
  const employeeList = await request('/tickets', { role: 'employeeA' })
  assert.equal(employeeSolved.data.item.solutionDescription, undefined)
  assert.equal(employeeSolved.data.item.history.find((event) => event.type === 'resolution').note, null)
  assert.equal(employeeList.data.items.find((item) => item.id === ticket.id).solutionDescription, undefined)
  assert.equal((await request(`/tickets/${ticket.id}`, { role: 'engineerA' })).data.item.solutionDescription, 'حل خيالي')
  assert.equal((await request(`/tickets/${ticket.id}`, { role: 'managerA' })).data.item.solutionDescription, 'حل خيالي')
  replies.push(employeeSolved, employeeList)
  replies.push({ data: await act(ticket, 'confirm-resolution', {}, 'employeeA') })
  replies.push({ data: await act(ticket, 'reopen', { reason: 'إعادة فتح خيالية' }, 'employeeA') })
  for (const reply of replies) {
    assert.equal(JSON.stringify(reply).includes(internalSecret), false)
    assert.equal(JSON.stringify(reply).includes('حل خيالي'), false)
    assert.equal(JSON.stringify(reply).includes('internalTechnicianNotes'), false)
    assert.equal(JSON.stringify(reply).includes('"visibility":"internal"'), false)
  }
})

test('authorization, pending/solution validation and invalid transitions leave state and history unchanged', async () => {
  const ticket = await assign(await create())
  for (const [action, body, roles] of [
    ['assignment', { technicianId: accounts.engineerB.id, expectedVersion: ticket.version }, ['employeeA', 'engineerA']],
    ['claim', {}, ['employeeA', 'managerA']], ['status', { status: 'in_progress' }, ['employeeA', 'managerA']],
    ['notes', { text: 'مرفوض' }, ['employeeA', 'managerA']], ['comments', { text: 'مرفوض' }, ['engineerA', 'managerA']],
    ['confirm-resolution', {}, ['engineerA', 'managerA']], ['reopen', {}, ['engineerA', 'managerA']],
  ]) for (const role of roles) await act(ticket, action, body, role, 403)
  await act(ticket, 'comments', { text: 'مرفوض' }, 'employeeB', 404)
  await act(ticket, 'confirm-resolution', {}, 'employeeB', 404)
  await act(ticket, 'reopen', {}, 'employeeB', 404)
  await act(ticket, 'confirm-resolution', {}, 'employeeA', 409)
  await act(ticket, 'reopen', {}, 'employeeA', 409)
  await act(ticket, 'status', { status: 'pending' }, 'engineerA', 400)
  await act(ticket, 'status', { status: 'resolved', solutionDescription: '  ' }, 'engineerA', 400)
  await act(ticket, 'status', { status: 'closed' }, 'engineerA', 400)
  await act(ticket, 'notes', { text: 'مرفوض', visibility: 'secret' }, 'engineerA', 400)
  await act(ticket, 'comments', { text: 'مرفوض', authorAccountId: accounts.employeeA.id }, 'employeeA', 400)
  await act(ticket, 'assignment', { technicianId: accounts.employeeA.id, expectedVersion: ticket.version }, 'managerA', 400)
  await act(ticket, 'assignment', { technicianId: accounts.managerB.id, expectedVersion: ticket.version }, 'managerA', 400)
  await act(ticket, 'assignment', { technicianId: accounts.engineerB.id }, 'managerA', 400)
  const current = (await request(`/tickets/${ticket.id}`)).data.item
  assert.equal(current.version, ticket.version)
  assert.equal(current.history.length, ticket.history.length)
  const resolved = await act(ticket, 'status', { status: 'resolved', solutionDescription: 'حل خيالي' })
  for (const body of [{ status: 'resolved', solutionDescription: 'مكرر' }, { status: 'pending', pendingReason: 'مرفوض' }, { status: 'in_progress' }]) await act(resolved, 'status', body, 'engineerA', 409)
  await act(resolved, 'notes', { text: 'مرفوض' }, 'engineerA', 409)
})

test('only one concurrent engineer can claim a new ticket', async () => {
  const ticket = await create()
  const replies = await Promise.all(Array.from({ length: 12 }, (_, i) => request(`/tickets/${ticket.id}/claim`, { role: i % 2 ? 'engineerA' : 'engineerB', body: {} })))
  assert.equal(replies.filter((reply) => reply.status === 200).length, 1)
  assert.equal(replies.filter((reply) => reply.status === 409).length, 11)
  const current = (await request(`/tickets/${ticket.id}`)).data.item
  assert.equal(current.version, 1)
  assert.equal(current.history.filter((event) => event.type === 'claim').length, 1)
  assert.equal(current.assignedByTechnicianId, current.assignedTechnicianId)
})

test('manager-versus-claim and manager-versus-manager races cannot silently overwrite assignment', async () => {
  const ticket = await create()
  const replies = await Promise.all([
    request(`/tickets/${ticket.id}/claim`, { role: 'engineerA', body: {} }),
    request(`/tickets/${ticket.id}/claim`, { role: 'engineerB', body: {} }),
    request(`/tickets/${ticket.id}/assignment`, { role: 'managerA', body: { technicianId: accounts.engineerA.id, expectedVersion: 0 } }),
  ])
  assert.deepEqual(replies.map((reply) => reply.status).sort(), [200, 409, 409])
  const current = (await request(`/tickets/${ticket.id}`)).data.item
  const second = await Promise.all(['managerA', 'managerB'].map((role) => request(`/tickets/${ticket.id}/assignment`, {
    role, body: { technicianId: current.assignedTechnicianId === accounts.engineerA.id ? accounts.engineerB.id : accounts.engineerA.id, expectedVersion: current.version },
  })))
  assert.deepEqual(second.map((reply) => reply.status).sort(), [200, 409])
})

test('concurrent notes retain ordered unique activity entries; reassignment races reject stale engineer writes', async () => {
  let ticket = await assign(await create())
  const replies = await Promise.all(Array.from({ length: 8 }, (_, i) => request(`/tickets/${ticket.id}/notes`, { role: 'engineerA', body: { text: `ملاحظة خيالية ${i}`, visibility: i % 2 ? 'internal' : 'public' } })))
  assert.equal(replies.every((reply) => reply.status === 200), true)
  ticket = (await request(`/tickets/${ticket.id}`)).data.item
  assert.equal(ticket.history.filter((event) => event.type === 'technician_note').length, 8)
  const [sequence] = await pool.execute('SELECT sequence_number FROM ticket_history WHERE ticket_id = ? ORDER BY sequence_number', [ticket.id])
  assert.deepEqual(sequence.map((row) => Number(row.sequence_number)), Array.from({ length: 10 }, (_, i) => i + 1))
  const raced = await Promise.all([
    request(`/tickets/${ticket.id}/assignment`, { body: { technicianId: accounts.engineerB.id, expectedVersion: ticket.version } }),
    request(`/tickets/${ticket.id}/notes`, { role: 'engineerA', body: { text: 'ملاحظة متزامنة' } }),
  ])
  assert.ok((raced[0].status === 200 && raced[1].status === 404) || (raced[0].status === 409 && raced[1].status === 200))
})

test('concurrent resolution/confirmation attempts append only one successful transition', async () => {
  const ticket = await assign(await create())
  const resolutions = await Promise.all([1, 2].map((i) => request(`/tickets/${ticket.id}/status`, { role: 'engineerA', body: { status: 'resolved', solutionDescription: `حل متزامن ${i}` } })))
  assert.deepEqual(resolutions.map((reply) => reply.status).sort(), [200, 409])
  const confirms = await Promise.all([1, 2].map(() => request(`/tickets/${ticket.id}/confirm-resolution`, { role: 'employeeA', body: {} })))
  assert.deepEqual(confirms.map((reply) => reply.status).sort(), [200, 409])
  const current = (await request(`/tickets/${ticket.id}`)).data.item
  assert.equal(current.status, 'closed')
  assert.equal(current.history.filter((event) => event.type === 'resolution').length, 1)
  assert.equal(current.history.filter((event) => event.type === 'confirmation').length, 1)
})

test('manual-ticket creator cannot bypass reassignment scope using an old creation idempotency key', async () => {
  const body = ticketInput({ clientRequestId: `manual-replay-${randomUUID()}` })
  const created = await request('/tickets', { role: 'engineerA', body })
  assert.equal(created.status, 201)
  const ticket = await assign(created.data.item, 'engineerB')
  await act(ticket, 'notes', { text: internalSecret, visibility: 'internal' }, 'engineerB')
  const replay = await request('/tickets', { role: 'engineerA', body })
  assert.equal(replay.status, 404)
  assert.equal(JSON.stringify(replay).includes(internalSecret), false)
  await act(ticket, 'confirm-resolution', {}, 'employeeA', 404)
})

test('availability changes and claims serialize against the same account state', async () => {
  const ticket = await create()
  await available('engineerA', true)
  try {
    const [claim, change] = await Promise.all([
      request(`/tickets/${ticket.id}/claim`, { role: 'engineerA', body: {} }),
      request('/it-users/me/availability', { role: 'engineerA', method: 'PATCH', body: { isAvailable: false } }),
    ])
    assert.equal(change.status, 200)
    assert.ok([200, 409].includes(claim.status))
    const current = (await request(`/tickets/${ticket.id}`)).data.item
    assert.equal(current.assignedTechnicianId, claim.status === 200 ? accounts.engineerA.id : null)
    await act(await create(), 'claim', {}, 'engineerA', 409)
  } finally { await available('engineerA', true) }
})

test('workflow writes retain CSRF checks and reject inactive or expired sessions', async () => {
  const ticket = await assign(await create(), 'engineerB')
  const noOrigin = await request(`/tickets/${ticket.id}/status`, { role: 'engineerB', body: { status: 'in_progress' }, originHeader: null })
  assert.equal(noOrigin.status, 403)
  assert.equal((await request(`/tickets/${ticket.id}/claim`, { role: 'anonymous', body: {} })).status, 401)
  await pool.execute('UPDATE users SET is_active = FALSE WHERE id = ?', [accounts.engineerB.id])
  assert.equal((await request(`/tickets/${ticket.id}/notes`, { role: 'engineerB', body: { text: 'مرفوض' } })).status, 401)
  await pool.execute('UPDATE auth_sessions SET expires_at = ? WHERE token_hash = ?', [new Date(Date.now() - 1000), hashSessionToken(cookies.managerB.split('=')[1])])
  assert.equal((await request(`/tickets/${ticket.id}/assignment`, { role: 'managerB', body: { technicianId: accounts.engineerA.id, expectedVersion: ticket.version } })).status, 401)
})
