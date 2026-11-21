import {managementTables,appendOnlyTables} from '../src/assetManagement/tables.js'
import {administrativeTables} from '../src/administration/policy.js'
import { readFile, readdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import mysql from 'mysql2/promise'
import { parse } from 'dotenv'

if (!Object.hasOwn(process.env, 'HELPDESK_MIGRATION_ADMIN_PASSWORD')) throw new Error('Use scripts/migrate-local-db.ps1 for private password entry')
const password = process.env.HELPDESK_MIGRATION_ADMIN_PASSWORD
delete process.env.HELPDESK_MIGRATION_ADMIN_PASSWORD
try {
  for (const [file, database] of [['.env', 'hospital_it_helpdesk_dev'], ['.env.test', 'hospital_it_helpdesk_test']]) {
    const env = parse(await readFile(new URL(`../${file}`, import.meta.url)))
    if (env.DB_NAME !== database || env.DB_HOST !== '127.0.0.1' || env.DB_USER === 'root') throw new Error('Unexpected local database configuration')
    const admin = await mysql.createConnection({ host: env.DB_HOST, port: Number(env.DB_PORT), user: 'root', password, database })
    try {
      const [[server]] = await admin.query('SELECT VERSION() AS version, @@innodb_default_row_format AS row_format, @@innodb_page_size AS page_size')
      if (!/^8\.(0|4)\./.test(server.version) || server.row_format !== 'dynamic' || server.page_size !== 16384) throw new Error('Unsupported database settings; no migration attempted')
      for (let run = 1; run <= 2; run++) {
        execFileSync(process.execPath, ['scripts/migrate.js'], {
          env: { ...process.env, ...env, DB_USER: 'root', DB_PASSWORD: password }, stdio: ['ignore', 'pipe', 'pipe'],
        })
        console.log(`${database}: migration run ${run} passed`)
      }
      for (const table of ['departments', 'fault_categories', 'fault_subcategories']) {
        const privileges = file === '.env.test' ? 'SELECT, INSERT, UPDATE, DELETE' : 'SELECT, INSERT, UPDATE'
        await admin.query(`GRANT ${privileges} ON \`${database}\`.\`${table}\` TO ?@'127.0.0.1'`, [env.DB_USER])
      }
      await admin.query(`GRANT ${file === '.env.test' ? 'SELECT, INSERT, UPDATE, DELETE' : 'SELECT, INSERT, UPDATE'} ON \`${database}\`.\`employee_directory\` TO ?@'127.0.0.1'`, [env.DB_USER])
      if (file === '.env') {
        const [privileges] = await admin.execute("SELECT PRIVILEGE_TYPE FROM information_schema.TABLE_PRIVILEGES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND GRANTEE = ?", [database, `'${env.DB_USER}'@'127.0.0.1'`])
        if (privileges.some((row) => row.PRIVILEGE_TYPE === 'DELETE')) await admin.query(`REVOKE DELETE ON \`${database}\`.users FROM ?@'127.0.0.1'`, [env.DB_USER])
      }
      for (const table of ['tickets', 'ticket_history']) {
        const privileges = file === '.env.test' ? 'SELECT, INSERT, UPDATE, DELETE' : (table === 'tickets' ? 'SELECT, INSERT, UPDATE' : 'SELECT, INSERT')
        await admin.query(`GRANT ${privileges} ON \`${database}\`.\`${table}\` TO ?@'127.0.0.1'`, [env.DB_USER])
      }
      for (const table of ['assets', 'asset_history', 'asset_withdrawals']) {
        const privileges = file === '.env.test' ? 'SELECT, INSERT, UPDATE, DELETE' : (table === 'assets' ? 'SELECT, INSERT, UPDATE' : 'SELECT, INSERT')
        await admin.query(`GRANT ${privileges} ON \`${database}\`.\`${table}\` TO ?@'127.0.0.1'`, [env.DB_USER])
      }
      for (const table of ['notification_events', 'notification_accounts', 'notifications']) {
        const privileges = file === '.env.test' ? 'SELECT, INSERT, UPDATE, DELETE' : (table === 'notification_events' ? 'SELECT, INSERT' : 'SELECT, INSERT, UPDATE')
        await admin.query(`GRANT ${privileges} ON \`${database}\`.\`${table}\` TO ?@'127.0.0.1'`, [env.DB_USER])
      }
      for (const table of managementTables) {
        const privileges = file === '.env.test' ? 'SELECT, INSERT, UPDATE, DELETE' : appendOnlyTables.includes(table) ? 'SELECT, INSERT' : 'SELECT, INSERT, UPDATE'
        await admin.query(`GRANT ${privileges} ON \`${database}\`.\`${table}\` TO ?@'127.0.0.1'`, [env.DB_USER])
      }
      for(const table of administrativeTables){
        const privileges=file==='.env.test'?'SELECT, INSERT, UPDATE, DELETE':table==='user_departments'?'SELECT, INSERT, UPDATE, DELETE':['admin_audit','user_roster_imports'].includes(table)?'SELECT, INSERT':'SELECT, INSERT, UPDATE'
        await admin.query(`GRANT ${privileges} ON \`${database}\`.\`${table}\` TO ?@'127.0.0.1'`,[env.DB_USER])
      }
      for (const name of (await readdir(new URL('../db/migrations/', import.meta.url))).filter((name) => name.endsWith('.sql'))) {
        const checksum = createHash('sha256').update(await readFile(new URL(`../db/migrations/${name}`, import.meta.url))).digest('hex')
        const [[row]] = await admin.execute('SELECT checksum FROM schema_migrations WHERE name = ?', [name])
        if (row?.checksum !== checksum) throw new Error('Migration checksum verification failed')
      }
      console.log(`${database}: checksums and restricted reference-table permissions verified`)
    } finally { await admin.end() }
  }
} catch (error) {
  // Never echo child stderr, SQL, connection objects or environment values.
  console.error('Migration stopped:', error.code ?? (error.stderr || error.sql ? 'MIGRATION_FAILED' : error.message))
  process.exitCode = 1
}
