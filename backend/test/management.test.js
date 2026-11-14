import assert from 'node:assert/strict'
import { test } from 'node:test'
import { randomUUID } from 'node:crypto'
import { ApiError, employeeDirectoryInput, referenceInput, itUserInput, uuid } from '../src/management/validation.js'

const invalid = (fn) => assert.throws(fn, (error) => error instanceof ApiError && error.status === 400)

test('reference validation trims labels and enforces boolean, UUID and field allowlists', () => {
  assert.deepEqual(referenceInput({ name: '  قسم خيالي  ' }), { name: 'قسم خيالي', isActive: true })
  const categoryId = randomUUID()
  assert.deepEqual(referenceInput({ name: 'نوع فرعي', categoryId }, { subcategory: true }), { name: 'نوع فرعي', categoryId, isActive: true })
  assert.deepEqual(referenceInput({ isActive: false }, { patch: true }), { isActive: false })
  for (const body of [null, [], {}, { name: '' }, { name: '  ' }, { name: 'a'.repeat(161) },
    { name: 'x\n' + 'y' }, { name: 'x', isActive: 'false' }, { name: 'x', phone: '1' }, { name: 'x', id: randomUUID() }]) {
    invalid(() => referenceInput(body))
  }
  invalid(() => referenceInput({ name: 'x' }, { subcategory: true }))
  invalid(() => referenceInput({ name: 'x', categoryId: 'not-id' }, { subcategory: true }))
  invalid(() => uuid("' OR 1=1"))
})

test('IT management accepts only two roles and never credentials or contact fields', () => {
  const body = { email: '  FICTIONAL@DEMO.EXAMPLE ', fullName: ' حساب خيالي ', role: 'technician' }
  assert.deepEqual(itUserInput(body), { email: 'fictional@demo.example', fullName: 'حساب خيالي', role: 'technician', isActive: true })
  for (const role of ['employee', 'admin', 'engineer', null]) invalid(() => itUserInput({ ...body, role }))
  for (const field of ['password', 'password_hash', 'phone', 'extension', 'auth_provider', 'isAvailable', 'id']) {
    invalid(() => itUserInput({ ...body, [field]: 'untrusted' }))
    invalid(() => itUserInput({ [field]: 'untrusted' }, true))
  }
  for (const patch of [{}, { isActive: 1 }, { email: 'bad' }, { fullName: 'a' }, { role: 'employee' }]) invalid(() => itUserInput(patch, true))
})

test('employee directory requires name and department and rejects codes or credentials', () => {
 const departmentId=randomUUID(), valid={fullName:'Fictional employee',departmentId}
 assert.deepEqual(employeeDirectoryInput({...valid,fullName:' Fictional employee '}),valid)
 for(const body of [{...valid,fullName:'x'},{...valid,departmentId:'invalid'},{...valid,employeeNumber:'E-001'},{...valid,password:'secret'},{...valid,reporterAccountId:randomUUID()}])invalid(()=>employeeDirectoryInput(body))
})
