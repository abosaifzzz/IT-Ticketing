# Frontend service comparison and backend API

Audit date: 2026-11-02. Compared the implementations in `frontend/src/services/` and their feature-page callers, including operations missing from the older frontend contracts README. Frontend files were read only. All routes below are under `/api`; JSON display/error text remains Arabic. UUIDs, status identifiers and role identifiers are stable machine values.

## Authentication and request conventions

- Use `credentials: 'include'`. Sessions are opaque cookies, HttpOnly, SameSite=Strict, 12-hour absolute expiry; production uses Secure and the `__Host-` cookie prefix. JSON never contains a session token. Do not put tokens in browser storage or URLs.
- Every POST/PATCH requires the exact `APP_ORIGIN` Origin header, including login/logout. Cross-origin reads and preflights are also rejected unless their Origin equals configuration. Requests without Origin are permitted only for GET/HEAD/OPTIONS. JSON bodies are bounded to 8 KiB generally and 32 KiB for tickets/assets. Production origin must be HTTPS; non-HTTP schemes and credential-bearing origins are rejected.
- Employee and engineer account selectors from the demo interfaces must be discarded by the HTTP adapter. The server derives ownership/assignment/notification recipient from the current session. Manager identity is also server-derived.
- List endpoints paginate where stated. An adapter replacing a mock `getAll()` must follow pagination or use the appropriate aggregate endpoint; a single page is not the complete collection. Never download every ticket just to compute dashboard or administration counts.
- API field mapping for the later adapter: demo `name` → `fullName` for IT users; `active` → `isActive`; `available` → `isAvailable`; demo reporter/technician IDs → session, rather than HTTP parameters. Reference records are flat; combine categories/subcategories by `categoryId` when the existing UI expects nested options. Use reference IDs for ticket filters and form selections, preserving stored label snapshots for display.
- IT identifiers accept `username` (3–80 ASCII letters/digits/dot/underscore/@/plus/hyphen, starting with letter/digit), or the existing email-shaped `email` alias, never both. Both use the existing unique, case-insensitive `users.email` database column as a login identifier. It is not a verified delivery address. IT responses include `username`; the legacy `email` property contains that same identifier. There is no email delivery/reset service.

## Operation-by-operation mapping

| Frontend service operations | Backend operation / disposition |
| --- | --- |
| auth `login`, provider `login` | `POST /auth/login`, `{username,password}` or `{email,password}` → `{user}` and cookie |
| auth/provider `restoreSession` | `GET /auth/me` → `{user}`, current DB role/activity checked |
| auth/provider `logout` | `POST /auth/logout` → 204; deletes that session |
| additional session revocation | `POST /auth/logout-all`, empty body → 204; authenticated account only |
| tickets `getAll`, `getByReporterAccountId`, `queryByReporterAccountId`, `queryByTechnicianId`, `queryForManager` | `GET /tickets`; employee-owned, engineer-assigned by default, or manager-wide. Engineers may request `scope=all` for a read-only shared list; ticket mutations remain assignment-protected. |
| tickets `getById`, `getByIdForReporter`, `getByIdForTechnician` | `GET /tickets/:id`; unauthorized ownership/assignment appears as 404 |
| tickets `getByRelatedAssetId` | `GET /tickets?relatedAssetId=ASSET-ID`, same role scope; engineer `scope=all` is read-only |
| tickets `queryUnassigned` | `GET /tickets/unassigned?page=1&pageSize=50`; IT roles only; summary rows plus `total`; no full unassigned-ticket details |
| tickets `getRecurringProblems` | `GET /dashboard/recurring-problems?minimumOccurrences=2&limit=6`; manager-wide or engineer-assigned, employees 403 |
| tickets `getTopEmployeeRequesters` | manager `GET /reports/employees`; reporting keys never grant ticket access; includes `ticketCount`, `openCount`, `closedCount`, `latestTicketAt` |
| tickets `create` | `POST /tickets`; explicit reporter name and department; portal/manual rules, optional manager initial assignment; `clientRequestId` for safe retry |
| tickets `assign` | `POST /tickets/:id/assignment`, `{technicianId,expectedVersion}` |
| tickets `selfAssign` | `POST /tickets/:id/claim`, optional `{expectedVersion}`; active, available engineer only |
| tickets `startWork` | `POST /tickets/:id/status`, `{status:'in_progress'}` |
| tickets `setPending` | same status endpoint with `{status:'pending',pendingReason}` |
| tickets `resolve` | same status endpoint with `{status:'resolved',solutionDescription}` |
| resolution result | The action immediately returns `status:'closed'`; history records both resolution and closure. Employee confirmation remains optional, and reopening remains available. Migration 011 closes legacy resolved tickets. |
| employee resolution visibility | Employee ticket lists/details and employee workflow responses omit `solutionDescription` and the note on resolution-history events. Engineers and managers retain both. Public troubleshooting notes remain visible. |
| tickets `addTechnicianNote` | `POST /tickets/:id/notes`, `{text,visibility:'public'|'internal'}` |
| tickets `addEmployeeComment` | `POST /tickets/:id/comments`, `{text}`; owner account/author from session |
| tickets `confirmResolution` | `POST /tickets/:id/confirm-resolution`, empty body |
| tickets `reopen` | `POST /tickets/:id/reopen`, optional `{reason}` |
| tickets generic `update` | Internal mock implementation helper; not a free-form HTTP mutation. Existing page operations use the authorized actions above. Client-supplied status/history/identity changes are rejected. |
| ticket `getAssignmentSourceLabel`, status mappings | Presentation-only formatting; API exposes assigning manager and self-claim identities separately |
| IT users `getAll`, `search`, `getTechnicians`, `getActive` | `GET /it-users?search=...&role=technician&activeOnly=true`; manager sees IT records/counts; other roles see only active engineer options without email/counts |
| IT users `getById` | `GET /it-users/:id`; same option restrictions for non-managers |
| IT users `add`, `update`, `setActive` | Manager `POST /it-users`, `PATCH /it-users/:id`; `{username|email,fullName,role,isActive}`; only `technician`/`manager`; no phone/extension/password fields |
| IT users `setAvailability` | `PATCH /it-users/me/availability`, `{isAvailable:boolean}`; own active engineer identity only |
| IT user role/availability labels | Client presentation using `role`/`isAvailable`; not another API |
| departments `getAll`, `getActive`, `search` | `GET /departments?search=...&activeOnly=true`; managers may omit activeOnly; non-managers always active only |
| departments `add`, `update`, `setActive` | Manager `POST /departments`, `PATCH /departments/:id`, `{name,isActive}` |
| categories `getAll`, `getActive`, `search` | `GET /fault-categories?search=...&activeOnly=true`; subcategories separately below |
| categories `add`, `update`, `setActive` | Manager `POST /fault-categories`, `PATCH /fault-categories/:id` |
| categories `addSubcategory`, `updateSubcategory`, `setSubcategoryActive` | Manager `POST /fault-subcategories`, `PATCH /fault-subcategories/:id`, `{name,categoryId,isActive}` |
| subcategory selection and details | `GET /fault-subcategories?categoryId=UUID&search=...&activeOnly=true`, or `GET /fault-subcategories/:id`; inactive parent options excluded |
| asset inventory `getAll`, `query` | IT `GET /assets`; paginated active inventory by default; optional `includeArchived=true` |
| assets `getById` | IT `GET /assets/:assetId`, includes complete audit history, including archived details |
| assets `getStatistics` | IT `GET /assets/statistics`; active inventory only, unit totals per operational state plus `recordCount`; separate from manager reports |
| assets `create`, `update` | IT `POST /assets`, `PATCH /assets/:assetId`; positive quantities; updates require `expectedVersion`; immutable IDs |
| assets `withdrawForTicket` | Engineer `POST /assets/:assetId/withdraw`, `{ticketId,expectedVersion?}`; assigned active ticket, one working unit, one withdrawal per ticket |
| assets `remove` | Manager `POST /assets/:assetId/archive`, `{expectedVersion}`; archive, never physical delete |
| assetExport `getSheetData`, `downloadExcel` | IT `GET /assets/export.xlsx`, same inventory filters; Arabic RTL genuine XLSX; up to 10,000 active records, no silent truncation |
| excelExport `serialize`, `download` | Backend returns a workbook download; browser handles saving the response. Inline-string spreadsheet cells prevent formula execution. |
| reports `getDashboard` | Manager `GET /reports`, creation-date filters, summary and rankings; see [reports](reports.md) |
| csvExport `serialize`, `download` | Manager `GET /reports/export.csv`; same filters/limits, UTF-8 BOM, escaped cells and neutralized formula-like values |
| notifications `initialize`, `dispose` | Open/close authenticated SSE `/notifications/stream`; refresh REST history on ready/refresh; polling fallback `/notifications/state?since=...` |
| notifications `getForRecipient` | `GET /notifications?unreadOnly=true&limit=50&before=...`; discard demo recipient argument |
| notifications `getUnreadCount` | `GET /notifications/unread-count` |
| notifications `markAsRead`, `markAllAsRead` | `PATCH /notifications/:id/read`, `POST /notifications/read-all`; empty body; account scope even for managers |
| notifications `getTicketRoute` | Frontend route formatting from notification ticket ID and current role; ticket API separately enforces access if reassigned |
| notification creation/event listeners | Server transaction hooks only, no client notification-create endpoint. Recipient IDs cannot be submitted. |
| notificationSound `initialize`, `getSettings`, `setEnabled`, `setMuted`, `getPattern`, `play`, `preview` | Browser-only audio/preferences; no backend operation needed |
| theme `initialize`, `getActiveTheme`, `set`, `toggle` | Browser-only preferences; no backend operation needed |
| localStorage `get`, `set`, `remove`; events `subscribe`, `publish` | Browser infrastructure, not remote CRUD. Business persistence moves behind HTTP adapters. Publish local events after successful responses; remote notifications use SSE/REST. |
| demo users, seed data, legacy migration helpers | Demo only; never copied into live accounts or database automatically |

The outdated frontend contracts mention asset `getCategories`/`getSummary`: actual inventory implementation uses `getStatistics` and has no asset category operation. Cancelled priority, engineer/asset ratings, feedback submission, manual-maintenance, engineer-performance and average-resolution-time reports remain absent.

## Query and response details

- `GET /dashboard` is available to all authenticated roles, returning `{tickets:{total,solved,unsolved,byStatus}}` for their ticket scope. Manager workload counts come from `/it-users`, not engineer-performance reporting. Dashboard recent tickets use the normal ticket list. Recurrence groups historical category+department labels, trims/lowercases keys, requires at least two occurrences, and returns `key,category,department,count,openCount,ticketIds,latestTicketId,latestOccurredAt`. Limit 1–100, minimumOccurrences 2–1,000,000. No account/engineer selector is accepted.
- Ticket lists return `{items,total,page,pageSize}`, with pageSize 1–100. Filters: `search,status,creationDate,sort,departmentId,categoryId,relatedAssetId`; manager-only `assignment`. Engineer sorting uses assignment time. Date filters are real UTC calendar days. Search treats SQL wildcard characters literally. The unassigned queue accepts only page/pageSize.
- Reference lists return `{items}`; writes/details return `{item}`. Manager lists include `ticketCount` by stable reference ID, including historical tickets after a rename. Most-reported fault reports instead group the historical label snapshots. IT manager lists include `assignedTicketCount` and `activeTicketCount` (current statuses other than resolved/closed); non-manager option responses omit these counts and login identifiers.
- Asset statistics return `{total,recordCount,working,needs_maintenance,out_of_service,under_repair,retired,withdrawn}`. Counts refer to quantities, not rows, except recordCount. They exclude archives. Related-ticket listing remains assignment/ownership scoped even when an IT user can view the asset.
- Workflow actions also accept optional `expectedVersion`, required for manager assignment. Clients must handle 409 by refreshing rather than blindly replaying stale state. Details preserve every earlier resolution/reopening and assignment source; employee history excludes internal notes and asset-withdrawal events.
- Notifications use decimal-string revisions, durable per-account cursors, and idempotent read operations. See [notification delivery](notifications.md) for event/reconnect behavior.

## Provisioning, password resets and revocation

No public registration, browser reset token endpoint, email reset delivery, external identity integration or password field in administration is implemented. An operator verifies the person's identity outside the application before any reset.

1. Bootstrap a local account with `npm run user:create -- "fictional@example.com" "Fictional Name" manager` (or employee/technician). Password and confirmation are prompted privately in an interactive terminal; never pass them as arguments.
2. Manager-created IT records start with no password hash, so cannot sign in. An operator enables local password login for that existing identifier with `npm run user:password -- "fictional.username"`. The command privately prompts twice and preserves account role/activity. It also changes an existing local password.
3. The reset command uses Argon2id and an account-row transaction to replace only the hash and delete all current sessions. It refuses external-provider identities and unknown users. Inactive accounts stay inactive. It must run only from a trusted terminal with the configured DB access.
4. `npm run user:password -- "fictional.username" --revoke-only` revokes current sessions without changing credentials. Users can revoke their own current sessions with `/auth/logout-all`.
5. Management deactivation, role change or login-identifier change revokes every current session in the same transaction. Re-enabling an account does not resurrect those sessions. Availability and display-name edits do not revoke sessions. Direct administrator SQL bypasses application invariants and must be handled by an operator.

Session insertion rechecks activity, role, identifier, provider and local hash under an account lock, preventing a password reset racing a previously authenticated login from creating an old-password session. Revocation without a credential change removes sessions that already exist; it does not disable a valid future login. Provider authentication remains injected; password administration is a separate local-only operator service.

## Security and transaction review

- Argon2id uses unique salts, memory 19,456 KiB, two iterations, one lane. Local passwords have no minimum length beyond being non-empty, per the owner?s local-testing request. The 1,024 UTF-8 byte request-processing cap remains. Only hashes persist. Tokens are random 32-byte secrets; MySQL holds SHA-256 token hashes only.
- Login limits: 50 attempts/IP/15 minutes plus 10 failed attempts/normalized identifier/15 minutes. Identifier limiter keys are SHA-256 digests; successful login does not consume the failed-account allowance. Express does not trust forwarded IP headers. Rate-limit stores are process-local.
- Every HTTP management write rechecks active manager identity inside its repository transaction. Assignment/claim/withdrawal lock identity and ticket/stock and enforce ownership/availability/version invariants. Deadlocks are rolled back; workflow has bounded retries, remaining lock conflicts return sanitized 409 for client refresh/retry. Notification hooks and domain history commit/roll back together.
- SQL uses parameters for data and allowlisted columns/tables. Public errors contain no driver message, SQL, credential values or stack trace. Duplicate/reference/lock conflicts are sanitized 409; unknown failures are generic 500; malformed/oversized JSON is 400. Error handling ends a stream safely if headers already went out.
- Runtime database grants permit mutable domain writes and session deletion; activity/asset-withdrawal/notification event tables are append-only. Runtime cannot create schemas/tables or delete users/history. Tests use a separate account with CRUD for fixture cleanup. The next existing-database migration batch removes the original development user's unnecessary users-table DELETE grant.
- Migration runner verifies MySQL 8.0/8.4, dynamic row format and 16-KiB page size before DDL, uses a database-scoped advisory lock, validates all applied checksums before new migrations, and rejects changed/unknown migration files. MySQL DDL is not transactionally reversible; a partial migration failure requires operator inspection before retry, never an automatic drop/rebuild.

## Verification and remaining blockers

The private `scripts/prepare-fresh-test-db.ps1` created a separate MySQL 8.0.46 audit database on port 3307. It inspected the server/databases, verified the new schema was empty, applied migrations 001–006, re-ran them without additions, and verified 14 InnoDB/utf8mb4 tables. Existing development/test databases were untouched. It generated distinct restricted runtime and fixture accounts; only ignored `.env.fresh.runtime`/`.env.fresh.test` contain their credentials. Root is never stored. The safe preparation record is in ignored `fresh-db-status.local`.

Run `npm run check:fresh` to lint, run isolated tests, and run **all** database suites against `.env.fresh.test`, including inventory, notifications, reports, concurrency, parity and runtime permissions. Integration suites run sequentially to keep full-inventory/full-dashboard fixture assertions deterministic. Existing `npm test` and individual integration commands remain available; default integration configuration is `.env.test`. Tests never silently skip missing migrations. No backend build/transpile script exists; the backend executes JavaScript directly.

Remaining blockers:

1. Frontend remains on its synchronous demo providers. A later authorized frontend task must add async HTTP adapters, field mapping, pagination, cookie credentials, conflict/error handling and SSE/polling refresh. This audit did not edit frontend files or migrate browser demo data.
2. Existing development and ordinary test databases still require the deferred 005/006 migration/grant batch before using inventory and persisted notifications there. The fresh audit database is fully migrated; this task did not apply changes to the older databases. Use the existing private migration script when that batch is requested.
3. Operational/local password recovery is CLI-only. Automated self-service recovery needs a separately approved identity-verification/delivery design; the external identity API remains intentionally unimplemented. Bootstrap a real manager privately; fictional test identities are removed after tests.
4. Before production/multiple API instances: deploy TLS/secret management/backup and restore procedures, configure a specifically trusted reverse proxy, and use shared rate-limit storage. SSE is backed by durable DB polling across processes, but connection caps are per process; clients retain the polling fallback. These are deployment blockers, not missing existing UI operations.
