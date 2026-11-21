import {administrativeTables} from '../src/administration/policy.js'
import {managementTables,appendOnlyTables} from '../src/assetManagement/tables.js'
import mysql from 'mysql2/promise'
import { access, writeFile,readdir,readFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { randomUUID, randomBytes } from 'node:crypto'
import assert from 'node:assert/strict'
import { createMySqlUserRepository } from '../src/repositories/mysqlUserRepository.js'
import { createMySqlSessionRepository } from '../src/repositories/mysqlSessionRepository.js'

// Passwords travel only through captured process output and memory, never arguments or logs.
function privatePassword(title, variable) {
  if (Object.hasOwn(process.env, variable)) {
    const value = process.env[variable]
    delete process.env[variable]
    return value
  }
  const script = `
Add-Type -AssemblyName System.Windows.Forms
$form = New-Object System.Windows.Forms.Form
$form.Text = '${title}'
$form.Width = 470
$form.Height = 190
$form.StartPosition = 'CenterScreen'
$form.TopMost = $true
$label = New-Object System.Windows.Forms.Label
$label.Text = 'Enter password privately (minimum 16 characters for application):'
$label.SetBounds(15,15,430,35)
$box = New-Object System.Windows.Forms.TextBox
$box.UseSystemPasswordChar = $true
$box.SetBounds(15,55,420,25)
$ok = New-Object System.Windows.Forms.Button
$ok.Text = 'Continue'
$ok.SetBounds(325,95,110,30)
$ok.DialogResult = [System.Windows.Forms.DialogResult]::OK
$form.AcceptButton = $ok
$form.Controls.AddRange(@($label,$box,$ok))
if ($form.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { exit 2 }
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding
[Console]::Write($box.Text)
$form.Dispose()
`
  return execFileSync('powershell.exe', ['-NoProfile', '-STA', '-Command', script], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  })
}

const targets = [
  { database: 'hospital_it_helpdesk_dev', user: 'helpdesk_dev', file: '.env', mode: 'development' },
  { database: 'hospital_it_helpdesk_test', user: 'helpdesk_test', file: '.env.test', mode: 'test' },
]
const base = { host: '127.0.0.1', port: 3307, timezone: 'Z', connectTimeout: 5000 }
let admin
const suppliedAdminPassword = Object.hasOwn(process.env, 'HELPDESK_SETUP_ADMIN_PASSWORD')
let adminPassword = suppliedAdminPassword
  ? privatePassword('', 'HELPDESK_SETUP_ADMIN_PASSWORD') : ''
try {
  try {
    admin = await mysql.createConnection({ ...base, user: 'root', password: adminPassword })
  } catch (error) {
    if (error.code !== 'ER_ACCESS_DENIED_ERROR' || suppliedAdminPassword) throw error
    adminPassword = privatePassword('Enter your existing MySQL root password', 'HELPDESK_SETUP_ADMIN_PASSWORD')
    admin = await mysql.createConnection({ ...base, user: 'root', password: adminPassword })
  }
  const [[server]] = await admin.query('SELECT VERSION() AS version, @@port AS port, @@innodb_default_row_format AS row_format, @@innodb_page_size AS page_size')
  console.log('Server:', JSON.stringify(server))
  const [databases] = await admin.query('SHOW DATABASES')
  console.log('Existing databases:', databases.map((row) => row.Database).join(', '))
  if (!/^8\.(0|4)\./.test(server.version) || server.version.includes('MariaDB') || server.row_format !== 'dynamic' || server.page_size !== 16384) {
    throw new Error('Server settings changed; review migration compatibility before provisioning.')
  }
  for (const target of targets) {
    if (databases.some((row) => row.Database === target.database)) throw new Error(`Refusing to reuse existing database: ${target.database}`)
    const [accounts] = await admin.execute('SELECT User FROM mysql.user WHERE User = ?', [target.user])
    if (accounts.length) throw new Error(`Refusing to reuse existing account: ${target.user}`)
    try {
      await access(target.file)
    } catch (error) {
      if (error.code === 'ENOENT') continue
      throw error
    }
    throw new Error(`Refusing to overwrite ${target.file}`)
  }
  const password = privatePassword('Choose local application database password', 'HELPDESK_SETUP_APP_PASSWORD')
  if (password.length < 16 || /[\r\n\0]/.test(password)) throw new Error('Application password must have at least 16 characters and no line breaks.')
  const delimiter = ["'", '`', '"'].find((quote) => !password.includes(quote) && (quote !== '"' || !/\\[nr]/.test(password)))
  if (!delimiter) throw new Error('For dotenv compatibility, omit at least one of the three quote characters from the password.')
  for (const target of targets) {
    // Identifiers are fixed constants above. CREATE intentionally has no IF NOT EXISTS.
    await admin.query(`CREATE DATABASE \`${target.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`)
    await admin.query(`CREATE USER '${target.user}'@'127.0.0.1' IDENTIFIED BY ?`, [password])
    const migrationEnv = { ...process.env, NODE_ENV: target.mode, APP_ORIGIN: 'http://localhost:5173', DB_HOST: base.host, DB_PORT: String(base.port), DB_NAME: target.database, DB_USER: 'root', DB_PASSWORD: adminPassword }
    for (let run = 1; run <= 2; run++) {
      execFileSync(process.execPath, ['scripts/migrate.js'], { env: migrationEnv, stdio: ['ignore', 'pipe', 'pipe'] })
      console.log(`${target.database}: migration run ${run} passed`)
    }
    for (const table of ['users', 'auth_sessions']) {
      const privileges = target.mode === 'test' || table === 'auth_sessions' ? 'SELECT, INSERT, UPDATE, DELETE' : 'SELECT, INSERT, UPDATE'
      await admin.query(`GRANT ${privileges} ON \`${target.database}\`.\`${table}\` TO '${target.user}'@'127.0.0.1'`)
    }
    for (const table of ['departments', 'fault_categories', 'fault_subcategories']) {
      const privileges = target.mode === 'test' ? 'SELECT, INSERT, UPDATE, DELETE' : 'SELECT, INSERT, UPDATE'
      await admin.query(`GRANT ${privileges} ON \`${target.database}\`.\`${table}\` TO '${target.user}'@'127.0.0.1'`)
    }
    await admin.query(`GRANT ${target.mode === 'test' ? 'SELECT, INSERT, UPDATE, DELETE' : 'SELECT, INSERT, UPDATE'} ON \`${target.database}\`.\`employee_directory\` TO '${target.user}'@'127.0.0.1'`)
    const connection = await mysql.createConnection({ ...base, database: target.database, user: target.user, password })
    for (const table of ['tickets', 'ticket_history']) {
      const privileges = target.mode === 'test' ? 'SELECT, INSERT, UPDATE, DELETE' : (table === 'tickets' ? 'SELECT, INSERT, UPDATE' : 'SELECT, INSERT')
      await admin.query(`GRANT ${privileges} ON \`${target.database}\`.\`${table}\` TO '${target.user}'@'127.0.0.1'`)
    }
    for (const table of ['assets', 'asset_history', 'asset_withdrawals']) {
      const privileges = target.mode === 'test' ? 'SELECT, INSERT, UPDATE, DELETE' : (table === 'assets' ? 'SELECT, INSERT, UPDATE' : 'SELECT, INSERT')
      await admin.query(`GRANT ${privileges} ON \`${target.database}\`.\`${table}\` TO '${target.user}'@'127.0.0.1'`)
    }
    try {
      const [[identity]] = await connection.query('SELECT DATABASE() AS db, CURRENT_USER() AS account, @@character_set_connection AS connection_charset')
      console.log('Application connection:', JSON.stringify(identity))
      await connection.beginTransaction()
      const id = randomUUID()
      const email = `${id}@demo.example`
      const users = createMySqlUserRepository(connection)
      const sessions = createMySqlSessionRepository(connection)
      await users.createLocal({ id, email, fullName: 'اختبار قاعدة البيانات', role: 'employee', passwordHash: null })
      assert.equal((await users.findByEmail(email)).full_name, 'اختبار قاعدة البيانات')
      const tokenHash = randomBytes(32).toString('hex')
      await sessions.create({ tokenHash, userId: id, expiresAt: new Date(Date.now() + 60000) })
      assert.equal((await sessions.findUserByTokenHash(tokenHash)).id, id)
      await sessions.delete(tokenHash)
      assert.equal(await sessions.findUserByTokenHash(tokenHash), null)
      await connection.execute('UPDATE users SET full_name = ? WHERE id = ?', ['اختبار', id])
      await connection.execute('DELETE FROM users WHERE id = ?', [id])
      await connection.rollback()
      console.log(`${target.database}: repository CRUD, Arabic round-trip, session join and rollback passed`)
    } finally {
      await connection.end()
    }
    const [tables] = await admin.execute('SELECT TABLE_NAME, ENGINE, TABLE_COLLATION FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME', [target.database])
    for (const table of ['notification_events', 'notification_accounts', 'notifications']) {
      const privileges = target.mode === 'test' ? 'SELECT, INSERT, UPDATE, DELETE' : (table === 'notification_events' ? 'SELECT, INSERT' : 'SELECT, INSERT, UPDATE')
      await admin.query(`GRANT ${privileges} ON \`${target.database}\`.\`${table}\` TO '${target.user}'@'127.0.0.1'`)
    }
    for (const table of managementTables) {
      const privileges = target.mode === 'test' ? 'SELECT, INSERT, UPDATE, DELETE' : appendOnlyTables.includes(table) ? 'SELECT, INSERT' : 'SELECT, INSERT, UPDATE'
      await admin.query(`GRANT ${privileges} ON \`${target.database}\`.\`${table}\` TO '${target.user}'@'127.0.0.1'`)
    }
    for(const table of administrativeTables){
      const privileges=target.mode==='test'?'SELECT, INSERT, UPDATE, DELETE':table==='user_departments'?'SELECT, INSERT, UPDATE, DELETE':['admin_audit','user_roster_imports'].includes(table)?'SELECT, INSERT':'SELECT, INSERT, UPDATE'
      await admin.query(`GRANT ${privileges} ON \`${target.database}\`.\`${table}\` TO '${target.user}'@'127.0.0.1'`)
    }
    const migrationFiles=(await readdir(new URL('../db/migrations/',import.meta.url))).filter(n=>n.endsWith('.sql'))
    const expectedTables=new Set(['schema_migrations'])
    for(const name of migrationFiles)for(const match of (await readFile(new URL('../db/migrations/'+name,import.meta.url),'utf8')).matchAll(/CREATE TABLE(?: IF NOT EXISTS)? ([a-z_]+)/gi))expectedTables.add(match[1])
    assert.equal(tables.length,expectedTables.size)
    assert.ok(tables.every((row) => row.ENGINE === 'InnoDB' && row.TABLE_COLLATION === 'utf8mb4_unicode_ci'))
    const [[migration]] = await admin.query(`SELECT COUNT(*) AS count FROM \`${target.database}\`.schema_migrations`)
    assert.equal(migration.count, migrationFiles.length)
    console.log('Verified tables:', JSON.stringify(tables))
    const env = `NODE_ENV=${target.mode}\nPORT=3001\nAPP_ORIGIN=http://localhost:5173\nDB_HOST=127.0.0.1\nDB_PORT=${base.port}\nDB_NAME=${target.database}\nDB_USER=${target.user}\nDB_PASSWORD=${delimiter}${password}${delimiter}\n`
    await writeFile(target.file, env, { flag: 'wx', mode: 0o600 })
    console.log(`${target.file}: created without displaying credentials`)
  }
  const [permissions] = await admin.query("SELECT GRANTEE, TABLE_SCHEMA, TABLE_NAME, PRIVILEGE_TYPE FROM information_schema.TABLE_PRIVILEGES WHERE GRANTEE IN (\"'helpdesk_dev'@'127.0.0.1'\", \"'helpdesk_test'@'127.0.0.1'\") ORDER BY GRANTEE, TABLE_NAME, PRIVILEGE_TYPE")
  console.log('Application table permissions:', JSON.stringify(permissions))
  console.log('Setup complete. Existing databases were not modified.')
} catch (error) {
  // Driver errors can contain SQL and passwords: print only a safe code, never the error object.
  console.error('Setup stopped:', error.code ?? (error.sql ? 'DATABASE_OPERATION_FAILED' : error.message && !error.stderr ? error.message : 'PRIVATE_PROMPT_OR_MIGRATION_FAILED'))
  process.exitCode = 1
} finally {
  if (admin) await admin.end()
}
