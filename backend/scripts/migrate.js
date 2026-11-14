import { loadConfig } from '../src/config.js'
import { createPool } from '../src/db/pool.js'
import { migrate } from '../src/db/migrations.js'

const pool = createPool(loadConfig().database)
let connection
try {
  connection = await pool.getConnection()
  for (const name of await migrate(connection)) console.log(`Applied ${name}`)
} catch (error) {
  console.error('Migration stopped:', error.code ?? 'MIGRATION_FAILED')
  process.exitCode = 1
} finally {
  connection?.release()
  await pool.end()
}
