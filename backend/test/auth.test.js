import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createApp, sessionCookieName } from '../src/app.js'
import { createAuthService, hashSessionToken } from '../src/auth/authService.js'
import { createLocalPasswordProvider } from '../src/auth/localPasswordProvider.js'
import { hashPassword, verifyPassword } from '../src/auth/passwords.js'

const origin = 'http://localhost:5173'
const password = 'A-fictional-password-123!'
let server
let url
let sessions
let user

before(async () => {
  user = {
    id: 'test-employee-01', email: 'employee@demo.example', full_name: 'موظف تجريبي',
    role: 'employee', auth_provider: 'local', password_hash: await hashPassword(password), is_active: true,
  }
  const users = { async findByEmail(email) { return email === user.email ? user : null } }
  const records = new Map()
  sessions = {
    records,
    async create(record) { records.set(record.tokenHash, { ...record }) },
    async findUserByTokenHash(hash) {
      const record = records.get(hash)
      return record ? { ...user, expires_at: record.expiresAt } : null
    },
    async delete(hash) { records.delete(hash) },
  }
  const provider = await createLocalPasswordProvider(users)
  const app = createApp({ authService: createAuthService({ provider, sessions }), config: { appOrigin: origin, nodeEnv: 'test' } })
  server = app.listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))
  url = `http://127.0.0.1:${server.address().port}`
})

after(async () => {
  await new Promise((resolve) => server.close(resolve))
})

function login(email, suppliedPassword) {
  return fetch(`${url}/api/auth/login`, {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: suppliedPassword }),
  })
}

test('Argon2id hashes and verifies passwords without exposing plaintext', async () => {
  const hash = await hashPassword(password)
  assert.match(hash, /^\$argon2id\$/)
  assert.equal(await verifyPassword(hash, password), true)
  assert.equal(await verifyPassword(hash, 'incorrect-password'), false)
  assert.notEqual(await hashPassword(password), hash)
})

test('local login, hashed session, restore and logout', async () => {
  assert.equal((await login(user.email, 'wrong-password')).status, 401)
  assert.equal((await login('missing@demo.example', password)).status, 401)
  const response = await login(user.email.toUpperCase(), password)
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.user.id, user.id)
  assert.equal(body.user.role, 'employee')
  assert.equal(JSON.stringify(body).includes(password), false)
  assert.equal(JSON.stringify(body).includes(user.password_hash), false)
  const cookie = response.headers.get('set-cookie')
  assert.match(cookie, /HttpOnly/i)
  assert.match(cookie, /SameSite=Strict/i)
  const [cookiePair] = cookie.split(';')
  const token = cookiePair.split('=')[1]
  assert.equal(sessions.records.has(token), false)
  assert.equal(sessions.records.has(hashSessionToken(token)), true)

  const restored = await fetch(`${url}/api/auth/me`, { headers: { Cookie: cookiePair } })
  assert.equal(restored.status, 200)
  assert.equal((await restored.json()).user.id, user.id)

  const logout = await fetch(`${url}/api/auth/logout`, { method: 'POST', headers: { Origin: origin, Cookie: cookiePair } })
  assert.equal(logout.status, 204)
  assert.equal((await fetch(`${url}/api/auth/me`, { headers: { Cookie: cookiePair } })).status, 401)
})

test('inactive accounts and expired sessions cannot restore', async () => {
  const response = await login(user.email, password)
  assert.equal(response.status, 200)
  const [cookiePair] = response.headers.get('set-cookie').split(';')
  user.is_active = false
  assert.equal((await fetch(`${url}/api/auth/me`, { headers: { Cookie: cookiePair } })).status, 401)
  assert.equal((await login(user.email, password)).status, 401)
  user.is_active = true

  const secondLogin = await login(user.email, password)
  const [secondCookie] = secondLogin.headers.get('set-cookie').split(';')
  const token = secondCookie.split('=')[1]
  sessions.records.get(hashSessionToken(token)).expiresAt = new Date(Date.now() - 1000)
  assert.equal((await fetch(`${url}/api/auth/me`, { headers: { Cookie: secondCookie } })).status, 401)
  assert.equal(sessions.records.has(hashSessionToken(token)), false)
})

test('unsafe cross-origin and missing-origin requests are rejected', async () => {
  const evil = await fetch(`${url}/api/auth/login`, {
    method: 'POST', headers: { Origin: 'https://not-allowed.example', 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: user.email, password }),
  })
  assert.equal(evil.status, 403)
  const noOrigin = await fetch(`${url}/api/auth/logout`, { method: 'POST' })
  assert.equal(noOrigin.status, 403)
  assert.equal(sessionCookieName('production'), '__Host-it-helpdesk-session')
})

test('authentication accepts an injected provider without depending on local password storage', async () => {
  let stored
  const providerUser = { id: 'fictional-provider-user', email: 'provider@demo.example', full_name: 'حساب خيالي', role: 'manager', is_active: true }
  const service = createAuthService({
    provider: { async authenticate() { return providerUser } },
    sessions: {
      async create(record) { stored = record },
      async findUserByTokenHash(hash) { return stored?.tokenHash === hash ? { ...providerUser, expires_at: stored.expiresAt } : null },
      async delete() { stored = null },
    },
  })
  const session = await service.login({})
  assert.equal(session.user.role, 'manager')
  assert.equal((await service.getUser(session.token)).id, providerUser.id)
  await service.logout(session.token)
  assert.equal(await service.getUser(session.token), null)
})

test('invalid session expiration fails closed and removes the session', async () => {
  let deleted = false
  const service = createAuthService({
    provider: {},
    sessions: {
      async findUserByTokenHash() { return { is_active: true, expires_at: 'invalid-date' } },
      async delete() { deleted = true },
    },
  })
  assert.equal(await service.getUser('a'.repeat(43)), null)
  assert.equal(deleted, true)
})

test('local passwords accept one character without composition rules and reject empty or oversized input',async()=>{
 for(const value of ['x','1',' ']){const encoded=await hashPassword(value);assert.match(encoded,/^\$argon2id\$/);assert.equal(await verifyPassword(encoded,value),true)}
 for(const value of ['',null,undefined,'x'.repeat(1025)])assert.throws(()=>hashPassword(value))
})
