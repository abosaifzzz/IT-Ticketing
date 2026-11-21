import assert from 'node:assert/strict'
import { createAccountProfileApi } from '../src/services/auth/accountProfileApi.js'
import { validateProfileForm } from '../src/services/auth/profileValidation.js'
import { createHttpClient } from '../src/services/http/client.js'

const calls = []
const client = createHttpClient({ fetchImpl: async (url, options) => {
  calls.push({ url, options })
  if (url.endsWith('/auth/setup-options')) return Response.json({ items: [{ id: 'department-1', name: 'قسم تجريبي' }] })
  if (url.endsWith('/auth/profile')) return Response.json({ item: { id: 'fictional-user', phone: '01000000000', departmentIds: ['department-1'] } })
  return Response.json({ changed: true, setupCompleted: true, loginRequired: true })
} })
const api = createAccountProfileApi(client)
assert.equal((await api.setupOptions()).items.length, 1)
assert.equal((await api.profile()).id, 'fictional-user')
const setup = await api.completeSetup({ currentPassword: 'old-fictional', newPassword: 'new-fictional', phone: '01000000000', departmentIds: ['department-1'], confirmPassword: 'do-not-send', role: 'manager' })
assert.equal(setup.loginRequired, true)
assert.deepEqual(JSON.parse(calls.at(-1).options.body), { currentPassword: 'old-fictional', newPassword: 'new-fictional', phone: '01000000000', departmentIds: ['department-1'] })
assert.equal(calls.at(-1).options.credentials, 'include')
await api.updateProfile({ phone: '01000000001', departmentIds: ['department-1'], fullName: 'forged' })
assert.deepEqual(JSON.parse(calls.at(-1).options.body), { phone: '01000000001', departmentIds: ['department-1'] })
assert.equal(calls.at(-1).options.method, 'PATCH')
let invalidations = 0
const wrongPasswordApi = createAccountProfileApi(createHttpClient({ fetchImpl: async () => Response.json({ error: 'private detail' }, { status: 401 }), onUnauthorized: () => { invalidations++ } }))
await assert.rejects(wrongPasswordApi.completeSetup({ currentPassword: 'wrong-fictional', newPassword: 'new-fictional', phone: '01000000000', departmentIds: ['department-1'] }), (error) => error.status === 401 && !error.message.includes('private'))
assert.equal(invalidations, 0)
const active = new Set(['department-1', 'department-2'])
const valid = { phone: '+20 100 000 0000', departmentIds: ['department-1'], currentPassword: 'old-fictional', newPassword: 'new-fictional', confirmPassword: 'new-fictional' }
assert.equal(validateProfileForm(valid, active, { setup: true, role: 'employee' }), '')
assert.equal(validateProfileForm({ ...valid, departmentIds: ['department-1', 'department-2'] }, active, { setup: true }), '')
for (const ids of [[], ['inactive'], ['department-1', 'department-1']]) assert.match(validateProfileForm({ ...valid, departmentIds: ids }, active), /قسم/)
for (const phone of ['123', '0100000x000', '(01000000000)', ' 01000000000 ']) {
  if (phone.trim() === '01000000000') continue
  assert.match(validateProfileForm({ ...valid, phone }, active), /هاتف/)
}
assert.match(validateProfileForm({ ...valid, confirmPassword: 'different' }, active, { setup: true }), /تطابق/)
assert.match(validateProfileForm({ ...valid, newPassword: valid.currentPassword, confirmPassword: valid.currentPassword }, active, { setup: true }), /مختلفة/)
assert.match(validateProfileForm({ ...valid, newPassword: '123', confirmPassword: '123' }, active, { setup: true }), /مختلفة/)
assert.match(validateProfileForm(valid, active, { setup: true, role: 'admin' }), /١٦/)
console.log('PASS account profile API and validation: cookie credentials, allowlisted writes, wrong password, phone, departments and password rules')
