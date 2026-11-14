import { loadConfig } from '../src/config.js'
import { createPool } from '../src/db/pool.js'
import { createMySqlUserRepository } from '../src/repositories/mysqlUserRepository.js'
import { createLocalAccountService } from '../src/auth/localAccountService.js'

function hiddenPrompt(label) {
  if (!process.stdin.isTTY || !process.stdin.setRawMode) throw new Error('An interactive terminal is required for password entry')
  return new Promise((resolve, reject) => {
    let value = ''
    process.stdout.write(label)
    process.stdin.setRawMode(true)
    process.stdin.resume()
    process.stdin.setEncoding('utf8')

    function finish(error) {
      process.stdin.removeListener('data', onData)
      process.stdin.setRawMode(false)
      process.stdin.pause()
      process.stdout.write('\n')
      if (error) reject(error)
      else resolve(value)
    }

    function onData(chunk) {
      for (const char of chunk) {
        if (char === '\r' || char === '\n') return finish()
        if (char === '\u0003') return finish(new Error('Cancelled'))
        if (char === '\u0008' || char === '\u007f') { value = value.slice(0, -1); continue }
        if (char >= ' ') { value += char; process.stdout.write('*') }
      }
    }
    process.stdin.on('data', onData)
  })
}

const [emailArg, fullNameArg, role] = process.argv.slice(2)
const email = emailArg?.trim().toLowerCase()
const fullName = fullNameArg?.trim()
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 ||
  !fullName || fullName.length < 2 || fullName.length > 160 ||
  !['employee', 'technician', 'manager','admin'].includes(role)) {
  console.error('Usage: npm run user:create -- "email@example.com" "Full Name" employee|technician|manager|admin')
  process.exitCode = 1
} else {
  const password = await hiddenPrompt(role==='admin'?'Admin password (at least 16 characters): ':'Password (non-empty): ')
  const confirmation = await hiddenPrompt('Confirm password: ')
  if (password !== confirmation) throw new Error('Passwords do not match')
  const pool = createPool(loadConfig().database)
  try {
    await createLocalAccountService(createMySqlUserRepository(pool)).create({ email, fullName, role, password })
    console.log('Local account created.')
  } catch (error) {
    // Database errors can contain SQL and credential parameters.
    console.error(error.code === 'ER_DUP_ENTRY' ? 'Account already exists.' : 'Account creation failed. Check input and database configuration.')
    process.exitCode = 1
  } finally {
    await pool.end()
  }
}
