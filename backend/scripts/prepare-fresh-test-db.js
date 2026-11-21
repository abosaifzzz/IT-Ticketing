import {appendOnlyTables} from '../src/assetManagement/tables.js'
import assert from 'node:assert/strict'
import { readFile, writeFile, access,readdir } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import mysql from 'mysql2/promise'
import { parse } from 'dotenv'
import { migrate } from '../src/db/migrations.js'

const password = process.env.HELPDESK_FRESH_ADMIN_PASSWORD
delete process.env.HELPDESK_FRESH_ADMIN_PASSWORD
let admin
try {
  if (password === undefined) throw new Error('Use the private PowerShell preparation script')
  for (const name of ['.env.fresh.test', '.env.fresh.runtime']) {
    try { await access(new URL(`../${name}`, import.meta.url)); throw new Error('Fresh configuration already exists; refusing to overwrite it') } catch (error) { if (error.code !== 'ENOENT') throw error }
  }
  const base = parse(await readFile(new URL('../.env.test', import.meta.url)))
  assert.equal(base.DB_HOST, '127.0.0.1')
  admin = await mysql.createConnection({ host: base.DB_HOST, port: Number(base.DB_PORT), user: 'root', password, timezone: 'Z' })
  const [[server]] = await admin.query('SELECT VERSION() version, @@port port, @@innodb_default_row_format row_format, @@innodb_page_size page_size')
  const [databases] = await admin.query('SHOW DATABASES')
  console.log('Server:', JSON.stringify(server)); console.log('Existing databases:', databases.map((row) => row.Database).join(', '))
  if (!/^8\.(0|4)\./.test(server.version) || server.row_format !== 'dynamic' || server.page_size !== 16384) throw new Error('Incompatible database; nothing created')
  const suffix = randomBytes(6).toString('hex'), database = `hospital_it_helpdesk_test_fresh_${suffix}`
  const user = `helpdesk_audit_${suffix}`, runtime = `helpdesk_run_${suffix}`, secret = randomBytes(32).toString('hex'), runtimeSecret = randomBytes(32).toString('hex')
  // Random identifiers contain hex only; CREATE without IF NOT EXISTS prevents reuse.
  await admin.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`)
  await admin.query(`USE \`${database}\``)
  const [[empty]] = await admin.query('SELECT COUNT(*) n FROM information_schema.tables WHERE table_schema = DATABASE()')
  assert.equal(empty.n, 0)
  const first = await migrate(admin)
  assert.equal(first.length, (await readdir(new URL('../db/migrations/',import.meta.url))).filter(n=>n.endsWith('.sql')).length)
  assert.deepEqual(await migrate(admin), [])
  const [tables] = await admin.query('SELECT TABLE_NAME, ENGINE, TABLE_COLLATION FROM information_schema.tables WHERE table_schema = DATABASE()')
  const expectedTables=new Set(['schema_migrations'])
  for(const name of (await readdir(new URL('../db/migrations/',import.meta.url))).filter(n=>n.endsWith('.sql')))for(const match of (await readFile(new URL('../db/migrations/'+name,import.meta.url),'utf8')).matchAll(/CREATE TABLE(?: IF NOT EXISTS)? ([a-z_]+)/gi))expectedTables.add(match[1])
  assert.equal(tables.length,expectedTables.size); assert.ok(tables.every((row) => row.ENGINE === 'InnoDB' && row.TABLE_COLLATION === 'utf8mb4_unicode_ci'))
  await admin.query(`CREATE USER '${user}'@'127.0.0.1' IDENTIFIED BY ?`, [secret])
  await admin.query(`CREATE USER '${runtime}'@'127.0.0.1' IDENTIFIED BY ?`, [runtimeSecret])
  for (const { TABLE_NAME: table } of tables) {
    if (table === 'schema_migrations') continue
    await admin.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON \`${database}\`.\`${table}\` TO '${user}'@'127.0.0.1'`)
    const privileges = ['admin_audit','user_roster_imports'].includes(table)||appendOnlyTables.includes(table) ? 'SELECT, INSERT' : ['ticket_history', 'asset_history', 'asset_withdrawals', 'notification_events'].includes(table) ? 'SELECT, INSERT' : ['auth_sessions','user_departments'].includes(table) ? 'SELECT, INSERT, UPDATE, DELETE' : 'SELECT, INSERT, UPDATE'
    await admin.query(`GRANT ${privileges} ON \`${database}\`.\`${table}\` TO '${runtime}'@'127.0.0.1'`)
  }
  const common = `NODE_ENV=test\nAPP_ORIGIN=http://localhost:5173\nDB_HOST=127.0.0.1\nDB_PORT=${server.port}\nDB_NAME=${database}\n`
  await writeFile(new URL('../.env.fresh.runtime', import.meta.url), `${common}DB_USER=${runtime}\nDB_PASSWORD=${runtimeSecret}\n`, { flag: 'wx', mode: 0o600 })
  await writeFile(new URL('../.env.fresh.test', import.meta.url), `${common}DB_USER=${user}\nDB_PASSWORD=${secret}\n`, { flag: 'wx', mode: 0o600 })
  await writeFile(new URL('../fresh-db-status.local', import.meta.url), JSON.stringify({ database, version: server.version, migrations: first, rerun: 'passed', tables: tables.length, checkedAt: new Date().toISOString() }, null, 2))
  console.log('Fresh database ready. Empty-schema migrations and re-runs passed. Existing databases were unchanged. Credentials saved only in ignored local environment files.')
} catch (error) { console.error('Fresh database preparation stopped:', error.code ?? error.message); process.exitCode = 1 }
finally { await admin?.end() }
