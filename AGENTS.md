# Hospital IT Help Desk & Management System — Project Contract

Ticket references use the permanent server-generated IT0, IT1, IT2 sequence after migration 009. Display the API reference; preserve internal UUIDs for routes, authorization and relationships. Never renumber existing tickets. See [ticket reference documentation](backend/docs/ticket-references.md).

## Repository layout and backend transition

The repository now contains two separate projects: `frontend/` holds the existing React/Vite application, and `backend/` is reserved for the Node.js API. The root `AGENTS.md` and `README.md` govern and describe both projects. All frontend paths and commands below are relative to `frontend/` unless explicitly stated otherwise. Run frontend npm commands from `frontend/`.

The backend implements local Argon2id authentication, server sessions, reference administration, tickets/workflows, quantity-based assets, persisted notifications/SSE and reports. The frontend uses the real API by default across all in-scope pages. Explicit mock mode is development-only, with credentials excluded from production builds. Preserve server authorization, session-derived ownership, immutable history and transactional changes. The authentication provider remains replaceable by a future external identity API.

## Product vision

Build a modern, Arabic-first internal web application for Fayoum Oncology Center to manage IT support tickets, engineers, fault categories, IT hardware inventory, notifications, reports, and separate system administration. Operational roles are Employee, IT Engineer, and IT Manager. The fourth role, System Administrator (`admin`), is an independent infrastructure role with no inherited operational permissions.

The repository contains separate React/Vite and Node.js/MySQL applications connected through a same-origin cookie-authenticated API. Do not add Active Directory integration or claim production readiness without a later explicit request and security review. Never store real credentials, sensitive medical data, or production secrets in the repository.

## Current phase: local API integration audited

The latest asset scope is SIMPLE and flexible. The preferred backend API is /api/asset-management/simple: configurable serialMode/uniqueSerial types, individual assets with NEW/USED/FAULTY/IN_MAINTENANCE conditions, arbitrary logical groups, synchronized custody, safe deletion and basic history/dashboard. Migration 013 extends existing records rather than creating a parallel registry. Existing complex endpoints remain compatibility/history APIs only; do not require stock ledgers, suppliers/procurement, QR, inventory approvals or advanced reports in the simple workflow. See backend/docs/simple-assets.md before frontend asset changes. Removing a member keeps its individual custody/location; group replacement returns the old member and transfers the group custody to the replacement. Quantity stock (keyboards, mice, scanners) is issued partially: assigning a stock record moves only the chosen number of units into a separate held record and reduces stock; returning merges them back; `/assets/:id/receive` adds units. Serialized devices (PC cases) stay one record per device. See backend/docs/simple-assets.md (2026-11-21).

The preferred asset frontend now uses `/api/asset-management/simple` through `src/services/assets/simpleAssetService.js`. `/it/assets` is a simple dashboard linking the individual registry, configurable types, flexible groups and custody. Asset detail actions use backend-confirmed condition/custody writes and display movement history. The earlier comprehensive screens remain at their existing direct routes for compatibility/history but are no longer in the main asset navigation. `/it/assets/legacy` retains the previous quantity inventory and original create/detail/edit paths; no legacy records are converted automatically. New asset/group work must not depend on stock ledgers, QR, procurement, inventory approvals or advanced reports. Keep caller-retained `clientRequestId` keys for retriable writes and never show success before backend confirmation. See frontend README and `backend/docs/simple-assets.md`.

The comprehensive asset-management extension is explicitly authorized by the 2026-11-09 request. Migration 012 adds tagged individual assets, configurable categories, quantity stock ledgers, custody, workstations, replacements, asset-specific maintenance and reviewed inventory under /api/asset-management. Preserve the existing /api/assets compatibility API and legacy history. Do not automatically classify legacy records or fabricate individual units from batches. This supersedes the earlier asset-category prohibition only; star ratings, computer technical specifications and the unrelated manual-maintenance module remain excluded. See backend/docs/asset-management.md for the complete API, migration and permissions.

Managers and IT Engineers may add and search employee-directory records by full name and active department at `/it/employees`. Employee codes were cancelled by the owner; migration 008 makes the legacy column nullable without deleting existing values. Migrations 007/008 and restricted grants are applied locally. The authorized workbook import added 132 directory records and 20 departments to development, without creating login credentials. The directory remains separate from login accounts and ticket ownership; ticket creation snapshots the selected directory person's name and department. See [backend directory documentation](backend/docs/employees.md) for verified behavior and import commands.

All requested local API integrations are implemented. The same-ticket workflow was verified using a clean isolated test dataset and a restricted runtime DB account, against both source and built frontend. See [LOCAL_VERIFICATION.md](LOCAL_VERIFICATION.md) for setup, evidence, commands and limits. Local passing checks do not certify deployment readiness. The phase descriptions below are historical context.

Phase 0 established the frontend foundation. Phase 1 added demo authentication. Phase 2 implemented the account-scoped Employee Dashboard and popup tracking. Phase 4 added the searchable My Tickets page. Phase 5 added the ownership-protected employee ticket details workflow. Phase 6 added the assignment-scoped IT Engineer workflow. Phase 7 added manager ticket oversight and assignment. Phase 8 added manager-only administration for fault categories, departments, and IT users. Phase 9 added recipient-scoped ticket notifications. Phase 10 originally added a separate manual-maintenance log, which was later cancelled at the user's request. Phase 11 added the shared IT asset inventory. Phase 12 introduced the manager reports route at `/manager/reports`; it now shows repository-derived ticket counts for total, solved, unsolved, and ever-reopened tickets, plus the most-reported fault types and employees with the most tickets, with creation-date filtering, CSV export, and event-driven refresh.

The post-Phase-12 frontend audit added cross-role lifecycle and theme checks, stricter demo-session restoration, ticket submission validation and duplicate protection, safe asset IDs, and a full employee ticket timeline in the tracking popup. First visits use light mode; the selected theme persists locally.

## Standing user requirements

Preserve these requirements across future work unless the user explicitly rescinds a specific item:

- Communicate with the user in English; keep all visible application content Arabic and RTL.
- Keep every page responsive and support persistent light and dark modes.
- Use Cairo for headings and Tajawal for body text.
- Use the supplied official Fayoum Oncology Center logo without redrawing it.
- Display the technical role as “مهندس تكنولوجيا المعلومات” in Arabic; the temporary auth identifier and route remain `technician` and `/technician`.
- Keep ticket cards on the Employee Dashboard and open tracking/details in a popup modal.
- New reports default to personal and may explicitly be created on behalf of another employee.
- Do not add employee-to-engineer ratings.
- The separate manual-maintenance module is cancelled. Do not restore its route, form, repository, events, or reports unless the user explicitly requests it. Manual support tickets and asset maintenance fields are distinct and remain in scope.
- Use centralized services and account IDs for ticket ownership; never use a selected directory name as the ownership key.
- Manager and engineer may add employee-directory records manually by name and department. Employee codes are cancelled. A directory record is not a login account; never infer ticket ownership or create credentials from it.
- Use the real API as normal mode; do not silently mix mock data into API sessions. Fictional mock data is allowed only in explicit development mode. Never put real credentials or secrets in source control.
- The login page must not display or autofill the demo-account roster. The eight named demo identities use fictional `@demo.example` email addresses and mock passwords; credentials may be supplied to the project owner outside the UI, but production builds must exclude their credentials and development authentication modules. Provide a WhatsApp login-help link for `01018335538` with the locally bundled WhatsApp logo and tell users to contact the IT department or use WhatsApp if they have a problem.

## Required stack and UX rules

- React + Vite using JavaScript/JSX.
- Tailwind CSS and Lucide React.
- React Router for client-side navigation.
- Tajawal is the primary body typeface, with Cairo used for headings and prominent display text.
- Arabic and RTL are the defaults (`lang="ar"`, `dir="rtl"`).
- Start with a light, professional medical-administration aesthetic: white and subtle neutral backgrounds, purple accents, generous spacing, quiet borders and shadows, minimal visual clutter, and responsive layouts.
- Support both light and dark themes across every page. Theme preference must be handled through the centralized preference service and persisted locally.
- Primary brand color is `#5E4994`. Centralize colors, surfaces, text, borders, and state colors as design tokens in `src/styles/index.css`.
- The official supplied logo is stored at `public/brand/fayoum-oncology-center-logo.jpg` and is used in the login page and shared header. Preserve its proportions and do not alter or redraw it without an explicit request.
- Build accessible interfaces: semantic structure, visible focus states, descriptive labels, keyboard-friendly controls, and sufficient color contrast.

## Roles and modules

### System Administrator

- Dedicated `/admin` portal for account management, administrative role permissions, immutable audit review, system settings, backup status/creation, and monitoring.
- ADMIN never inherits Manager or Engineer ticket, asset, report, assignment, or custody permissions. Manager and Engineer permissions remain unchanged. Server authorization is the source of truth; frontend navigation and route guards are only UX.
- Administrative writes require recent reauthentication. The Admin account editor saves identity, profile, activity and role changes with one button and one atomic audited `PATCH /api/admin/users/:id` request; the dedicated role-change API remains available. The backend revokes target sessions, blocks self-role changes and protects the last active Admin. Promotion to Admin requires a new strong Admin password. Admin password recovery still requires a protected out-of-band operator step. Account creation follows role-specific onboarding/provisioning rules.
- The Admin account editor has no role-change reason field; the frontend submits a fixed Arabic audit reason with each role change. The Admin users page no longer shows the pending protected-requests list. Admin success and error feedback is shown through the shared toast service (`src/services/feedback/toastService.js`, rendered once by `src/components/feedback/Toaster.jsx`).
- First-login setup does not ask for the current password; it sends the server-issued temporary password (`123`, see `TEMPORARY_PASSWORD`) automatically, and shows a current-password field only if the server rejects it. Setup/profile feedback also uses toasts.
- HTTP backup restoration remains unavailable until a protected offline recovery adapter is implemented. Never claim that a queued backup succeeded. The logo remains a bundled asset until a secure upload contract exists.
- The Admin frontend consumes `/api/admin` only for administrative data. Operational notifications are not subscribed for Admin users. See [administration API documentation](backend/docs/administration.md).

### Employee

- Dashboard
- Create Ticket
- My Tickets
- Ticket Details
- Ticket tracking modal
- Resolution confirmation and reopening actions inside the modal

### IT Engineer

- Dashboard
- All Tickets with search and status filters; other engineers' tickets are read-only, while new unassigned tickets may be claimed by an available engineer
- Ticket Details readable for IT Engineers, with work actions restricted to the currently assigned engineer
- Ticket Status Updates with mandatory pending reasons
- Public and internal Troubleshooting Notes
- Mandatory solution descriptions and resolution events
- Manual Ticket creation for requests received outside the portal
- IT Asset Inventory

### IT Manager

- Dashboard with ticket, workload, and status summaries
- All Tickets with responsive manager filters
- The manager All Tickets page uses one status filter; do not add a second assignment dropdown that duplicates the “مُسندة” choice.
- Ticket details with full public/internal activity visibility
- Ticket Assignment and reassignment to active engineers only
- IT user management with fictional usernames, exactly two selectable roles (`technician` and `manager`), activity state, and engineer workload counts
- Fault Category and Subcategory Management with ticket counts and activation controls
- Department Management with shared active department options
- Notifications
- Asset Inventory
- Reports showing total, solved, unsolved, and ever-reopened ticket counts, most-reported fault types, and employees with the most tickets
- Manual Ticket creation for requests received outside the portal

## Ticket workflow

Canonical internal status identifiers must remain English and stable:

| Identifier    | Arabic label |
| ------------- | ------------ |
| `new`         | جديدة        |
| `assigned`    | مُسندة       |
| `in_progress` | قيد التنفيذ  |
| `pending`     | معلّقة       |
| `resolved`    | تم الحل      |
| `closed`      | مغلقة        |
| `reopened`    | أُعيد فتحها  |

Use the centralized mapping in `src/services/mock/statuses.js`; do not duplicate status translations in pages.

When an engineer submits a required solution through the `resolved` workflow action, the ticket becomes `closed` immediately in the same transaction. Record the resolution and closure as distinct chronological history entries, and publish the resolved notification once. Employee confirmation is an optional acknowledgement of an already-closed ticket, not a prerequisite for closure; the employee may reopen the ticket if the issue persists. Retain `resolved` for historical records, API action input, and compatibility, but do not leave newly solved tickets in that state. Migration 011 closes pre-existing resolved tickets without removing their history.

The required solution description is IT-only: show and return it to engineers and managers, not employees. Employee ticket details, lists, popup and activity timeline retain the resolution and closure statuses but omit the solution text, including resolution-history notes. Preserve the stored IT-only solution through employee comments, confirmation and reopening. Public troubleshooting notes remain separate and visible to employees.

## Critical business rules

- Production users may eventually sign in through an external identity API. The new backend supports local password authentication first; Windows Domain integration is not implemented.
- Never collect or simulate collection of real domain passwords.
- Demo accounts and mock sessions may be introduced later through a session service.
- Employee tickets and ordinary-employee IT manual tickets require explicit selection from the searchable employee directory; the selected department is read-only and derived by the backend. Never infer the reporter from the login username. Senior-management manual tickets require a manually entered name and position, but have no department; their department ID and label are null after migration 010. Existing historical tickets are not rewritten.
- New employee reports default to “personal,” with an explicit option to report on behalf of another employee. Both modes require an explicit directory selection.
- The API enforces roles, account ownership and engineer assignment scope on every business operation. Frontend route guards provide UX, not authorization.
- Authentication is accessed only through `src/services/auth/authService.js`. The normal provider uses the local API and must remain replaceable by a future external identity provider.
- Persist only the sanitized mock session, role, and fictional demo identity. Never persist passwords.
- The auth role identifier required by Phase 1 is `technician` with route `/technician`; its Arabic product label remains “مهندس تكنولوجيا المعلومات” to preserve the established terminology.

## Architecture rules

- Keep a feature-based page structure. Every module has a dedicated page file under its role folder; do not route multiple modules through a generic placeholder page.
- Keep shared visual components intentionally limited. Ticket UI currently includes `TicketCard`, `StatusBadge`, `TicketTimeline`, `TicketComments`, and `ResolutionConfirmation` alongside `Header`, `Footer`, and `Button`. Authentication providers and route guards are infrastructure rather than visual components.
- Global page appearance is controlled through the shared classes and tokens in `src/styles/index.css`; update those rules when a visual change must apply to every page.
- Define portal navigation once in `src/app/routeConfig.jsx` and derive routes/navigation from it where practical.
- Pages must call domain repository/service interfaces. They must never access `localStorage` directly.
- Browser persistence belongs behind `src/services/storage/localStorageAdapter.js`. Mock domain implementations belong in `src/services/mock`.
- Authentication providers belong in `src/services/auth`; React session state belongs in `src/features/auth`.
- Design service methods so mock implementations can later be replaced by HTTP/API implementations without rewriting consuming pages.
- Publish cross-page changes through the centralized event mechanism in `src/services/events/eventBus.js`. Add named events to `EVENT_NAMES` rather than scattering literal event names.
- Keep seed data fictional and free of sensitive or medical information.
- Do not create additional visual component abstractions unless a later user request explicitly changes this constraint. The current ticket components are explicit phase requirements. Use centralized CSS page patterns elsewhere.
- Associate employee-created tickets with the authenticated account through `reporterAccountId`. The selected directory identity is descriptive data and must never be the sole ownership identifier; IT manual tickets do not acquire an employee-account owner.
- All normal Employee UI queries must use the account-scoped service method. A future backend must enforce ownership from the authenticated server session and ignore untrusted client ownership claims.
- Keep Arabic display copy separate from stable domain identifiers.
- Category, department, and technician administration is manager-only in the UI. Production authorization must enforce this on the server.
- Never delete or rewrite reference labels already stored on historical tickets when a category, department, subcategory, or technician record is edited or deactivated.
- Ticket creation dropdowns must read active categories, subcategories, and departments from their centralized repositories; do not reintroduce hardcoded option lists.
- In every form with a main fault category and subcategory, keep the subcategory select disabled and visually subdued until a main category is chosen. Clear the selected subcategory whenever the main category changes.
- Manager assignments and reassignments must record the authenticated manager account ID and a display-name snapshot. Engineers must see the latest assignment source, while activity history preserves earlier assigning managers and engineer self-claims.
- An active, available IT Engineer may claim a new, unassigned ticket for themselves from the engineer ticket queue. A self-claim records the engineer identity without inventing a manager assignment, publishes the normal ticket-assigned event, and cannot take over a ticket already assigned to someone else. The backend enforces an atomic, server-authorized claim.
- Engineers can read the shared ticket list and ticket details, including tickets assigned to colleagues. Their dashboard also shows a recent all-tickets feed, while counts and recurring-problem metrics remain scoped to their own assignments. The ticket table and ticket details page offer self-assignment only for new, unassigned tickets; they never offer takeover of another engineer's assignment. Status updates, notes, and asset withdrawals remain server-authorized for the currently assigned engineer only.
- Engineers can mark themselves temporarily unavailable or available from their dashboard. This is separate from manager-controlled account activity and is persisted in the mock IT-user repository. Unavailable engineers cannot claim new unassigned tickets for themselves, but managers may explicitly assign or reassign tickets to active engineers even while they are temporarily unavailable. Manager assignment choices must show the temporary unavailability and keep inactive engineers blocked. Only the engineer's own demo identity may toggle availability in the mock service. Production enforcement belongs on the server.
- Manager and engineer dashboards show recurring problems from the server-scoped dashboard API. A recurring pattern means the same fault category appearing at least twice in the same department; engineer results must remain assignment-scoped.
- IT user creation exposes only two role options: “مهندس تقنية المعلومات” (`technician`) and “مدير تقنية المعلومات” (`manager`). Manager records must never appear in ticket assignment choices.
- In API mode notifications are persisted by the backend inside the ticket transaction; the frontend only reads account-scoped state and marks records read. The mock notificationService remains explicit-development-only. UI pages never create notification records directly.
- API notification queries derive the recipient from the authenticated server session. Mock queries are scoped by the authenticated fictional account. Role-wide notifications resolve to active IT users only; inactive accounts must not receive newly created notifications.
- Cross-tab notification updates use `BroadcastChannel` only as a frontend simulation on the same browser origin. API mode uses authenticated SSE with durable polling fallback and server-side recipient authorization.
- Notification audio uses Web Audio only after a user interaction and never requests browser permissions. Sound preferences persist behind the notification sound service.
- `TICKET_FEEDBACK` is a future-ready notification event only. The standing rule prohibiting employee-to-engineer ratings remains in force, so no feedback form or rating workflow is implemented.
- Asset Inventory contains quantity-based records for equipment assigned to departments and spare devices or accessories held in IT storage. Each record has a stable asset ID, a positive integer quantity, operational status, and preserved change history. Asset categories are now authorized in the comprehensive management extension; star condition-rating fields remain cancelled. Preserve legacy compatibility fields while migrating the frontend deliberately. Legacy saved records without a quantity display as one unit, and obsolete category/rating values are ignored without deleting change history.
- An engineer assigned to an active ticket may withdraw one working asset unit from the inventory for that ticket. The operation is service-backed, records the canonical engineer ID/name, ticket ID, time, and audit entries, and marks the withdrawn unit's operational status `withdrawn` (Arabic “تم السحب”). If the source record has multiple units, decrement it by one and create a separate immutable-ID one-unit withdrawn record; never mark the whole batch withdrawn. Single-unit records transition in place. Only one asset withdrawal is supported per ticket for now. Generic asset create/edit must not fabricate or reset a withdrawn status or change a withdrawn unit's quantity. Production must enforce authorization and stock changes atomically on the server.
- The engineer ticket page records assets used for a ticket from the asset registry (`/api/asset-management/simple/assets` + `POST /api/asset-management/ticket-links`), not the legacy `/api/assets` withdrawal, which is kept only to display older withdrawals. Several assets may be linked. Only the assigned engineer (or a manager) may link, and only while the ticket is not resolved/closed. Assets in an employee's custody (`custodian_type = employee`) cannot be linked to any ticket; the picker shows them disabled. IT ticket details return `linkedAssets` (never to employees).
- Engineer and manager ticket pages show one combined «التعليقات» list built by `src/services/tickets/ticketFeed.js` from the server-scoped history: engineer comments (public/internal), pending reasons, solutions, employee comments and reopening reasons. Do not reintroduce separate «ملاحظات المعالجة» / «تعليقات الموظف» sections. The assigned engineer may add a comment at any stage after assignment, including after the ticket is solved/closed.
- The inventory page can export the currently filtered active asset records to a real Arabic RTL `.xlsx` workbook. Keep export mapping in the centralized report/export services, include quantities, and omit cancelled category and rating fields. Spreadsheet text values must remain text, not formulas.
- Tickets do not have a priority field. Do not display, filter, edit, summarize, or create notifications for ticket priority or “high-priority problems.” Existing legacy mock records may contain old priority values in storage, but the ticket service must strip and ignore them.
- IT Engineers and IT Managers may create a manual ticket for either a regular employee (`employee`) or senior management (`top_management`). Manual tickets record the authenticated IT creator separately from the person who requested support. They must never make the creator the ticket owner or expose the ticket through an unrelated employee account.
- All ticket-creation forms show one required problem-details field, without a separate problem-title input. The frontend derives the API-required title from the description until the backend contract is changed. Ordinary-employee manual tickets submit `reporterEmployeeId` and omit reporter name, department and employee number; senior-management manual tickets submit only manually entered name and position, without department fields.
- IT tickets («بلاغ تقنية المعلومات», `requesterType: 'it_internal'`, migration 021) are internal manager-to-engineer tasks such as changing an air-conditioner timer. Only managers create them from the manual-ticket form. They are direct commands, not fault reports: they require an engineer and a description only, and have no fault category/subcategory (migration 022 makes `category_id` nullable only for this type), employee requester, department, phone or AnyDesk ID. They store the snapshots «قسم تكنولوجيا المعلومات» (reporter) and «بلاغ تقنية المعلومات / مهمة داخلية» (category labels), are never visible to employees, and are excluded from the employee ranking, fault-type ranking and recurring-problems dashboard.
- Connection loss (network failure, timeout, 502/503/504 or a non-JSON 5xx from the proxy) uses the single `CONNECTION_LOST_MESSAGE` in `src/services/http/client.js`, which tells users to contact IT on 01018335538; every feature shows it through its normal error display. The Toaster also reports the browser going offline/online and turns that number into a WhatsApp link.
- An engineer self-claim («إسناد لنفسي») also starts the work: the claim event is followed by an `in_progress` status event in the same transaction, so no separate «بدء العمل» step is needed.
- After an employee submits a ticket, the dashboard shows a 15-second popup (`RemoteControlNotice`, image `public/help/remote-control-request.jpg`) telling them to click Yes if a «Remote Control Request» window appears. It shows once per submission, not on refresh.
- Employee portal tickets record the submitting device address server-side (`tickets.reporter_ip`, migration 023) from `req.ip`; clients cannot supply it. Express trusts `X-Forwarded-For` only from loopback proxies by default (`TRUST_PROXY` overrides it, e.g. for a reverse-proxy subnet), and the Vite dev proxy uses `xfwd`. Only engineers and managers see it; employee responses omit it. IT-created manual tickets store NULL. Addresses are DHCP-assigned and employees share or move between PCs, so the IP is only a per-ticket snapshot of the submitting device at that moment. Never store it on the employee profile, treat it as an employee identifier, or pre-fill later tickets with it.
- Employee and manual ticket forms offer an optional AnyDesk ID (`anydeskId`; migration 020 adds `tickets.anydesk_id`). Accept a 9–12 digit address (spaces/dashes stripped) or an alias like `name@ad`; empty means none. It is a ticket-time snapshot shown to the employee and IT on ticket details; existing tickets are not rewritten. Validation lives in `backend/src/tickets/validation.js` and `frontend/src/services/tickets/anydesk.js`.
- On the manager's manual-ticket form, assigning an active engineer is optional even if that engineer is temporarily unavailable. The default creates a `new`, unassigned ticket; if a manager chooses an engineer, use the existing ticket assignment service so status, manager identity, history, engineer view, and assignment notification stay consistent. The engineer's manual-ticket form has no assignment control.
- The manager reports page shows four ticket counts plus two ranked lists: fault types grouped by stored category and subcategory labels, and employees with the most tickets. Employee ranking groups by employee number when available, otherwise by manually entered employee name plus department; senior-management manual tickets are excluded from this employee ranking. These groupings are reporting-only and never replace `reporterAccountId` for ownership checks. Do not restore engineer performance, average resolution time, asset reports, or other breakdowns unless requested.
- The cancelled manual-maintenance module must not be conflated with manual support tickets or maintenance notes and dates on asset records. Existing legacy demo maintenance data in browser storage is not deleted automatically.
- `/it/assets` and its child routes are restricted to `technician` and `manager`; Employees must never see their navigation entries. Engineers and managers have identical full access to all asset operations, including types and serial policies, groups, custody, condition and maintenance, reports, and safe archival. The backend enforces this shared asset policy. Permissions in other modules remain unchanged.
- Asset records are never physically deleted in the demo repository. Archiving hides them from the active inventory while preserving details, relationships, and the complete audit history. Asset IDs are immutable after creation.
- Manager reports in API mode use server-calculated results and server CSV exports. Pages must not read persistence or duplicate aggregation rules. mockReportService is only for explicit development mock mode.
- Date-range report filters use ticket creation date. Solved means current status `resolved` or `closed`; unsolved means every other current status, so solved plus unsolved equals total. Ever-reopened counts distinct tickets with a reopening event in their history or current `reopened` status, even if they are now solved or closed; it may overlap the solved or unsolved counts.
- Asset inventory statistics remain on the asset page and are not included in manager reports. Ticket-priority and employee-to-engineer satisfaction reports remain unavailable.
- Do not leave hardcoded placeholder workflow routes alongside real service-backed pages. Ticket status updates and troubleshooting live in the engineer ticket details page but are enabled only for the assigned engineer; manager assignment lives in the manager ticket list and details views.
- Demo session restoration must validate the stored identity and role against fictional demo users. This remains a UI convenience, not security enforcement.

## Future service boundaries

Add repositories/services as their modules are implemented: sessions, tickets, users, engineers, departments, fault categories, assets, notifications, and reports. Expected repository behavior should use predictable operations such as `getAll`, `getById`, `create`, `update`, and module-specific queries. Async API implementations may arrive later, so feature code should be easy to migrate to asynchronous calls and loading/error states.

## Future functional expectations

- Ticket creation validates a selected directory employee for ordinary requests, or manually entered senior-management identity fields for that request type.
- The Employee Dashboard popup and protected Ticket Details page both expose status history, resolution confirmation, and reopening.
- Engineer tools focus on assigned work, operational updates, troubleshooting history, manual support tickets, and inventory context.
- Manager tools cover queue oversight, assignment, master-data management, staff, notifications, inventory, and reports.
- Notifications should respond to domain events rather than being tightly coupled to form components.
- Manager ticket counts and both rankings should derive from the report service and never compute against storage directly inside presentation components.

## Quality gate for future changes

Before handing off a change, run `npm run lint` and `npm run build`. Verify responsive RTL behavior at mobile, tablet, and desktop widths; light and dark themes; Arabic copy; keyboard focus; route handling; empty/loading/error states where relevant; and that no feature page accesses browser storage directly. Update this file and the root README when architecture, setup, or product rules change.

For backend changes, also run `npm run lint` and `npm test` from `backend/`. Do not claim a MySQL integration test has passed without a configured live database. Keep credentials in untracked environment configuration, use parameterized queries, and keep authentication tokens out of browser storage.
