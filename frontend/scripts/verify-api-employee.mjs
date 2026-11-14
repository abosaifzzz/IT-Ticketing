import assert from 'node:assert/strict'
import { createEmployeeTicketApi } from '../src/services/tickets/employeeTicketApi.js'
import { deriveTicketTitle } from '../src/services/tickets/deriveTicketTitle.js'
assert.equal(deriveTicketTitle('  مشكلة\n  في الطابعة  '), 'مشكلة في الطابعة')
assert.equal(deriveTicketTitle('أ'.repeat(250)).length, 200)
const calls = []
const roster = Array.from({ length: 132 }, (_, index) => ({ id: `employee-${index + 1}`, fullName: `موظف تجريبي ${String(index + 1).padStart(3, '0')}`, departmentId: 'dept', departmentName: 'قسم خيالي' }))
roster[0] = { id: 'same-a', fullName: 'اسم مشترك', departmentId: 'dept-a', departmentName: 'القسم الأول' }
roster[1] = { id: 'same-b', fullName: 'اسم مشترك', departmentId: 'dept-b', departmentName: 'القسم الثاني' }
const client = { async request(path, options = {}) {
  calls.push({ path, options })
  if (path.startsWith('/employee-options?')) {
    const params = new URLSearchParams(path.split('?')[1])
    const filtered = roster.filter((item) => item.fullName.includes(params.get('search') ?? ''))
    const page = Number(params.get('page'))
    return { items: filtered.slice((page - 1) * 25, page * 25), total: filtered.length, page, pageSize: 25 }
  }
  if (path === '/departments') return { items: [{ id: 'dept', name: 'قسم خيالي' }] }
  if (path === '/fault-categories') return { items: [{ id: 'cat', name: 'عطل خيالي' }] }
  if (path === '/fault-subcategories') return { items: [{ id: 'sub', categoryId: 'cat', name: 'فرعي' }, { id: 'other', categoryId: 'else' }] }
  return { item: { id: 'ticket', version: 4 }, items: [], total: 0 }
} }
const service = createEmployeeTicketApi(client)
const options = await service.options()
assert.equal(options.categories[0].subcategories.length, 1)
const firstPage = await service.employeeOptions('', 1)
const sixthPage = await service.employeeOptions('', 6)
assert.equal(firstPage.items.length, 25)
assert.equal(sixthPage.items.length, 7)
assert.equal(sixthPage.items.at(-1).id, 'employee-132')
assert.equal(firstPage.total, 132)
const sameNames = await service.employeeOptions('اسم مشترك', 1)
assert.deepEqual(sameNames.items.map(({ id, departmentName }) => [id, departmentName]), [['same-a', 'القسم الأول'], ['same-b', 'القسم الثاني']])
const searched = await service.employeeOptions('موظف تجريبي 130', 1)
assert.equal(searched.items[0].id, 'employee-130')
assert.ok(calls.at(-1).path.includes('search=%D9%85'))
const form = { reporterEmployeeId: sixthPage.items.at(-1).id, reporterName: 'forged', department: 'forged', departmentId: 'forged', employeeNumber: '77', title: ' مشكلة ', category: 'cat', subcategory: 'sub', description: ' تفاصيل ', reporterAccountId: 'forged', status: 'closed', source: 'manual' }
await service.create(form, 'self', 'same-request')
let body = calls.at(-1).options.body
assert.equal(body.reporterEmployeeId, 'employee-132')
for (const field of ['reporterName', 'departmentId', 'department', 'employeeNumber', 'reporterAccountId', 'accountId', 'status', 'source', 'createdByAccountId']) assert.equal(Object.hasOwn(body, field), false)
assert.equal(body.subcategoryId, 'sub')
assert.equal(body.title, 'تفاصيل')
assert.equal(body.createdFor, 'self')
assert.equal(body.clientRequestId, 'same-request')
await service.create(form, 'other', 'same-request')
assert.equal(calls.at(-1).options.body.reporterEmployeeId, 'employee-132')
assert.equal(calls.at(-1).options.body.createdFor, 'other')
await service.list({ search: 'طابعة %', status: 'pending', page: 2, pageSize: 20, reporterAccountId: 'forged' })
assert.ok(calls.at(-1).path.includes('page=2')); assert.equal(calls.at(-1).path.includes('forged'), false)
await service.details('ticket')
assert.equal(calls.at(-1).path, '/tickets/ticket')
const ticket = { id: 'ticket', version: 4 }
await service.comment(ticket, 'تعليق')
assert.deepEqual(calls.at(-1).options.body, { text: 'تعليق', expectedVersion: 4 })
await service.confirm(ticket); assert.ok(calls.at(-1).path.endsWith('/confirm-resolution'))
await service.reopen(ticket, 'سبب'); assert.deepEqual(calls.at(-1).options.body, { reason: 'سبب', expectedVersion: 4 })
console.log('PASS employee API contracts: 132-record pagination, Arabic search, distinct same-name IDs, selected reporter payload, both modes, ownership exclusion, filters and versioned actions')
