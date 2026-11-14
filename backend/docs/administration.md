# Independent system administration

Migration `016_administration.sql` introduces the canonical `admin` role. It is a separate identity, with no inheritance from `manager`. Existing operational roles and their permissions remain unchanged. The backend enforces this boundary; frontend menus are insufficient.

| Role | Administration | Operational tickets/assets/reports |
| --- | --- | --- |
| admin | Explicit administrative permissions only | Denied |
| manager | Denied | Existing manager permissions |
| technician (engineer) | Denied | Existing engineer permissions, including full IT Assets access |
| employee | Denied | Existing account-owned employee permissions |

## Local setup

From `backend/`, update existing development and test databases without recreating them:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\migrate-local-db.ps1
```

Enter the MySQL administrator password only at the hidden terminal prompt. The workflow applies migrations twice and verifies checksums and restricted grants. Migration 016 preserves existing accounts/data, adds administration tables and a historical asset-audit role snapshot. The development runtime account can SELECT/INSERT administrative audit records, but cannot UPDATE/DELETE them. Test cleanup permissions are broader and must never be used in production.

Bootstrap the first administrator with your chosen identity, privately:

```powershell
npm run user:create -- "admin@your-domain.example" "System Administrator" admin
```

The example address is a placeholder, not a created account. Password entry is hidden; administrator passwords require at least 16 characters. No default administrator or password is installed. Authentication continues through `/api/auth/login`, `/me` and `/logout`, using HttpOnly cookies. Tokens are never returned in JSON. Administrator sessions default to 30 minutes (configurable 5–60); sensitive writes require authentication within the last five minutes (configurable 1–5). Reauthentication rotates the session cookie.

## API contract

All paths below start with `/api/admin`. Every endpoint requires a current active administrator session and its explicit permission. Writes also require recent authentication, configured-origin checks and sensitive-action rate limits. Standard errors are `{ error }`; list endpoints return `{ items, total, page, pageSize }`. Pagination defaults to 25 and is capped at 100.

| Method | Path | Purpose / body |
| --- | --- | --- |
| POST | `/reauthenticate` | `{ password }`, returns `{ user }` and rotated cookie |
| GET | `/dashboard` | Account/session summary |
| GET | `/users` | Search, role/activity filters and pagination |
| GET | `/users/:id` | Sanitized account details |
| POST | `/users` | `{ email, fullName, role }`; creates inactive account without credentials |
| PATCH | `/users/:id` | `{ fullName?, isActive? }`; activity changes revoke sessions |
| POST | `/users/:id/role-change` | `{ role, reason }`; 202 pending protected approval |
| POST | `/users/:id/password-reset` | `{ reason }`; 202 pending private operator completion |
| POST | `/users/:id/revoke-sessions` | Empty body; invalidate all target sessions |
| GET | `/requests` | Administrative request history |
| GET | `/roles` | Effective administrative permissions and descriptive operational catalogue |
| PUT | `/roles/admin/permissions` | `{ permissions: [...] }`; administrative namespace only |
| GET | `/audit` | Filtered, paginated sanitized audit metadata; supports `actorRole` alongside `actorId`, `module`, `action`, `status` and date filters |
| GET | `/settings` | Versioned section values |
| PUT | `/settings/:section` | `{ expectedVersion, values }`; complete section required |
| GET | `/monitoring` | Uptime, memory, database probe, request counters, backup capabilities |
| GET | `/errors` | Sanitized recent error metadata |
| GET | `/backups/status` | Capabilities and most recent job |
| GET | `/backups` | Persisted backup history |
| POST | `/backups` | Empty body; 202 background encrypted snapshot job |
| POST | `/backups/:id/restore` | Disabled; no safe offline recovery adapter exists |

Use the existing API `id` UUID for account/request/job paths. Admin creation never accepts password/hash/session fields. Role changes cannot be smuggled through account updates. Operational role policies are not editable here; administrative permissions cannot grant tickets/assets access or administration access to other roles. Essential recovery permissions cannot be removed. Ordinary permission editing cannot enable restore.

Settings sections are `identity` (hospitalName, systemName, timezone), `application` (supportEmail, defaultPageSize), `authentication` (adminSessionMinutes, recentAuthenticationMinutes), `notifications` (pollSeconds, realtimeEnabled), and `maintenance` (enabled, message). Authentication and maintenance settings are consumed by the backend. Identity/application/notification values are persisted configuration for client integration; changing notification settings does not currently reconfigure the existing delivery transport. Maintenance blocks operational APIs while leaving authentication, administration and health available.

## Provisioning and protected recovery

Accounts created through the API are inactive and have no login credentials. Provision privately with `npm run user:password -- "user@example.test"`, then activate through the API. Directory employees remain separate from login accounts.

Role changes require a second, trusted local operator step. Password-reset requests likewise expose no reset token or password through HTTP. After an out-of-band identity check:

```powershell
npm run admin:approve -- "<request UUID>"
```

The command requires explicit `APPROVE` confirmation and privately prompts for a new password when needed. It rejects expired, reused or stale-role requests and revokes existing sessions. Admin promotion requires a new strong password. Reset requests expire after one hour; role-change requests after 24 hours. The singleton transaction guard and approval-time checks prevent concurrent actions from disabling or demoting the last active administrator. Self role changes are prohibited. Console activity is honestly recorded as a local operator action rather than fabricating an application user identity.

## Backups and audit security

Backups require private environment configuration: `ADMIN_BACKUP_DIRECTORY` and `ADMIN_BACKUP_KEY`, a base64-encoded cryptographically random 32-byte key. Generate/store the key through your private secret-management process; do not paste it into chat, source, logs or commands committed to the repository. Keep the directory outside served/source folders, apply restrictive Windows NTFS ACLs, and retain the key separately. POSIX mode flags alone do not secure Windows files.

The implementation writes a gzip-compressed AES-256-GCM encrypted logical snapshot from a consistent read transaction, with bounded streaming, unique exclusive filenames, persisted status/checksum and failure metadata. It includes permitted application tables and source migration manifests; it excludes live authentication sessions and does not claim to include the database's applied migration ledger. The uncompressed snapshot limit is 64 MiB. It is not a physical MySQL/server backup. No backup download, arbitrary file upload or HTTP restoration is implemented. Restore permission defaults off; even a trusted operator enabling it receives 501 after explicit confirmation because no protected recovery adapter exists. Interrupted jobs are recorded as failed.

Audit records retain actual actor identity, action, time, IP where valid, status and sanitized old/new values. Operational audit views expose metadata rather than ticket note/solution content. Existing historical asset events without an actor-role snapshot remain unknown; roles are not invented retrospectively. Passwords, tokens, cookies, credentials, raw SQL and error stacks are excluded from API audit/error views. No audit mutation API exists.

## Verification and remaining integration

Run `npm run lint`, `npm test`, and `npm run test:integration`. Focused checks are `npm run test:integration:administration`. Tests use fictional accounts in the configured test database and clean up their fixtures. The administrative suite checks all role boundaries, independent role identity, strong passwords, short sessions, reauthentication/origin checks, inactivity/revocation, protected approvals, last-admin concurrency, settings, immutable restricted-runtime audit grants, monitoring and actual encrypted backup decryption/failure behavior.

Implementation files: `src/administration/{policy,validation,audit,repository,operator,monitoring,backups,router}.js`; migration 016; `scripts/approve-admin-request.js`; administrative unit/integration tests. Existing authentication/session repositories, app/server wiring, dashboard/notification role guards, asset audit snapshots, provisioning/migration scripts, package commands and environment documentation were extended.

Remaining work: an administrative frontend, choosing/provisioning the first real administrator, private backup configuration and recovery drills, a protected restore adapter, MFA, production TLS/proxy and shared rate-limit design, external monitoring and durable error collection, and delivery of reset credentials through an approved private operational process. In-memory monitoring/rate limits are per process. Local passing checks do not establish production readiness.

Local verification on 2026-11-14: lint passed; 47/47 unit tests passed; focused administration integration tests passed 14/14; the final complete database suite passed 126/126. An earlier complete run reported 125/126, but its truncated output did not retain the failing assertion. The captured rerun (`.integration-check.log`, ignored by Git) passed without a corresponding code fix; this remains an unexplained intermittent test result rather than a proven resolved defect. Migration 016 was applied through the private workflow after the operator confirmed completion; the live tests verified its schema and restricted audit grants.
