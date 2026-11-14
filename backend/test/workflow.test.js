import assert from 'node:assert/strict'
import { test } from 'node:test'
import { randomUUID } from 'node:crypto'
import { transition, workflowInput, requireActionRole } from '../src/tickets/workflow.js'
import { ticketStatuses } from '../src/tickets/validation.js'

test('workflow transition matrix rejects every unsupported state change', () => {
  const valid = { in_progress: ['assigned', 'pending', 'reopened'], pending: ['assigned', 'in_progress', 'reopened'],
    resolved: ['assigned', 'in_progress', 'pending', 'reopened'], confirm: ['resolved', 'closed'], reopen: ['resolved', 'closed'] }
  for (const [action, statuses] of Object.entries(valid)) {
    for (const status of ticketStatuses) {
      if (statuses.includes(status)) assert.equal(transition(action, status), { resolved: 'closed', confirm: 'closed', reopen: 'reopened' }[action] ?? action)
      else assert.throws(() => transition(action, status), (error) => error.status === 409)
    }
  }
})

test('workflow role matrix limits each action to its server-defined role', () => {
  for (const [action, allowed] of Object.entries({ assign: 'manager', claim: 'technician', status: 'technician', note: 'technician', comment: 'employee', confirm: 'employee', reopen: 'employee' })) {
    for (const role of ['employee', 'technician', 'manager']) {
      if (role === allowed) assert.doesNotThrow(() => requireActionRole(action, role))
      else assert.throws(() => requireActionRole(action, role), (error) => error.status === 403)
    }
  }
})

test('workflow validation requires pending reasons, solutions, and assignment version checks', () => {
  const invalid = (action, body) => assert.throws(() => workflowInput(action, body), (error) => error.status === 400)
  invalid('assign', { technicianId: randomUUID() })
  invalid('assign', { technicianId: 'invalid', expectedVersion: 0 })
  for (const expectedVersion of [-1, 0.5, '1', null]) invalid('claim', { expectedVersion })
  invalid('status', { status: 'pending' })
  invalid('status', { status: 'resolved', solutionDescription: '  ' })
  invalid('status', { status: 'closed' })
  invalid('status', { status: 'in_progress', pendingReason: 'ignored' })
  invalid('note', { text: 'hello', visibility: 'everyone' })
  invalid('comment', { text: 'hello', authorAccountId: randomUUID() })
  invalid('note', { text: 'hello', priority: 'high' })
  invalid('confirm', { rating: 5 })
  assert.equal(workflowInput('status', { status: 'pending', pendingReason: ' سبب خيالي ' }).text, 'سبب خيالي')
  assert.ok(workflowInput('reopen', {}).text)
  assert.deepEqual(workflowInput('claim', {}), { expectedVersion: undefined })
})
