import assert from 'node:assert/strict'
import { before, after, test } from 'node:test'
import { once } from 'node:events'
import { createApp } from '../src/app.js'
import { notificationFilters, revision } from '../src/notifications/validation.js'
import { notificationCopy } from '../src/notifications/service.js'
import { openStream } from './support/sse.js'

let server, app, url
const users = new Map([['fictional-token-A', { id: 'account-A', role: 'employee' }], ['fictional-token-B', { id: 'account-B', role: 'manager' }]])
const snapshots = new Map([['account-A', { revision: '0', unreadCount: 0 }], ['account-B', { revision: '41', unreadCount: 9 }]])
const cookie = (key) => ({ Cookie: `it-helpdesk-session=fictional-token-${key}` })
const failing = new Set()

before(async () => {
  const repository = {
    async state(accountId) { if (failing.has(accountId)) throw new Error('Temporary failure'); return { ...snapshots.get(accountId) } },
    async history(accountId) { return { items: [{ id: `${accountId}-only` }], ...snapshots.get(accountId) } },
    async markRead(accountId) { return { ...snapshots.get(accountId) } },
  }
  app = createApp({ authService: { async getUser(token) { return users.get(token) ?? null } }, notificationRepository: repository,
    notificationStreamOptions: { intervalMs: 20, heartbeatMs: 50 }, config: { appOrigin: 'http://localhost:5173', nodeEnv: 'test' } })
  server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  url = `http://127.0.0.1:${server.address().port}/api/notifications`
})

after(async () => {
  app.locals.closeNotificationStreams()
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
})

test('notification validation accepts exact durable cursors and rejects account selectors', () => {
  assert.equal(revision('18446744073709551615'), '18446744073709551615')
  for (const value of ['-1', '1.5', '01', '18446744073709551616', ['1']]) assert.throws(() => revision(value))
  for (const query of [{ recipientId: 'other' }, { accountId: 'other' }, { limit: '101' }, { unreadOnly: 'yes' }]) assert.throws(() => notificationFilters(query))
  assert.deepEqual(notificationFilters({}), { before: null, limit: 50, unreadOnly: false })
  const ticket = { id: 'fictional-ticket', title: 'بلاغ خيالي', internalNote: 'PRIVATE' }
  for (const type of ['new_ticket', 'ticket_assignment', 'ticket_resolved', 'ticket_reopened']) assert.equal(JSON.stringify(notificationCopy(type, ticket)).includes('PRIVATE'), false)
  assert.throws(() => notificationCopy('ticket_feedback', ticket))
})

test('history and polling derive the account from authentication, including managers', async () => {
  assert.equal((await fetch(url)).status, 401)
  for (const key of ['A', 'B']) {
    const response = await fetch(url, { headers: cookie(key) })
    assert.equal((await response.json()).items[0].id, `account-${key}-only`)
  }
  assert.equal((await fetch(`${url}?recipientId=account-B`, { headers: cookie('A') })).status, 400)
  assert.equal((await fetch(`${url}/state?since=0`, { headers: cookie('A') }).then((response) => response.json())).changed, false)
  assert.equal((await fetch(`${url}/stream?token=fictional-token-A`, { headers: cookie('A') })).status, 400)
  assert.equal((await fetch(`${url}/stream`, { headers: { ...cookie('A'), 'Last-Event-ID': '-1' } })).status, 400)
})

test('SSE delivery and reconnect refresh only the authenticated account revision', async () => {
  const stream = await openStream(`${url}/stream`, cookie('A'))
  try {
    const ready = await stream.next('ready')
    assert.equal(ready.id, '0')
    assert.equal(ready.data.unreadCount, 0)
    snapshots.set('account-A', { revision: '2', unreadCount: 1 })
    const refresh = await stream.next('refresh')
    assert.equal(refresh.id, '2')
    assert.equal(refresh.data.unreadCount, 1)
    assert.equal(JSON.stringify(refresh).includes('account-B'), false)
  } finally { await stream.close() }
  snapshots.set('account-A', { revision: '4', unreadCount: 3 })
  const reconnected = await openStream(`${url}/stream`, { ...cookie('A'), 'Last-Event-ID': '2' })
  try {
    const ready = await reconnected.next('ready')
    assert.equal(ready.id, '4')
    assert.equal(ready.data.changed, true)
    assert.equal(ready.data.refreshRequired, true)
    assert.equal(ready.data.unreadCount, 3)
  } finally { await reconnected.close() }
})

test('a live SSE connection loses authorization when its session is revoked', async () => {
  const stream = await openStream(`${url}/stream`, cookie('A'))
  try {
    await stream.next('ready')
    users.delete('fictional-token-A')
    assert.equal((await stream.next('session-ended')).data.reauthenticate, true)
  } finally {
    users.set('fictional-token-A', { id: 'account-A', role: 'employee' })
    await stream.close()
  }
})

test('SSE connection limits are per account and temporary delivery failures direct clients to refresh', async () => {
  const streams = []
  try {
    for (let i = 0; i < 3; i++) { const stream = await openStream(`${url}/stream`, cookie('B')); streams.push(stream); await stream.next('ready') }
    assert.equal((await fetch(`${url}/stream`, { headers: cookie('B') })).status, 429)
    const a = await openStream(`${url}/stream`, cookie('A'))
    streams.push(a)
    assert.ok(await a.next('ready'))
    failing.add('account-A')
    await a.next('refresh-error')
    failing.clear()
    assert.equal((await fetch(`${url}/state`, { headers: cookie('A') })).status, 200)
  } finally { failing.clear(); await Promise.all(streams.map((stream) => stream.close())) }
})
