# IT Assets authorization

Active authenticated Engineers (`technician`) and Managers (`manager`) have identical full access within IT Assets only. The shared policy lives in `src/assets/permissions.js`, is enforced by both asset router families, and is reused by repositories/transaction handlers. All future asset operations must remain inside these protected routers and use the shared repository policy; do not introduce manager flags or substitute actor identities.

This includes CRUD and serial policy configuration, group membership/replacement, custody/return/transfer, condition and maintenance, legacy inventory, dashboards, history, reports and exports. Employees, unknown roles and unauthenticated sessions cannot access the module. Existing cookie authentication, Origin checks, active-account/role revalidation and idempotency remain in effect.

Full permission still requires valid state: assigned or grouped individual assets cannot be deleted; group deletion requires empty membership and returned custody. Stock cannot become negative, maintenance repair confirmation is required, and replacements/custody remain transactional. Historical data and audit actor IDs remain intact. Soft deletion/deactivation preserves references.

Within asset APIs, both IT roles may link existing tickets and manage another engineer's maintenance records. Legacy stock withdrawal requires an assigned active ticket, working available stock and no earlier withdrawal; either IT role can perform it. Legacy engineer-named withdrawal fields store the actual acting account for compatibility. Ticket history records that actor's real role. Ticket actions, ticket reports, user/department/fault-category administration and other non-asset permissions are unchanged.

No schema migration, new endpoint, password entry or administrator action is required. Restart the backend to load the code. Frontend permission guards may still hide formerly manager-only asset controls; updating that UI is separate from this backend task.

Verification commands: `npm run lint`, `npm test`, `npm run test:integration`. Integration fixtures use fictional accounts and the configured test database, with cleanup. Tests cover both roles' full simple asset lifecycle, audit identities, manager withdrawal, employee/anonymous denial, stock concurrency, replacement rollback, custody/deletion guards and unchanged non-asset authorization.

Verified locally on 2026-11-11: lint passed; 41/41 unit tests and 100/100 database-backed integration tests passed. No frontend files or database schema were changed for this authorization update.
