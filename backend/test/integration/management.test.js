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
import { createLocalAccountService } from '../../src/auth/localAccountService.js'
import { createLocalPasswordProvider } from '../../src/auth/localPasswordProvider.js'
import { createAuthService } from '../../src/auth/authService.js'
import { createApp } from '../../src/app.js'

const origin = 'http://localhost:5173'
const password = `Fictional-only-${randomBytes(16).toString('hex')}`
const suffix = randomUUID()
const owned = { departments: [], 'fault-categories': [], 'fault-subcategories': [], 'it-users': [] }
const accounts = {}, cookies = {}
let pool, server, url

before(async () => {
  const config = await testEnvironment()
  const dev = parse(await readFile(new URL('../../.env', import.meta.url)))
  assert.match(config.DB_NAME, /^hospital_it_helpdesk_test(?:_fresh_[a-f0-9]{12})?$/)
  assert.notEqual(config.DB_NAME, dev.DB_NAME)
  assert.equal(config.DB_HOST, '127.0.0.1')
  assert.notEqual(config.DB_USER, 'root')
  pool = createPool({ host: config.DB_HOST, port: Number(config.DB_PORT), database: config.DB_NAME, user: config.DB_USER, password: config.DB_PASSWORD })
  // Fail clearly when the new migration or permissions have not been applied.
  await pool.query('SELECT id FROM departments LIMIT 0')
  await pool.query('SELECT id FROM fault_categories LIMIT 0')
  await pool.query('SELECT id FROM fault_subcategories LIMIT 0')
  await pool.query('SELECT is_available FROM users LIMIT 0')
  const users = createMySqlUserRepository(pool)
  const provision = createLocalAccountService(users)
  for (const role of ['employee', 'technician', 'manager']) {
    accounts[role] = await provision.create({ email: `management-${role}-${suffix}@demo.example`, fullName: `حساب خيالي ${role}`, role, password })
    owned['it-users'].push(accounts[role].id)
  }
  const authService = createAuthService({ provider: await createLocalPasswordProvider(users), sessions: createMySqlSessionRepository(pool) })
  const managementRepositories = {
    departments: createMySqlReferenceRepository(pool, 'departments'),
    categories: createMySqlReferenceRepository(pool, 'categories'),
    subcategories: createMySqlReferenceRepository(pool, 'subcategories'),
    itUsers: createMySqlItUserRepository(pool),
  }
  server = createApp({ authService, managementRepositories, config: { nodeEnv: 'test', appOrigin: origin } }).listen(0, '127.0.0.1')
  await once(server, 'listening')
  url = `http://127.0.0.1:${server.address().port}`
  for (const role of Object.keys(accounts)) {
    const response = await fetch(`${url}/api/auth/login`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: accounts[role].email, password }) })
    assert.equal(response.status, 200)
    cookies[role] = response.headers.get('set-cookie').split(';')[0]
  }
})

after(async () => {
  try {
    if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  } finally {
    if (pool) {
      try {
        for (const [path, table] of [['fault-subcategories', 'fault_subcategories'], ['fault-categories', 'fault_categories'], ['departments', 'departments'], ['it-users', 'users']]) {
          for (const id of owned[path]) await pool.execute(`DELETE FROM ${table} WHERE id = ?`, [id])
        }
      } finally { await pool.end() }
    }
  }
})

async function request(path, { method = 'GET', role = 'manager', body, originHeader = origin } = {}) {
  const response = await fetch(`${url}/api/${path}`, {
    method, headers: { ...(cookies[role] ? { Cookie: cookies[role] } : {}), ...(originHeader ? { Origin: originHeader } : {}), 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const data = await response.json()
  if (response.status === 201 && owned[path] && data.item?.id) owned[path].push(data.item.id)
  return { status: response.status, data }
}

async function create(path, body) {
  const result = await request(path, { method: 'POST', body })
  assert.equal(result.status, 201)
  return result.data.item
}

test('all management resources require a session and reject writes from employees and engineers', async () => {
  for (const path of Object.keys(owned)) {
    assert.equal((await request(path, { role: 'anonymous' })).status, 401)
    for (const role of ['employee', 'technician']) {
      assert.equal((await request(path, { role })).status, 200)
      assert.equal((await request(path, { role, method: 'POST', body: { role: 'manager', name: 'forged' } })).status, 403)
      assert.equal((await request(`${path}/${randomUUID()}`, { role, method: 'PATCH', body: { isActive: false } })).status, 403)
    }
  }
})

test('department create, edit and deactivation preserve ID and hide inactive records from option readers', async () => {
  const item = await create('departments', { name: `قسم خيالي ${suffix}` })
  const renamed = await request(`departments/${item.id}`, { method: 'PATCH', body: { name: `اسم جديد ${suffix}` } })
  assert.equal(renamed.status, 200)
  assert.equal(renamed.data.item.id, item.id)
  assert.equal((await request('departments', { method: 'POST', body: { name: renamed.data.item.name } })).status, 409)
  assert.equal((await request(`departments/${item.id}`, { method: 'PATCH', body: { isActive: false } })).status, 200)
  for (const role of ['employee', 'technician']) {
    assert.equal((await request(`departments/${item.id}`, { role })).status, 404)
    assert.equal((await request('departments', { role })).data.items.some((row) => row.id === item.id), false)
  }
  assert.equal((await request(`departments/${item.id}`)).data.item.isActive, false)
  assert.equal((await request(`departments/${item.id}`, { method: 'DELETE' })).status, 404)
  assert.equal((await request(`departments/${item.id}`, { method: 'PATCH', body: { isActive: true } })).status, 200)
})

test('subcategories require a valid parent and active options follow both activation states', async () => {
  const category = await create('fault-categories', { name: `نوع خيالي ${suffix}` })
  const second = await create('fault-categories', { name: `نوع آخر ${suffix}` })
  const sub = await create('fault-subcategories', { name: `فرعي خيالي ${suffix}`, categoryId: category.id })
  const sibling = await create('fault-subcategories', { name: sub.name, categoryId: second.id })
  assert.notEqual(sibling.id, sub.id)
  assert.equal((await request('fault-subcategories', { method: 'POST', body: { name: sub.name, categoryId: category.id } })).status, 409)
  assert.equal((await request('fault-subcategories', { method: 'POST', body: { name: 'غير موجود', categoryId: randomUUID() } })).status, 400)
  const filtered = await request(`fault-subcategories?categoryId=${category.id}`, { role: 'employee' })
  assert.equal(filtered.status, 200)
  assert.deepEqual(filtered.data.items.map((row) => row.id), [sub.id])
  await request(`fault-categories/${category.id}`, { method: 'PATCH', body: { isActive: false, name: `اسم متغير ${suffix}` } })
  assert.equal((await request(`fault-categories/${category.id}`, { role: 'employee' })).status, 404)
  assert.equal((await request(`fault-subcategories/${sub.id}`, { role: 'technician' })).status, 404)
  assert.equal((await request(`fault-subcategories?categoryId=${category.id}`, { role: 'employee' })).data.items.length, 0)
  assert.equal((await request(`fault-subcategories/${sub.id}`)).data.item.name, sub.name)
  assert.equal((await request(`fault-subcategories/${sub.id}`)).data.item.isActive, true, 'Deactivation hides children without rewriting their records')
  assert.equal((await request('fault-subcategories', { method: 'POST', body: { name: 'مرفوض', categoryId: category.id } })).status, 409)
  assert.equal((await request(`fault-categories/${category.id}`, { method: 'PATCH', body: { isActive: true } })).status, 200)
  assert.equal((await request(`fault-subcategories/${sub.id}`, { role: 'employee' })).status, 200)
  assert.equal((await request(`fault-subcategories/${sub.id}`, { method: 'PATCH', body: { isActive: false } })).status, 200)
  assert.equal((await request(`fault-subcategories/${sub.id}`, { role: 'employee' })).status, 404)
})

test('IT management excludes employees, allows only IT roles, and stores no new credentials', async () => {
  const engineer = await create('it-users', { email: `new-engineer-${suffix}@demo.example`, fullName: 'مهندس خيالي', role: 'technician' })
  const manager = await create('it-users', { email: `new-manager-${suffix}@demo.example`, fullName: 'مدير خيالي', role: 'manager' })
  assert.equal(engineer.isAvailable, true)
  assert.equal(manager.isAvailable, null)
  for (const item of [engineer, manager]) {
    assert.equal(Object.keys(item).some((key) => /password|phone|extension|token|auth_provider/.test(key)), false)
    const [[row]] = await pool.execute('SELECT password_hash FROM users WHERE id = ?', [item.id])
    assert.equal(row.password_hash, null)
  }
  assert.equal((await request('it-users', { method: 'POST', body: { email: engineer.email, fullName: 'مكرر', role: 'manager' } })).status, 409)
  assert.equal((await request(`it-users/${accounts.employee.id}`)).status, 404)
  assert.equal((await request(`it-users/${accounts.employee.id}`, { method: 'PATCH', body: { role: 'manager' } })).status, 404)
  const inactive = await request(`it-users/${engineer.id}`, { method: 'PATCH', body: { isActive: false, fullName: 'اسم متغير' } })
  assert.equal(inactive.status, 200)
  assert.equal(inactive.data.item.id, engineer.id)
  for (const role of ['employee', 'technician']) {
    const options = (await request('it-users', { role })).data.items
    assert.equal(options.some((row) => [engineer.id, manager.id, accounts.employee.id].includes(row.id)), false)
    assert.equal(options.every((row) => Object.keys(row).sort().join(',') === 'fullName,id,isAvailable'), true)
    assert.equal((await request(`it-users/${manager.id}`, { role })).status, 404)
    assert.equal((await request(`it-users/${engineer.id}`, { role })).status, 404)
  }
  const all = (await request('it-users')).data.items
  assert.equal(all.some((row) => row.id === engineer.id && !row.isActive), true)
  assert.equal(all.some((row) => row.id === accounts.employee.id), false)
})

test('availability can be changed only by the active engineer for their own account', async () => {
  for (const role of ['employee', 'manager']) {
    assert.equal((await request('it-users/me/availability', { role, method: 'PATCH', body: { isAvailable: false } })).status, 403)
  }
  assert.equal((await request('it-users/me/availability', { role: 'technician', method: 'PATCH', body: { isAvailable: false, id: accounts.manager.id } })).status, 400)
  const result = await request('it-users/me/availability', { role: 'technician', method: 'PATCH', body: { isAvailable: false } })
  assert.equal(result.status, 200)
  assert.deepEqual(result.data.item, { id: accounts.technician.id, isAvailable: false })
  const options = (await request('it-users', { role: 'employee' })).data.items
  assert.equal(options.find((row) => row.id === accounts.technician.id).isAvailable, false)
  assert.equal((await request(`it-users/${accounts.technician.id}`, { method: 'PATCH', body: { isAvailable: true } })).status, 400)
  assert.equal((await request(`it-users/${accounts.manager.id}/availability`, { role: 'technician', method: 'PATCH', body: { isAvailable: true } })).status, 404)
  assert.equal((await request('it-users/me/availability', { role: 'technician', method: 'PATCH', body: { isAvailable: true } })).status, 200)
})

test('validation rejects unknown fields, invalid types, forbidden fields and malformed identifiers', async () => {
  for (const path of ['departments', 'fault-categories', 'fault-subcategories']) {
    for (const body of [{}, [], { name: '' }, { name: 'x'.repeat(161) }, { name: 'x', phone: '1' }, { name: 'x', extension: '1' }, { name: 'x', password: 'forbidden' }, { name: 'x', isActive: 'false' }]) {
      assert.equal((await request(path, { method: 'POST', body })).status, 400)
    }
    assert.equal((await request(`${path}/not-a-uuid`)).status, 400)
    assert.equal((await request(`${path}/${randomUUID()}`, { method: 'PATCH', body: { isActive: false } })).status, 404)
    assert.equal((await request(`${path}?includeInactive=true`, { role: 'employee' })).status, 400)
  }
  const valid = { email: `invalid-${suffix}@demo.example`, fullName: 'خيالي', role: 'technician' }
  for (const body of [{ ...valid, role: 'employee' }, { ...valid, email: 'invalid' }, { ...valid, fullName: 'a' }, { ...valid, isActive: 1 }, ...['phone', 'extension', 'password', 'password_hash', 'auth_provider'].map((key) => ({ ...valid, [key]: 'forbidden' }))]) {
    assert.equal((await request('it-users', { method: 'POST', body })).status, 400)
  }
  assert.equal((await request(`it-users/${accounts.technician.id}`, { method: 'PATCH', body: { role: 'employee' } })).status, 400)
  assert.equal((await request(`it-users/${accounts.technician.id}`, { method: 'PATCH', body: { password: 'forbidden' } })).status, 400)
  assert.equal((await request('it-users/me/availability', { role: 'technician', method: 'PATCH', body: { isAvailable: 'false' } })).status, 400)
})

test('writes enforce Origin and authorization is refreshed from the session database', async () => {
  assert.equal((await request('departments', { method: 'POST', originHeader: null, body: { name: 'مرفوض' } })).status, 403)
  assert.equal((await request('departments', { method: 'POST', originHeader: 'https://untrusted.example', body: { name: 'مرفوض' } })).status, 403)
  await pool.execute("UPDATE users SET role = 'technician' WHERE id = ?", [accounts.manager.id])
  try { assert.equal((await request('departments', { method: 'POST', body: { name: 'مرفوض' } })).status, 403) }
  finally { await pool.execute("UPDATE users SET role = 'manager' WHERE id = ?", [accounts.manager.id]) }
  await pool.execute('UPDATE users SET is_active = FALSE WHERE id = ?', [accounts.technician.id])
  assert.equal((await request('departments', { role: 'technician' })).status, 401)
  assert.equal((await request('it-users/me/availability', { role: 'technician', method: 'PATCH', body: { isAvailable: false } })).status, 401)
})
