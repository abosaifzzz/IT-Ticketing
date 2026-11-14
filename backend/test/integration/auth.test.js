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
import { createLocalAccountService } from '../../src/auth/localAccountService.js'
import { createLocalPasswordProvider } from '../../src/auth/localPasswordProvider.js'
import { createAuthService, hashSessionToken } from '../../src/auth/authService.js'
import { verifyPassword } from '../../src/auth/passwords.js'
import { createApp } from '../../src/app.js'

const origin = 'http://localhost:5173'
const password = `Fictional-test-only-${randomBytes(16).toString('hex')}`
const accounts = []
const servers = []
let pool, users, accountService, url

async function databaseConfig(file) {
  // Parse explicit files, never inherit DB_* variables from the development shell.
  const env = parse(await readFile(new URL(`../../${file}`, import.meta.url)))
  return { host: env.DB_HOST, port: Number(env.DB_PORT), database: env.DB_NAME, user: env.DB_USER, password: env.DB_PASSWORD }
}

async function startServer() {
  const provider = await createLocalPasswordProvider(users)
  const authService = createAuthService({ provider, sessions: createMySqlSessionRepository(pool) })
  const server = createApp({ authService, config: { appOrigin: origin, nodeEnv: 'test' } }).listen(0, '127.0.0.1')
  servers.push(server)
  await once(server, 'listening')
  return `http://127.0.0.1:${server.address().port}`
}

before(async () => {
  const dev = await databaseConfig('.env')
  const e = await testEnvironment()
  const config = { host: e.DB_HOST, port: Number(e.DB_PORT), database: e.DB_NAME, user: e.DB_USER, password: e.DB_PASSWORD }
  assert.match(config.database, /^hospital_it_helpdesk_test(?:_fresh_[a-f0-9]{12})?$/, 'Refusing writes outside designated test databases')
  assert.notEqual(config.database, dev.database, 'Development and test databases must differ')
  assert.equal(dev.database, 'hospital_it_helpdesk_dev')
  assert.equal(config.host, '127.0.0.1', 'Tests require a local database')
  assert.notEqual(config.user, 'root', 'Tests must use a restricted account')
  const development = createPool(dev)
  try {
    const [[identity]] = await development.query('SELECT DATABASE() AS db, VERSION() AS version')
    assert.equal(identity.db, dev.database)
    assert.match(identity.version, /^8\./)
    // Read-only development smoke check; never read credentials or modify its accounts.
    await development.query('SELECT 1 FROM users LIMIT 1')
    await development.query('SELECT 1 FROM auth_sessions LIMIT 1')
    // History is append-only for the runtime account; its current-read sequence
    // check must work with SELECT/INSERT and no UPDATE or DELETE privilege.
    await development.execute('SELECT sequence_number FROM ticket_history WHERE ticket_id = ? ORDER BY sequence_number DESC LIMIT 1 FOR SHARE', ['00000000-0000-0000-0000-000000000000'])
  } finally { await development.end() }
  pool = createPool(config)
  const [[identity]] = await pool.query('SELECT DATABASE() AS db, VERSION() AS version')
  assert.equal(identity.db, config.database)
  assert.match(identity.version, /^8\./)
  users = createMySqlUserRepository(pool)
  accountService = createLocalAccountService(users)
  for (const role of ['employee', 'technician', 'manager']) {
    const account = await accountService.create({ email: `integration-${randomUUID()}@demo.example`, fullName: 'حساب اختبار خيالي', role, password })
    accounts.push(account)
  }
  url = await startServer()
})

after(async () => {
  try {
    await Promise.all(servers.map((server) => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))))
  } finally {
    if (pool) {
      try {
        // Exact IDs owned by this run only; FK cascade removes their sessions.
        for (const account of accounts) {
          await pool.execute('DELETE FROM users WHERE id = ?', [account.id])
          const [[row]] = await pool.execute('SELECT COUNT(*) AS count FROM auth_sessions WHERE user_id = ?', [account.id])
          assert.equal(row.count, 0)
        }
      } finally { await pool.end() }
    }
  }
})

function login(account, suppliedPassword = password, extra = {}) {
  return fetch(`${url}/api/auth/login`, {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: account.email.toUpperCase(), password: suppliedPassword, ...extra }),
  })
}

function cookieOf(response) {
  assert.equal(response.status, 200)
  const cookie = response.headers.get('set-cookie')
  assert.match(cookie, /HttpOnly/i)
  assert.match(cookie, /SameSite=Strict/i)
  assert.match(cookie, /Path=\//i)
  assert.match(cookie, /Expires=/i)
  return cookie.split(';')[0]
}

function me(cookie, base = url) {
  return fetch(`${base}/api/auth/me`, { headers: cookie ? { Cookie: cookie } : {} })
}

test('local provisioning stores salted Argon2id hashes and no plaintext password', async () => {
  const hashes = new Set()
  for (const account of accounts) {
    const row = await users.findByEmail(account.email)
    assert.match(row.password_hash, /^\$argon2id\$v=19\$m=19456,t=2,p=1\$/)
    assert.equal(await verifyPassword(row.password_hash, password), true)
    assert.equal(await verifyPassword(row.password_hash, 'incorrect-fictional-password'), false)
    const [[stored]] = await pool.execute('SELECT * FROM users WHERE id = ?', [account.id])
    assert.equal(JSON.stringify(stored).includes(password), false)
    assert.equal(JSON.stringify(account).includes(password), false)
    assert.equal(stored.auth_provider, 'local')
    assert.equal(stored.is_active, 1)
    hashes.add(row.password_hash)
  }
  assert.equal(hashes.size, 3, 'Identical passwords must receive different salts')
  await assert.rejects(accountService.create({ ...accounts[0], password }), (error) => error.code === 'ER_DUP_ENTRY')
  await assert.rejects(accountService.create({ email: 'invalid', fullName: 'Fictional', role: 'employee', password }))
  await assert.rejects(accountService.create({ email: 'invalid-role@demo.example', fullName: 'Fictional', role: 'admin', password }))
  await assert.rejects(accountService.create({ email: 'empty-password@demo.example', fullName: 'Fictional', role: 'employee', password: '' }))
})

test('HTTP login returns server-owned identity for all roles; only token hashes reach MySQL', async () => {
  for (const account of accounts) {
    const response = await login(account, password, { role: 'admin', id: 'forged', is_active: true })
    const cookie = cookieOf(response)
    const token = cookie.split('=')[1]
    const body = await response.json()
    assert.deepEqual(Object.keys(body), ['user'])
    assert.deepEqual(Object.keys(body.user).sort(), ['id', 'name', 'role', 'roleLabel', 'username'])
    assert.equal(body.user.id, account.id)
    assert.equal(body.user.role, account.role)
    assert.equal(body.user.name, account.fullName)
    assert.equal(body.user.username, account.email)
    assert.equal(typeof body.user.roleLabel, 'string')
    assert.equal(JSON.stringify(body).includes(token), false)
    assert.equal(JSON.stringify(body).includes(password), false)
    assert.match(response.headers.get('cache-control'), /no-store/)
    const [[stored]] = await pool.execute('SELECT * FROM auth_sessions WHERE token_hash = ?', [hashSessionToken(token)])
    assert.equal(stored.user_id, account.id)
    assert.match(stored.token_hash, /^[a-f0-9]{64}$/)
    assert.equal(JSON.stringify(stored).includes(token), false)
    const ttl = stored.expires_at.getTime() - stored.created_at.getTime()
    assert.ok(Math.abs(ttl - 12 * 60 * 60 * 1000) < 5000)
    const restored = await me(cookie)
    assert.equal(restored.status, 200)
    assert.deepEqual(await restored.json(), body)
  }
})

test('sessions survive a fresh app/provider instance; logout deletes and invalidates them', async () => {
  const cookie = cookieOf(await login(accounts[0]))
  const newUrl = await startServer()
  assert.equal((await me(cookie, newUrl)).status, 200)
  const response = await fetch(`${newUrl}/api/auth/logout`, { method: 'POST', headers: { Origin: origin, Cookie: cookie } })
  assert.equal(response.status, 204)
  assert.match(response.headers.get('set-cookie'), /Expires=Thu, 01 Jan 1970/i)
  const [rows] = await pool.execute('SELECT token_hash FROM auth_sessions WHERE token_hash = ?', [hashSessionToken(cookie.split('=')[1])])
  assert.equal(rows.length, 0)
  assert.equal((await me(cookie)).status, 401)
  assert.equal((await me(cookie, newUrl)).status, 401)
})

test('expired sessions are rejected and removed from the live database', async () => {
  const cookie = cookieOf(await login(accounts[0]))
  const hash = hashSessionToken(cookie.split('=')[1])
  await pool.execute('UPDATE auth_sessions SET expires_at = ? WHERE token_hash = ?', [new Date(Date.now() - 1000), hash])
  assert.equal((await me(cookie)).status, 401)
  const [rows] = await pool.execute('SELECT token_hash FROM auth_sessions WHERE token_hash = ?', [hash])
  assert.equal(rows.length, 0)
})

test('deactivated accounts cannot log in or restore an existing session', async () => {
  const account = accounts[1]
  const cookie = cookieOf(await login(account))
  await pool.execute('UPDATE users SET is_active = FALSE WHERE id = ?', [account.id])
  try {
    assert.equal((await login(account)).status, 401)
    assert.equal((await me(cookie)).status, 401)
    const [rows] = await pool.execute('SELECT token_hash FROM auth_sessions WHERE token_hash = ?', [hashSessionToken(cookie.split('=')[1])])
    assert.equal(rows.length, 0)
  } finally { await pool.execute('UPDATE users SET is_active = TRUE WHERE id = ?', [account.id]) }
})

test('incorrect/unknown credentials, external identities and missing or forged cookies fail', async () => {
  // Fresh rate limiter prevents test order from affecting credential assertions.
  const oldUrl = url
  url = await startServer()
  try {
    assert.equal((await login(accounts[0], 'wrong-fictional-password')).status, 401)
    assert.equal((await login({ email: `${randomUUID()}@demo.example` })).status, 401)
    await pool.execute("UPDATE users SET auth_provider = 'external' WHERE id = ?", [accounts[2].id])
    try { assert.equal((await login(accounts[2])).status, 401) }
    finally { await pool.execute("UPDATE users SET auth_provider = 'local' WHERE id = ?", [accounts[2].id]) }
    for (const cookie of [undefined, 'it-helpdesk-session=bad', `it-helpdesk-session=${randomBytes(32).toString('base64url')}`]) {
      assert.equal((await me(cookie)).status, 401)
    }
  } finally { url = oldUrl }
})

test('a short chosen password can be provisioned and used for real HTTP login',async()=>{
 const shortAccount=await accountService.create({email:'short-'+randomUUID()+'@demo.example',fullName:'Fictional short password',role:'employee',password:'x'});accounts.push(shortAccount)
 const response=await login(shortAccount,'x');assert.equal(response.status,200)
 const stored=await users.findByEmail(shortAccount.email);assert.match(stored.password_hash,/^\$argon2id\$/);assert.notEqual(stored.password_hash,'x')
 await accountService.replacePassword(shortAccount.email,'z');assert.equal((await login(shortAccount,'z')).status,200);assert.equal((await login(shortAccount,'x')).status,401)
})
