import { mapTicket, mapTicketForUser, ticketDetails } from '../src/tickets/ticketView.js'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { randomUUID } from 'node:crypto'
import { ticketInput, ticketFilters } from '../src/tickets/validation.js'

const employee = { id: randomUUID(), role: 'employee' }
const valid = { reporterName: 'اسم خيالي', departmentId: randomUUID(), categoryId: randomUUID(), title: 'عطل خيالي', description: 'تفاصيل\nمتعددة الأسطر' }
const fails = (fn, status = 400) => assert.throws(fn, (error) => error.status === status)

test('employee ticket views omit the IT solution while preserving resolution history', async () => {
  const solution = 'حل داخلي تجريبي'
  const row = { id: randomUUID(), ticket_sequence: 1, solution_description: solution }
  const connection = { execute: async () => [[
    { id: randomUUID(), type: 'resolution', status: 'resolved', note: solution, visibility: 'public', data: null },
    { id: randomUUID(), type: 'status', status: 'closed', note: null, visibility: 'public', data: null },
  ]] }
  assert.equal(mapTicketForUser(row, employee).solutionDescription, undefined)
  assert.equal(mapTicketForUser(row, { role: 'technician' }).solutionDescription, solution)
  assert.equal(mapTicketForUser(row, { role: 'manager' }).solutionDescription, solution)
  const employeeDetails = await ticketDetails(connection, row, employee)
  assert.equal('solutionDescription' in employeeDetails, false)
  assert.equal(employeeDetails.history[0].note, null)
  assert.deepEqual(employeeDetails.history.map((event) => event.status), ['resolved', 'closed'])
  const engineerDetails = await ticketDetails(connection, row, { role: 'technician' })
  assert.equal(engineerDetails.solutionDescription, solution)
  assert.equal(engineerDetails.history[0].note, solution)
})

test('ticket validation requires explicit reporter and department, defaults personal, and forbids ownership claims', () => {
  const result = ticketInput(valid, employee)
  assert.equal(result.createdFor, 'self')
  assert.equal(result.source, 'portal')
  assert.equal(result.subcategory, null)
  assert.equal(result.description, valid.description)
  assert.equal(ticketInput({ ...valid, createdFor: 'other' }, employee).createdFor, 'other')
  for (const key of ['reporterName', 'departmentId', 'categoryId', 'title', 'description']) {
    const body = { ...valid }
    delete body[key]
    fails(() => ticketInput(body, employee))
  }
  for (const field of ['reporterAccountId', 'createdByAccountId', 'createdByName', 'createdByRole', 'status', 'priority', 'rating', 'maintenance', 'history']) {
    fails(() => ticketInput({ ...valid, [field]: 'untrusted' }, employee))
  }
  fails(() => ticketInput({ ...valid, department: 'ambiguous' }, employee))
  fails(() => ticketInput({ ...valid, description: 'x'.repeat(4001) }, employee))
})

test('manual tickets and initial assignments enforce role and requester rules', () => {
  fails(() => ticketInput({ ...valid, source: 'manual' }, employee), 403)
  fails(() => ticketInput({ ...valid, assignedTechnicianId: randomUUID() }, employee), 403)
  const engineer = { role: 'technician' }, manager = { role: 'manager' }
  assert.equal(ticketInput(valid, engineer).source, 'manual')
  assert.equal(ticketInput(valid, engineer).createdFor, null)
  fails(() => ticketInput({ ...valid, assignedTechnicianId: randomUUID() }, engineer), 403)
  fails(() => ticketInput({ ...valid, source: 'portal' }, manager), 403)
  fails(() => ticketInput({ ...valid, requesterType: 'top_management' }, manager))
  const senior = { reporterName: valid.reporterName, categoryId: valid.categoryId, title: valid.title, description: valid.description, requesterType: 'top_management', managementPosition: 'مكتب خيالي' }
  assert.equal(ticketInput(senior, manager).requesterType, 'top_management')
  assert.equal(ticketInput(senior, manager).department, null)
  fails(() => ticketInput({ ...senior, departmentId: valid.departmentId }, manager))
  fails(() => ticketInput({ ...senior, employeeNumber: '123' }, manager))
})

test('ticket query validation prevents scope overrides, unbounded pagination and invalid calendar dates', () => {
  assert.equal(ticketFilters({}, employee).pageSize, 50)
  assert.equal(ticketFilters({ creationDate: '2028-02-29' }, employee).creationDate.toISOString(), '2028-02-29T00:00:00.000Z')
  for (const query of [{ reporterAccountId: employee.id }, { technicianId: randomUUID() }, { status: 'admin' },
    { creationDate: '2026-02-29' }, { creationDate: '2026-13-01' }, { page: '0' }, { pageSize: '101' }, { search: ['x'] }, { sort: 'unsafe' }, { priority: 'high' }]) {
    fails(() => ticketFilters(query, employee))
  }
  fails(() => ticketFilters({ assignment: 'all' }, employee), 403)
  fails(() => ticketFilters({ scope: 'all' }, employee))
  fails(() => ticketFilters({ scope: 'other' }, { role: 'technician' }))
  assert.equal(ticketFilters({ scope: 'all' }, { role: 'technician' }).scope, 'all')
})

test('permanent ticket references start at IT0 and preserve large integer precision', () => {
 assert.equal(mapTicket({id:'internal',ticket_sequence:1}).reference,'IT0')
 assert.equal(mapTicket({ticket_sequence:2}).reference,'IT1')
 assert.equal(mapTicket({ticket_sequence:'18446744073709551615'}).reference,'IT18446744073709551614')
 for(const field of ['reference','ticketSequence','ticket_sequence'])fails(()=>ticketInput({...valid,[field]:'IT0'},employee))
})
