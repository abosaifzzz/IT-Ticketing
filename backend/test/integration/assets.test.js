import { testEnvironment } from '../support/database.js'
import assert from 'node:assert/strict'
import { before, after, test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { randomUUID, randomBytes } from 'node:crypto'
import { once } from 'node:events'
import { parse } from 'dotenv'
import { unzipSync, strFromU8 } from 'fflate'
import { createPool } from '../../src/db/pool.js'
import { createMySqlUserRepository } from '../../src/repositories/mysqlUserRepository.js'
import { createMySqlSessionRepository } from '../../src/repositories/mysqlSessionRepository.js'
import { createMySqlReferenceRepository } from '../../src/repositories/mysqlReferenceRepository.js'
import { createMySqlTicketRepository } from '../../src/repositories/mysqlTicketRepository.js'
import { createMySqlTicketWorkflowRepository } from '../../src/repositories/mysqlTicketWorkflowRepository.js'
import { createMySqlAssetRepository } from '../../src/repositories/mysqlAssetRepository.js'
import { createLocalAccountService } from '../../src/auth/localAccountService.js'
import { createLocalPasswordProvider } from '../../src/auth/localPasswordProvider.js'
import { createAuthService } from '../../src/auth/authService.js'
import { createApp } from '../../src/app.js'

const suffix = randomUUID(), prefix = `TEST-${suffix.replaceAll('-', '').slice(0, 20)}`
const password = `Fictional-${randomBytes(16).toString('hex')}`, origin = 'http://localhost:5173'
const accounts = {}, cookies = {}
let pool, server, url, department, category, serial = 0

before(async () => {
  const e = await testEnvironment()
  const dev = parse(await readFile(new URL('../../.env', import.meta.url)))
  assert.match(e.DB_NAME, /^hospital_it_helpdesk_test(?:_fresh_[a-f0-9]{12})?$/)
  assert.notEqual(e.DB_NAME, dev.DB_NAME)
  assert.equal(e.DB_HOST, '127.0.0.1')
  assert.notEqual(e.DB_USER, 'root')
  pool = createPool({ host: e.DB_HOST, port: Number(e.DB_PORT), database: e.DB_NAME, user: e.DB_USER, password: e.DB_PASSWORD })
  try {
    await pool.query('SELECT asset_id FROM assets LIMIT 0')
    await pool.query('SELECT asset_id FROM asset_history LIMIT 0')
    await pool.query('SELECT asset_id FROM asset_withdrawals LIMIT 0')
    await pool.query('SELECT related_asset_id FROM tickets LIMIT 0')
  } catch (error) {
    throw new Error(`Asset integration tests require migration 005 and its table grants; migrations may be applied in your scheduled batch. Database code: ${error.code}`)
  }
  const users = createMySqlUserRepository(pool), provision = createLocalAccountService(users)
  for (const [key, role] of [['employee', 'employee'], ['engineerA', 'technician'], ['engineerB', 'technician'], ['manager', 'manager']]) {
    accounts[key] = await provision.create({ email: `asset-${key}-${suffix}@demo.example`, fullName: `حساب خيالي ${key}`, role, password })
  }
  department = await createMySqlReferenceRepository(pool, 'departments').save({ name: `قسم أصول خيالي ${suffix}`, isActive: true })
  category = await createMySqlReferenceRepository(pool, 'categories').save({ name: `نوع خيالي ${suffix}`, isActive: true })
  const authService = createAuthService({ provider: await createLocalPasswordProvider(users), sessions: createMySqlSessionRepository(pool) })
  server = createApp({ authService, assetRepository: createMySqlAssetRepository(pool), ticketRepository: createMySqlTicketRepository(pool),
    ticketWorkflowRepository: createMySqlTicketWorkflowRepository(pool), config: { nodeEnv: 'test', appOrigin: origin } }).listen(0, '127.0.0.1')
  await once(server, 'listening')
  url = `http://127.0.0.1:${server.address().port}`
  for (const key of Object.keys(accounts)) {
    const response = await fetch(`${url}/api/auth/login`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: accounts[key].email, password }) })
    assert.equal(response.status, 200)
    cookies[key] = response.headers.get('set-cookie').split(';')[0]
  }
})

after(async () => {
  try { if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())) }
  finally {
    if (pool) {
      try {
        for (const account of Object.values(accounts)) await pool.execute('DELETE FROM asset_withdrawals WHERE engineer_id = ?', [account.id])
        for (const account of Object.values(accounts)) await pool.execute('DELETE FROM tickets WHERE created_by_account_id = ?', [account.id])
        const assetIds = new Set()
        for (const account of Object.values(accounts)) {
          const [rows] = await pool.execute('SELECT DISTINCT asset_id FROM asset_history WHERE actor_account_id = ?', [account.id])
          for (const row of rows) assetIds.add(row.asset_id)
        }
        for (const id of assetIds) await pool.execute('DELETE FROM assets WHERE asset_id = ?', [id])
        if (department) await pool.execute('DELETE FROM departments WHERE id = ?', [department.id])
        if (category) await pool.execute('DELETE FROM fault_categories WHERE id = ?', [category.id])
        for (const account of Object.values(accounts)) await pool.execute('DELETE FROM users WHERE id = ?', [account.id])
      } finally { await pool.end() }
    }
  }
})

async function request(path, { role = 'engineerA', body, method = body === undefined ? 'GET' : 'POST', originHeader = origin } = {}) {
  const response = await fetch(`${url}/api${path}`, { method,
    headers: { ...(cookies[role] ? { Cookie: cookies[role] } : {}), ...(originHeader ? { Origin: originHeader } : {}), 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  if (response.headers.get('content-type')?.includes('spreadsheetml')) return { status: response.status, bytes: Buffer.from(await response.arrayBuffer()) }
  return { status: response.status, data: await response.json() }
}

function assetBody(extra = {}) {
  return { assetId: `${prefix}-${++serial}`, name: `شاشة خيالية ${suffix}`, quantity: 1, manufacturer: 'Fictional', model: 'DEMO',
    serialNumber: 'FICTIONAL-SERIAL', holdingType: 'it_storage', location: 'رف خيالي', operationalStatus: 'working',
    conditionDescription: 'وصف حالة خيالي', maintenanceNotes: 'ملاحظة خيالية', ...extra }
}

async function createAsset(extra = {}, role = 'engineerA') {
  const response = await request('/assets', { role, body: assetBody(extra) })
  assert.equal(response.status, 201)
  return response.data.item
}

async function ticket(engineer = 'engineerA', assigned = true) {
  const response = await request('/tickets', { role: 'manager', body: { reporterName: 'موظف خيالي', departmentId: department.id, categoryId: category.id,
    title: 'بلاغ أصول خيالي', description: 'تفاصيل خيالية', ...(assigned ? { assignedTechnicianId: accounts[engineer].id } : {}) } })
  assert.equal(response.status, 201)
  return response.data.item
}

async function withdraw(asset, target, role = 'engineerA') {
  return request(`/assets/${asset.assetId}/withdraw`, { role, body: { ticketId: target.id } })
}

test('inventory endpoints require IT roles and archive is shared by both IT roles', async () => {
  const asset = await createAsset()
  for (const path of ['/assets', `/assets/${asset.assetId}`, '/assets/export.xlsx']) {
    assert.equal((await request(path, { role: 'employee' })).status, 403)
    assert.equal((await request(path, { role: 'anonymous' })).status, 401)
  }
  assert.equal((await request('/assets', { role: 'employee', body: assetBody() })).status, 403)
  assert.equal((await request(`/assets/${asset.assetId}`, { role: 'employee', method: 'PATCH', body: { name: 'مرفوض', expectedVersion: 0 } })).status, 403)
  assert.equal((await request(`/assets/${asset.assetId}/archive`, { body: { expectedVersion: asset.version } })).status, 200)
  assert.equal((await request(`/assets/${asset.assetId}/withdraw`, { role: 'manager', body: { ticketId: randomUUID() } })).status, 404)
})

test('create/edit enforce quantities, field allowlists, immutable IDs and complete audit snapshots', async () => {
  let asset = await createAsset({ quantity: 4, holdingType: 'department', departmentId: department.id, purchaseDate: '2028-02-29' })
  assert.equal(asset.department, department.name)
  assert.equal(asset.history[0].actorAccountId, accounts.engineerA.id)
  assert.equal(asset.purchaseDate, '2028-02-29')
  const edit = await request(`/assets/${asset.assetId}`, { role: 'engineerB', method: 'PATCH', body: { quantity: 2, maintenanceNotes: 'ملاحظة معدلة', expectedVersion: asset.version } })
  assert.equal(edit.status, 200)
  asset = edit.data.item
  assert.equal(asset.quantity, 2)
  assert.equal(asset.history.at(-1).actorAccountId, accounts.engineerB.id)
  assert.equal(asset.history.at(-1).data.before.quantity, 4)
  assert.equal(asset.history.at(-1).data.after.quantity, 2)
  assert.equal((await request(`/assets/${asset.assetId}`, { method: 'PATCH', body: { quantity: 1, expectedVersion: 0 } })).status, 409)
  assert.equal((await request(`/assets/${asset.assetId}`, { method: 'PATCH', body: { assetId: 'CHANGED', expectedVersion: asset.version } })).status, 400)
  assert.equal((await request('/assets', { body: assetBody({ assetId: asset.assetId }) })).status, 409)
  for (const extra of [{ quantity: 0 }, { quantity: -1 }, { quantity: 1.5 }, { quantity: '2' }, { category: 'forbidden' },
    { conditionRating: 5 }, { rating: 5 }, { operationalStatus: 'withdrawn' }, { purchaseDate: '2026-02-29' },
    { holdingType: 'department', departmentId: randomUUID() }]) {
    assert.equal((await request('/assets', { body: assetBody(extra) })).status, 400)
  }
})

test('search/filter/list, manager archive and export share active inventory semantics', async () => {
  const token = `EXPORT-${randomUUID().slice(0, 8)}`
  const active = await createAsset({ name: `شاشة ${token}`, quantity: 3, model: '=HYPERLINK("https://fictional.example")', holdingType: 'department', departmentId: department.id })
  const archived = await createAsset({ name: `شاشة ${token}` })
  const archive = await request(`/assets/${archived.assetId}/archive`, { role: 'manager', body: { expectedVersion: archived.version } })
  assert.equal(archive.status, 200)
  assert.ok(archive.data.item.archivedAt)
  assert.equal(archive.data.item.history.at(-1).type, 'archived')
  const list = await request(`/assets?search=${token}&departmentId=${department.id}&operationalStatus=working`)
  assert.deepEqual(list.data.items.map((row) => row.assetId), [active.assetId])
  assert.equal((await request(`/assets?search=${token}&includeArchived=true`)).data.total, 2)
  assert.equal((await request(`/assets?search=${encodeURIComponent('شاشة ' + token)}`)).data.total, 1)
  assert.equal((await request(`/assets/${archived.assetId}`)).data.item.history.length, 2)
  assert.equal((await request(`/assets/${archived.assetId}`, { method: 'PATCH', body: { quantity: 5, expectedVersion: archive.data.item.version } })).status, 409)
  const exported = await request(`/assets/export.xlsx?search=${token}`)
  assert.equal(exported.status, 200)
  const parts = unzipSync(exported.bytes), sheet = strFromU8(parts['xl/worksheets/sheet1.xml'])
  assert.match(sheet, /rightToLeft="1"/)
  assert.ok(sheet.includes(active.assetId))
  assert.equal(sheet.includes(archived.assetId), false)
  assert.match(sheet, /<c r="C2" s="0"><v>3<\/v>/)
  assert.doesNotMatch(sheet, /<f[ >]/)
  assert.equal((await request('/assets/export.xlsx?includeArchived=true')).status, 400)
})

test('a single-unit withdrawal transitions in place, links the ticket and hides its internal event from employees', async () => {
  const asset = await createAsset()
  const created = await request('/tickets', { role: 'employee', body: { reporterName: 'موظف خيالي', departmentId: department.id, categoryId: category.id, title: 'عطل خيالي', description: 'تفاصيل خيالية' } })
  assert.equal(created.status, 201)
  let target = created.data.item
  const assigned = await request(`/tickets/${target.id}/assignment`, { role: 'manager', body: { technicianId: accounts.engineerA.id, expectedVersion: target.version } })
  assert.equal(assigned.status, 200)
  target = assigned.data.item
  await pool.execute('UPDATE users SET is_available = FALSE WHERE id = ?', [accounts.engineerA.id])
  let result
  try { result = await withdraw(asset, target) }
  finally { await pool.execute('UPDATE users SET is_available = TRUE WHERE id = ?', [accounts.engineerA.id]) }
  assert.equal(result.status, 200)
  const unit = result.data.asset
  assert.equal(unit.assetId, asset.assetId)
  assert.equal(unit.quantity, 1)
  assert.equal(unit.operationalStatus, 'withdrawn')
  assert.equal(unit.takenByEngineerId, accounts.engineerA.id)
  assert.equal(unit.takenByEngineerName, accounts.engineerA.fullName)
  assert.equal(unit.withdrawnForTicketId, target.id)
  assert.ok(unit.withdrawnAt)
  assert.equal(result.data.ticket.relatedAssetId, asset.assetId)
  assert.equal(result.data.ticket.history.at(-1).visibility, 'internal')
  const employee = await request(`/tickets/${target.id}`, { role: 'employee' })
  assert.equal(employee.data.item.history.some((event) => event.type === 'asset_withdrawal'), false)
  assert.equal((await withdraw(asset, target)).status, 409)
  for (const body of [{ quantity: 2 }, { operationalStatus: 'working' }]) {
    assert.equal((await request(`/assets/${unit.assetId}`, { method: 'PATCH', body: { ...body, expectedVersion: unit.version } })).status, 409)
  }
})

test('batch withdrawal decrements one unit and creates a separate immutable withdrawn record with linked audits', async () => {
  const source = await createAsset({ quantity: 3 })
  const target = await ticket()
  const response = await withdraw(source, target)
  assert.equal(response.status, 200)
  const { asset, remainingSource } = response.data
  assert.notEqual(asset.assetId, source.assetId)
  assert.equal(asset.quantity, 1)
  assert.equal(asset.operationalStatus, 'withdrawn')
  assert.equal(asset.serialNumber, '')
  assert.equal(asset.sourceAssetId, source.assetId)
  assert.equal(remainingSource.quantity, 2)
  assert.equal(remainingSource.operationalStatus, 'working')
  assert.equal(remainingSource.history.at(-1).data.before.quantity, 3)
  assert.equal(remainingSource.history.at(-1).data.after.quantity, 2)
  assert.equal(asset.history[0].data.ticketId, target.id)
  assert.equal((await request(`/assets/${source.assetId}`, { method: 'PATCH', body: { quantity: 3, expectedVersion: source.version } })).status, 409)
})

test('withdrawal allows shared IT access and requires an assigned active ticket, working non-archived stock and trusted identity', async () => {
  const asset = await createAsset()
  const other = await ticket('engineerB')
  assert.equal((await withdraw(asset, other)).status, 200)
  assert.equal((await withdraw(asset, await ticket('engineerA', false))).status, 409)
  const resolved = await ticket()
  assert.equal((await request(`/tickets/${resolved.id}/status`, { body: { status: 'resolved', solutionDescription: 'حل خيالي' } })).status, 200)
  assert.equal((await withdraw(asset, resolved)).status, 409)
  for (const operationalStatus of ['needs_maintenance', 'under_repair', 'out_of_service', 'retired']) {
    const stock = await createAsset({ operationalStatus })
    assert.equal((await withdraw(stock, await ticket())).status, 409)
  }
  const archived = await createAsset()
  await request(`/assets/${archived.assetId}/archive`, { role: 'manager', body: { expectedVersion: 0 } })
  assert.equal((await withdraw(archived, await ticket())).status, 409)
  assert.equal((await request(`/assets/${asset.assetId}/withdraw`, { body: { ticketId: (await ticket()).id, engineerId: accounts.engineerB.id } })).status, 400)
  const unchanged = (await request(`/assets/${asset.assetId}`)).data.item
  assert.equal(unchanged.quantity, 1)
  assert.equal(unchanged.history.length, 2)
})

test('concurrent withdrawals for the same ticket, even from different assets, commit exactly once', async () => {
  const a = await createAsset({ quantity: 2 }), b = await createAsset({ quantity: 2 }), target = await ticket()
  const replies = await Promise.all([withdraw(a, target), withdraw(b, target), withdraw(a, target)])
  assert.deepEqual(replies.map((reply) => reply.status).sort(), [200, 409, 409])
  const [[count]] = await pool.execute('SELECT COUNT(*) AS total FROM asset_withdrawals WHERE ticket_id = ?', [target.id])
  assert.equal(count.total, 1)
  const [[events]] = await pool.execute("SELECT COUNT(*) AS total FROM ticket_history WHERE ticket_id = ? AND type = 'asset_withdrawal'", [target.id])
  assert.equal(events.total, 1)
  const remainingA = (await request(`/assets/${a.assetId}`)).data.item
  const remainingB = (await request(`/assets/${b.assetId}`)).data.item
  assert.equal(remainingA.quantity + remainingB.quantity, 3)
})

test('concurrent tickets cannot overdraw stock: only available units move and quantities stay positive', async () => {
  const source = await createAsset({ quantity: 3 })
  const tickets = await Promise.all(Array.from({ length: 7 }, () => ticket()))
  const replies = await Promise.all(tickets.map((target) => withdraw(source, target)))
  assert.equal(replies.filter((reply) => reply.status === 200).length, 3)
  assert.equal(replies.filter((reply) => reply.status === 409).length, 4)
  const [units] = await pool.execute('SELECT a.quantity, a.operational_status FROM assets a JOIN asset_withdrawals w ON a.asset_id = w.asset_id WHERE w.source_asset_id = ?', [source.assetId])
  assert.equal(units.length, 3)
  assert.equal(units.reduce((sum, row) => sum + row.quantity, 0), 3)
  assert.equal(units.every((row) => row.quantity === 1 && row.operational_status === 'withdrawn'), true)
  const current = (await request(`/assets/${source.assetId}`)).data.item
  assert.equal(current.quantity, 1)
  assert.equal(current.operationalStatus, 'withdrawn')
  assert.equal(current.history.filter((event) => event.type === 'withdrawn').length, 3)
})

test('shared IT withdrawal versus reassignment preserves ticket activity and version checks', async () => {
  const source = await createAsset(), target = await ticket()
  const replies = await Promise.all([
    withdraw(source, target),
    request(`/tickets/${target.id}/assignment`, { role: 'manager', body: { technicianId: accounts.engineerB.id, expectedVersion: target.version } }),
  ])
  assert.equal(replies[0].status, 200)
  assert.ok([200, 409].includes(replies[1].status))
  const current = (await request(`/assets/${source.assetId}`)).data.item
  assert.equal(current.operationalStatus, replies[0].status === 200 ? 'withdrawn' : 'working')
})

test('manager withdrawal records the actual manager in asset and ticket history',async()=>{
 const asset=await createAsset(),target=await ticket('engineerB')
 const response=await withdraw(asset,target,'manager')
 assert.equal(response.status,200)
 const [[event]]=await pool.execute("SELECT actor_account_id,actor_role FROM ticket_history WHERE ticket_id=? AND type='asset_withdrawal'",[target.id])
 assert.equal(event.actor_account_id,accounts.manager.id);assert.equal(event.actor_role,'manager')
 const saved=(await request('/assets/'+asset.assetId,{role:'manager'})).data.item
 assert.equal(saved.history.at(-1).actorAccountId,accounts.manager.id)
 assert.equal(saved.history.at(-1).actorRole,'manager')
})
