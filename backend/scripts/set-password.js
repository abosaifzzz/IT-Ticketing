import { loadConfig } from '../src/config.js'
import { createPool } from '../src/db/pool.js'
import { createMySqlUserRepository } from '../src/repositories/mysqlUserRepository.js'
import { createLocalAccountService } from '../src/auth/localAccountService.js'
import { createMySqlSessionRepository } from '../src/repositories/mysqlSessionRepository.js'
import { hiddenPrompt } from './password-prompt.js'

const [identifier, option, ...extra] = process.argv.slice(2)
let pool
try {
  if (!identifier || identifier.length > 254 || (option !== undefined && option !== '--revoke-only') || extra.length) throw new Error('Usage: npm run user:password -- username-or-email [--revoke-only]. Never pass a password as an argument.')
  pool = createPool(loadConfig().database)
  const users = createMySqlUserRepository(pool)
  if (option === '--revoke-only') {
    const user = await users.findByEmail(identifier.trim().toLowerCase())
    if (!user) throw new Error('Account not found')
    await createMySqlSessionRepository(pool).deleteForUser(user.id)
    console.log('All current sessions revoked.')
  } else {
    const password = await hiddenPrompt('New local password (non-empty): ')
    if (password !== await hiddenPrompt('Confirm new password: ')) throw new Error('Passwords do not match')
    await createLocalAccountService(users).replacePassword(identifier, password)
    console.log('Local password set. All current sessions revoked. Account activity and role unchanged.')
  }
} catch {
  console.error('Operation failed. Check the account, local provider, input and database configuration. Passwords must be entered privately, never as arguments.')
  process.exitCode = 1
} finally { await pool?.end() }
