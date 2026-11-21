import { spawnSync } from 'node:child_process'
const env = { ...process.env, HELPDESK_TEST_ENV: '.env.fresh.test' }
for (const args of [['node_modules/eslint/bin/eslint.js', '.'], ['--test', 'test/auth.test.js', 'test/management.test.js', 'test/tickets.test.js', 'test/workflow.test.js', 'test/assets.test.js', 'test/notifications.test.js', 'test/reports.test.js', 'test/security.test.js', 'test/roster.test.js', 'test/asset-management.test.js','test/simple-assets.test.js','test/administration.test.js'], ['--test', '--test-concurrency=1', 'test/integration/auth.test.js', 'test/integration/management.test.js', 'test/integration/tickets.test.js', 'test/integration/workflow.test.js', 'test/integration/assets.test.js', 'test/integration/notifications.test.js', 'test/integration/reports.test.js', 'test/integration/audit.test.js', 'test/integration/employees.test.js', 'test/integration/asset-management.test.js','test/integration/simple-assets.test.js','test/integration/administration.test.js']]) {
  if(args.includes('test/integration/administration.test.js'))args.push('test/integration/first-login.test.js','test/integration/profiles.test.js')
  const result = spawnSync(process.execPath, args, { env, stdio: 'inherit' })
  if (result.status !== 0) { process.exitCode = 1; break }
}
