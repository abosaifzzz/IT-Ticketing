import assert from 'node:assert/strict'
import { test } from 'node:test'
import { once } from 'node:events'
import { createApp } from '../src/app.js'
import { migrate } from '../src/db/migrations.js'
import { itUserInput } from '../src/management/validation.js'

const origin = 'http://localhost:5173'
async function withServer(options, run) {
  const server = createApp({ config: { nodeEnv: 'test', appOrigin: origin }, ...options }).listen(0, '127.0.0.1')
  await once(server, 'listening')
  try { await run(`http://127.0.0.1:${server.address().port}`) }
  finally { await new Promise((resolve) => server.close(resolve)) }
}

test('login limits failed account attempts, ignores forwarded IP spoofing and accepts username aliases', async () => {
  let calls = 0
  await withServer({ authService: { async login() { calls++; return null } } }, async (url) => {
    for (let i = 0; i < 11; i++) {
      const response = await fetch(`${url}/api/auth/login`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', 'X-Forwarded-For': `192.0.2.${i}` }, body: JSON.stringify({ username: 'fictional.user', password: 'Fictional-password-only' }) })
      assert.equal(response.status, i < 10 ? 401 : 429)
      if (i === 10) assert.ok(response.headers.get('retry-after'))
    }
    assert.equal(calls, 10)
  })
})

test('all unsafe requests require the exact configured Origin; malformed bodies and dual identifiers fail safely', async () => {
  await withServer({ authService: { async logout() {}, async login() { throw new Error('Should not authenticate invalid request') } } }, async (url) => {
    for (const badOrigin of [undefined, 'null', 'https://untrusted.example', `${origin}.evil.example`]) {
      const response = await fetch(`${url}/api/auth/logout`, { method: 'POST', headers: badOrigin ? { Origin: badOrigin } : {} })
      assert.equal(response.status, 403)
    }
    const headers = { Origin: origin, 'Content-Type': 'application/json' }
    assert.equal((await fetch(`${url}/api/auth/logout`, { method: 'POST', headers })).status, 204)
    assert.equal((await fetch(`${url}/api/auth/login`, { method: 'POST', headers, body: '{' })).status, 400)
    assert.equal((await fetch(`${url}/api/auth/login`, { method: 'POST', headers, body: JSON.stringify({ email: 'x@demo.example', username: 'fictional.user', password: 'Fictional-password' }) })).status, 400)
    const preflight = await fetch(`${url}/api/auth/logout`, { method: 'OPTIONS', headers: { Origin: origin } })
    assert.equal(preflight.status, 204); assert.equal(preflight.headers.get('access-control-allow-origin'), origin)
  })
})

test('database conflicts are sanitized and lock failures become retryable HTTP conflicts', async () => {
  let code = 'ER_LOCK_DEADLOCK'
  await withServer({ authService: { async getUser() { return { id: 'fictional', role: 'manager' } } }, reportRepository: { async dashboard() { throw Object.assign(new Error('sensitive SQL values'), { code, sql: 'sensitive SQL values' }) } } }, async (url) => {
    for (const value of ['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT', 'ER_DUP_ENTRY', 'ER_NO_REFERENCED_ROW_2']) {
      code = value
      const response = await fetch(`${url}/api/reports`)
      assert.equal(response.status, 409); assert.equal((await response.text()).includes('sensitive'), false)
    }
  })
})

test('migrations reject incompatible engines before DDL and always release their lock after a failure', async () => {
  const calls = []
  const incompatible = { async query(sql) { calls.push(sql); return [[{ version: '10.4.32-MariaDB', row_format: 'dynamic', page_size: 16384, db: 'fictional' }]] } }
  await assert.rejects(migrate(incompatible), /Unsupported/)
  assert.equal(calls.length, 1)
  let released = false
  const failing = {
    async query(sql) { if (sql.startsWith('SELECT VERSION')) return [[{ version: '8.0.46', row_format: 'dynamic', page_size: 16384, db: 'fictional' }]]; throw new Error('Fictional DDL failure') },
    async execute(sql) { if (sql.includes('RELEASE_LOCK')) released = true; return [[{ acquired: 1 }]] },
  }
  await assert.rejects(migrate(failing), /Fictional DDL failure/); assert.equal(released, true)
})

test('IT usernames accept local identifiers while credential and cancelled fields remain forbidden', () => {
  assert.equal(itUserInput({ username: 'Example.Demo', fullName: 'Fictional Engineer', role: 'technician' }).email, 'example.demo')
  for (const body of [{ username: 'a b' }, { username: 'x', email: 'x@demo.example' }, { password: 'forbidden' }, { phone: 'forbidden' }]) assert.throws(() => itUserInput(body, true))
})
