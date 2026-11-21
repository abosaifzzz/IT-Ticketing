import assert from 'node:assert/strict'
import { createEmployeeTicketApi } from '../src/services/tickets/employeeTicketApi.js'
import { deriveTicketTitle } from '../src/services/tickets/deriveTicketTitle.js'

assert.equal(deriveTicketTitle('  مشكلة\n في الطابعة  '), 'مشكلة في الطابعة')
const calls = []
const client = { async request(path, options = {}) {
  calls.push({ path, options })
  if (path === '/departments') return { items: [{ id: 'dept', name: 'قسم خيالي' }] }
  if (path === '/fault-categories') return { items: [{ id: 'cat', name: 'عطل خيالي' }] }
  if (path === '/fault-subcategories') return { items: [{ id: 'sub', categoryId: 'cat', name: 'فرعي' }] }
  return { item: { id: 'ticket', version: 4 }, items: [], total: 0 }
} }
const service = createEmployeeTicketApi(client)
assert.equal((await service.options()).categories[0].subcategories.length, 1)
const form = { reporterEmployeeId: 'forged', reporterUserId: 'forged', reporterName: 'forged', reporterAccountId: 'forged', employeeNumber: 'forged', category: 'cat', subcategory: 'sub', description: ' تفاصيل ', status: 'closed' }
await service.create(form, 'same-request')
const one = calls.at(-1).options.body
assert.deepEqual(one, { categoryId: 'cat', title: 'تفاصيل', description: 'تفاصيل', clientRequestId: 'same-request', subcategoryId: 'sub' })
await service.create({ ...form, departmentId: 'dept-2' }, 'same-request-2')
assert.equal(calls.at(-1).options.body.departmentId, 'dept-2')
await service.create({ ...form, anydeskId: '123456789' }, 'anydesk-request')
assert.equal(calls.at(-1).options.body.anydeskId, '123456789')
const { normalizeAnydeskId, formatAnydeskId } = await import('../src/services/tickets/anydesk.js')
assert.deepEqual(normalizeAnydeskId(' 123 456 789 '), { value: '123456789', valid: true })
assert.deepEqual(normalizeAnydeskId(''), { value: '', valid: true })
assert.equal(normalizeAnydeskId('Desk@ad').value, 'desk@ad')
for (const bad of ['12345', 'abc', '=1+2']) assert.equal(normalizeAnydeskId(bad).valid, false)
assert.equal(formatAnydeskId('1234567890'), '1 234 567 890')
await service.list({ search: 'طابعة %', status: 'pending', page: 2, reporterAccountId: 'forged' })
assert.ok(calls.at(-1).path.includes('page=2'))
assert.equal(calls.at(-1).path.includes('forged'), false)
await service.details('ticket')
assert.equal(calls.at(-1).path, '/tickets/ticket')
const ticket = { id: 'ticket', version: 4 }
await service.comment(ticket, 'تعليق')
assert.deepEqual(calls.at(-1).options.body, { text: 'تعليق', expectedVersion: 4 })
await service.confirm(ticket)
await service.reopen(ticket, 'سبب')
assert.deepEqual(calls.at(-1).options.body, { reason: 'سبب', expectedVersion: 4 })
console.log('PASS employee API contract: session-owned creation, optional selected department, derived title, retry key, scoped queries, versioned actions')
