# Hospital IT Help Desk & Management System

The latest asset scope is SIMPLE and flexible. The preferred frontend routes under `/it/assets` now use `/api/asset-management/simple`: configurable serial policies, individual assets, arbitrary groups, custody and basic movement history. Migration 013 extends existing records rather than creating a parallel registry. Existing complex endpoints/routes remain available for compatibility/history but are not in the simple dashboard navigation; do not require stock ledgers, suppliers/procurement, QR, inventory approvals or advanced reports in the simple workflow. See backend/docs/simple-assets.md and frontend/README.md. Removing a member keeps its individual custody/location; group replacement returns the old member and transfers the group custody to the replacement.

IT Engineers and IT Managers have the same full asset-management access across the simple workspace and compatibility asset routes; Employees remain excluded. Asset employee selection uses one searchable field with an explicit directory choice. Permissions outside IT Assets are unchanged.

The comprehensive asset-management extension is explicitly authorized by the 2026-11-09 request. Migration 012 adds tagged individual assets, configurable categories, quantity stock ledgers, custody, workstations, replacements, asset-specific maintenance and reviewed inventory under /api/asset-management. Preserve the existing /api/assets compatibility API and legacy history. Do not automatically classify legacy records or fabricate individual units from batches. This supersedes the earlier asset-category prohibition only; star ratings, computer technical specifications and the unrelated manual-maintenance module remain excluded. See backend/docs/asset-management.md for the complete API, migration and permissions.

The frontend now uses the new API-backed asset workspace at `/it/assets`: individual registry and immutable server tags, stock ledger, custody, workstations, movements, replacements, asset-specific maintenance, inventory sessions, exports and authenticated QR lookup. The former quantity-based screen remains at `/it/assets/legacy`; its existing records and ticket withdrawals are not silently converted. Asset notifications use the existing account-scoped notification feed. See [frontend setup](frontend/README.md) for route details and current interface gaps.

Ticket references use the permanent server-generated IT0, IT1, IT2 sequence after migration 009. Display the API reference; preserve internal UUIDs for routes, authorization and relationships. Never renumber existing tickets. See [ticket reference documentation](backend/docs/ticket-references.md).

Arabic RTL React/Vite frontend and Node.js/MySQL backend for employee support, engineer work, manager operations, quantity-based inventory, notifications, reports, and independent system administration. The `admin` role has a separate `/admin` portal and no Manager or Engineer operational access; see [administration documentation](backend/docs/administration.md).

The engineer ticket page shows all support tickets. New, unassigned tickets have a self-assignment action in the table and on their details page; tickets assigned to another engineer remain read-only. Only the assigned engineer can change status, add notes or withdraw stock. The engineer dashboard shows a recent all-tickets feed while its metrics remain scoped to that engineer's own assignments.

An engineer's solution closes a ticket immediately and records both the resolution and closure in its activity history. The employee can optionally confirm the solution or reopen the ticket. Database migration 011 applies the same closure rule to existing resolved tickets; apply pending migrations with an administrative database account before reviewing this behavior in API mode.

The solution description is visible only to IT engineers and managers. Employee ticket views retain the resolution and closure events but do not expose the solution text in the API, popup, or timeline; public troubleshooting notes remain visible.

The real API is the normal mode. The complete same-ticket workflow passed locally against a clean isolated test database using fictional accounts and a restricted runtime database user, including the compiled frontend. Demo authentication is explicit development-only; production bundles are guarded and scanned for demo credentials.

Managers and IT Engineers may add and search employee-directory records by full name and active department at `/it/employees`. Employee codes were cancelled by the owner; migration 008 makes the legacy column nullable without deleting existing values. Migrations 007/008 and restricted grants are applied locally. The authorized workbook import added 132 directory records and 20 departments to development, without creating login credentials. Employee and ordinary-employee IT manual tickets explicitly select a directory record; the backend fills the name and department, while login-account ownership remains separate. Senior-management manual tickets have no department after migration 010; existing tickets retain their history. Ticket forms show problem details only; the frontend derives the API-required title. See [backend directory documentation](backend/docs/employees.md) for verified behavior and import commands.

Start and verify using [LOCAL_VERIFICATION.md](LOCAL_VERIFICATION.md), which contains exact Windows/PowerShell commands, database/password setup, account provisioning, test evidence and remaining production limitations. Local tests passing does **not** mean deployment readiness.

- [Frontend setup and module documentation](frontend/README.md)
- [Backend setup and API documentation](backend/README.md)

Existing local MySQL: 8.0.46 on port 3307. API: port 3001. UI: http://localhost:5173. Use the exact APP_ORIGIN and keep credentials in ignored backend environment files.
