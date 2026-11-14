# Local setup and verification

Current normal mode is the real, cookie-authenticated API. Explicit development mock mode is optional; production builds replace demo authentication with a disabled implementation and fail if original development-auth modules or known demo passwords reach a chunk. The production artifact scanner also rejects empty/missing builds.

These are local functional and security-boundary checks, not deployment certification. The frontend/backend were inspected in place; neither project was recreated.

## Requirements and existing machine

Use Node.js 20.18+ and MySQL 8.0/8.4 with InnoDB, dynamic row format, 16 KiB pages and utf8mb4. MariaDB is not accepted by the migrations. This installation was inspected as MySQL 8.0.46 on port 3307, separately from any XAMPP database service. Browser tests use Chrome at its standard Windows installation path.

Start in the repository root:

~~~powershell
Set-Location -LiteralPath 'D:\web\Work\IT Ticketing System'
npm --prefix backend ci
npm --prefix frontend ci
~~~

Skip dependency installation when the existing lockfile dependencies are already installed. Database passwords belong only in ignored backend environment files. Never pass a password as a command-line argument or put one in chat.

Existing local configuration is backend/.env for development, backend/.env.test for ordinary integration tests, and backend/.env.fresh.test plus .env.fresh.runtime for the isolated audit database. The runtime audit account has restricted application grants; the separate audit account can clean fictional fixtures. Never point a development server at the audit database.

On this machine the owner privately completed the missing asset/notification migration batch. Both development and ordinary test accounts were then verified to see all 13 application tables and to read the six asset/notification tables. No administrator password is needed for normal starts, logins or tests.

## First-time database setup only

Do not run the setup command against already configured databases. It refuses existing databases/users/environment files instead of overwriting them.

~~~powershell
Push-Location backend
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\setup-local-db.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\migrate-local-db.ps1
Pop-Location
~~~

The scripts inspect MySQL before changes and request administrator/application passwords in hidden local terminal prompts. The setup establishes development/test databases and restricted users; the migration command applies all current migrations, tests re-runs and grants the new table permissions. Future schema updates use only migrate-local-db.ps1, not setup again.

To prepare an additional isolated fresh-test schema on a new setup:

~~~powershell
Push-Location backend
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\prepare-fresh-test-db.ps1
Pop-Location
~~~

This creates a random new database, runs all six migrations from empty and re-runs them, and writes ignored fresh-test/runtime configurations. It refuses to overwrite existing fresh configuration files. Do not delete or overwrite existing databases just to repeat this step.

This audit reused the previously provisioned fresh-test schema hospital_it_helpdesk_test_fresh_b72262d27768. The same-ticket browser test asserted all 13 application tables were empty before seeding fictional fixtures. No new schema or migration re-run was performed on that audit database during this run; its recorded original empty-schema/re-run preparation was on 2026-11-02. All audit fixtures were cleaned afterward. The ordinary development/test migration update was performed separately by the owner at the hidden terminal prompt.

## Provision local application identities privately

Database users and people who log into the portal are different identities. Run these commands in an interactive terminal. Use fictional accounts for development, and enter each application password only at the hidden prompt:

~~~powershell
Push-Location backend
npm run user:create -- "fictional.employee@example.com" "Fictional Employee" employee
npm run user:create -- "fictional.engineer@example.com" "Fictional Engineer" technician
npm run user:create -- "fictional.manager@example.com" "Fictional Manager" manager
Pop-Location
~~~

The supported technical role identifier remains technician. IT-user administration creates identities without collecting credentials; provision/reset their local passwords separately:

~~~powershell
Push-Location backend
npm run user:password -- "fictional.engineer@example.com"
npm run user:password -- "fictional.engineer@example.com" --revoke-only
Pop-Location
~~~

Password replacement revokes prior sessions. There is no default real password or production demo login.

## Start the application

In one terminal:

~~~powershell
npm --prefix backend run dev
~~~

In a second terminal:

~~~powershell
npm --prefix frontend run dev
~~~

Open http://localhost:5173. The backend must have APP_ORIGIN=http://localhost:5173 and PORT=3001; Vite proxies /api to http://127.0.0.1:3001. Use the exact configured origin: localhost and 127.0.0.1 are different origins. Backend database port is 3307 here; API port is 3001.

Frontend defaults and frontend/.env.example select VITE_AUTH_MODE=api and VITE_API_BASE_URL=/api. Explicit mock mode is only for Vite development via VITE_AUTH_MODE=mock; it is never a fallback for a failed API request. No mock browser records are automatically migrated to MySQL.

## Repeat the checks

Run checks sequentially. Stop if any command exits nonzero. For a full clean audit, no other process should seed/use the isolated audit database.

Backend lint, 29 isolated tests and all 61 live-database tests against the fresh configuration:

~~~powershell
Push-Location backend
node scripts/check-fresh.js
Pop-Location
~~~

Ordinary test database after migrations:

~~~powershell
npm --prefix backend run test:integration
~~~

Frontend lint, contract checks and the same-ticket development-server flow:

~~~powershell
Push-Location frontend
node node_modules/eslint/bin/eslint.js .
node scripts/verify-api-auth.mjs
node scripts/verify-api-employee.mjs
node scripts/verify-api-engineer.mjs
node scripts/verify-api-manager.mjs
node scripts/verify-api-assets-notifications.mjs
node scripts/verify-full-flow-browser.mjs
Pop-Location
~~~

The full-flow browser test uses the restricted runtime DB account for API repositories, starts temporary local API/Vite servers, and uses the separate fixture-cleanup account only for audit assertions/cleanup.

Build only after that flow passes, scan the actual emitted files, and repeat the same workflow against the compiled frontend:

~~~powershell
Push-Location frontend
node node_modules/vite/bin/vite.js build
if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed' }
node scripts/verify-production.mjs
if ($LASTEXITCODE -ne 0) { throw 'Production artifact check failed' }
$env:HELPDESK_BROWSER_BUILD = '1'
try {
    node scripts/verify-full-flow-browser.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Built frontend workflow failed' }
} finally {
    Remove-Item Env:HELPDESK_BROWSER_BUILD -ErrorAction SilentlyContinue
}
Pop-Location
~~~

Run the broader browser regressions too:

~~~powershell
Push-Location frontend
node scripts/verify-api-browser.mjs
node scripts/verify-employee-browser.mjs
node scripts/verify-engineer-browser.mjs
node scripts/verify-manager-browser.mjs
node scripts/verify-assets-notifications-browser.mjs
Pop-Location
~~~

Explicit isolated mock regressions remain available: verify:auth, verify:tickets, verify:admin, verify:notifications, verify:assets, verify:reports, verify:e2e and verify:theme, run through npm from frontend/. They were also run during this audit.

If C: has no temporary/cache space, create a workspace-drive temporary directory and set TEMP/TMP in the test terminal before browser checks:

~~~powershell
New-Item -ItemType Directory -Force -Path .\frontend\artifacts.local\tmp | Out-Null
$env:TEMP = (Resolve-Path .\frontend\artifacts.local\tmp).Path
$env:TMP = $env:TEMP
~~~

The direct node commands avoid npm's C: log/cache path. Browser artifacts, screenshots, profiles and the full-flow-result.local receipt remain ignored under frontend/artifacts.local/. Never publish environment files or browser profiles. Vite/ESLint exclude those artifacts.

## What passed in this audit

- Backend lint; 29/29 isolated tests; 61/61 fresh-database integration tests; ordinary test-database integration recheck after the owner's migration update.
- Frontend lint/build; all five API contract suites; all eight isolated mock suites; all five role/feature browser suites; the new same-ticket flow against both source and compiled frontend; production credential scan and negative build-guard tests.
- A fictional employee manually entered reporter/department, created a personal ticket, received an injected lost response, and retried without a duplicate ticket or creation notification.
- A manager opened the new-ticket notification and assigned an active temporarily unavailable engineer. An engineer opened the assignment notification, started/paused/resumed work, added public/internal notes, withdrew one working unit from a three-unit stock record, and resolved the ticket.
- The employee saw the resolution notification, public notes only, commented, confirmed, reopened, then confirmed a second resolution. Earlier notes, reasons, resolutions, confirmation and reopening history remained preserved.
- Manager reporting for that ticket returned total=1, solved=1, unsolved=0 and ever-reopened=1. Server CSV and Arabic RTL XLSX exports were checked, including withdrawal identity and quantities.
- All roles, role redirects, account ownership, assignment scope, inactive/expired/revoked sessions, recipient/read isolation, parent/subcategory validation, mandatory pending/solution text, concurrency/version conflicts, duplicate requests, negative stock prevention and missing/foreign Origin rejection were covered.
- Refresh persistence, recoverable server failures, no tokens in JSON/localStorage, HttpOnly session cookies, salted Argon2id password hashes, Arabic RTL, mobile/tablet/desktop overflow, both themes, SSE reconnect/polling and opt-in autoplay-safe sound were covered.
- Production artifacts contain no demo passwords. Development credentials/auth are replaced at build time, and the build guard fails if original development auth modules or known demo credentials are emitted. API mode remains the normal mode.

Some tests intentionally inject failures; the sanitized line "API request failed." is expected in those cases and is followed by passing recovery assertions.

## Production limitations — local passing tests are not readiness

- No deployment, TLS termination, real DNS/origin, browser-cookie behavior behind a production reverse proxy, cross-platform browser matrix, penetration test, load test or availability target was certified. Serve only frontend/dist, not repository sources; proxy /api to Node and keep SSE unbuffered with client-disconnect cleanup. Use NODE_ENV=production and an exact HTTPS APP_ORIGIN; the production cookie is Secure/HttpOnly/SameSite=Strict with the __Host- name.
- Authentication is local Argon2id plus 12-hour server sessions. External identity/AD integration is intentionally absent. Password provisioning/reset and bulk session revocation are CLI operations; self-service recovery and its identity-verification/delivery process are not implemented.
- Login rate limits and SSE connection limits are process-local. Multi-instance deployment needs coordinated throttling and proxy/capacity validation. Notification persistence/polling is database-backed; SSE checks each live account periodically.
- Production secrets/OS file permissions, database TLS/network access, least-privilege provisioning on the target host, backup/restore drills, retention/purge policies, structured monitoring/alerting and operational migration/rollback procedures still need deployment work. Expired sessions are rejected lazily; there is no scheduled retention/purge job.
- MySQL DDL commits implicitly; partial failed migrations require operator review. This audit did not create another empty schema or test a production restore. Existing databases were never dropped.
- The build retains a large-chunk warning (about 639 KiB minified main JS); code splitting/performance work remains. XLSX exports are capped at 10,000 active records; narrow filters above that limit. Report creation-date boundaries are UTC.
- Fictional fixtures and local browser checks do not validate real organizational data migration, medical-data handling or production authorization administration. Browser demo storage is not imported. Cancelled priority, ratings and manual-maintenance features remain absent.
