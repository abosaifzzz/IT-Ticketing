import { readFile, readdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'

export async function migrate(connection) {
  const [[server]] = await connection.query('SELECT VERSION() version, @@innodb_default_row_format row_format, @@innodb_page_size page_size, DATABASE() db')
  if (!/^8\.(0|4)\./.test(server.version) || server.version.includes('MariaDB') || server.row_format !== 'dynamic' || server.page_size !== 16384 || !server.db) throw new Error('Unsupported MySQL version/settings; schema was not changed')
  const lockName = `helpdesk-migrate:${server.db}`.slice(0, 64)
  const [[lock]] = await connection.execute('SELECT GET_LOCK(?, 10) acquired', [lockName])
  if (lock.acquired !== 1) throw new Error('Another migration is running')
  try {
    const directory = new URL('../../db/migrations/', import.meta.url)
    const files = await Promise.all((await readdir(directory)).filter((name) => name.endsWith('.sql')).sort().map(async (name) => {
      const sql = await readFile(new URL(name, directory), 'utf8')
      return { name, sql, checksum: createHash('sha256').update(sql).digest('hex') }
    }))
    await connection.query(`CREATE TABLE IF NOT EXISTS schema_migrations (name VARCHAR(255) NOT NULL PRIMARY KEY,
      checksum CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, applied_at DATETIME(3) NOT NULL)
      ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
    const [applied] = await connection.query('SELECT name, checksum FROM schema_migrations')
    for (const row of applied) if (!files.some((file) => file.name === row.name && file.checksum === row.checksum)) throw new Error('Applied migration checksum mismatch; no further migration attempted')
    const added = []
    for (const file of files) {
      if (applied.some((row) => row.name === file.name)) continue
      // Reviewed files contain no stored routines or semicolons inside literals.
      // MySQL DDL commits implicitly: a failed partial migration requires operator review.
      for (const statement of file.sql.split(';').map((part) => part.trim()).filter(Boolean)) await connection.query(statement)
      await connection.execute('INSERT INTO schema_migrations (name, checksum, applied_at) VALUES (?, ?, ?)', [file.name, file.checksum, new Date()])
      added.push(file.name)
    }
    return added
  } finally { await connection.execute('SELECT RELEASE_LOCK(?)', [lockName]) }
}
