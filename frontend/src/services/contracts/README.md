# Service contracts

Pages import domain services rather than browser storage. Mock implementations currently satisfy these method shapes:

- `ticketService`: `getAll`, `getById`, `getByIdForReporter`, `getByIdForTechnician`, `getByReporterAccountId`, `queryByReporterAccountId`, `queryByTechnicianId`, `queryForManager`, `getRecurringProblems`, `getTopEmployeeRequesters`, `create`, `update`, `assign`, `addEmployeeComment`, `addTechnicianNote`, `startWork`, `setPending`, `resolve`, `confirmResolution`, `reopen`
- `technicianService`: `getAll`, `getById`, `getActive`, `getTechnicians`, `search`, `add`, `update`, `setActive`
- `faultCategoryService`: `getAll`, `getActive`, `search`, `add`, `update`, `setActive`, `addSubcategory`, `updateSubcategory`, `setSubcategoryActive`
- `departmentService`: `getAll`, `getActive`, `search`, `add`, `update`, `setActive`
- `authService`: `login`, `logout`, `restoreSession`
- `notificationService`: `initialize`, `dispose`, `getForRecipient`, `getUnreadCount`, `markAsRead`, `markAllAsRead`, `getTicketRoute`
- `notificationSoundService`: `initialize`, `getSettings`, `setEnabled`, `setMuted`, `getPattern`, `play`, `preview`
- `assetInventoryService`: `getAll`, `query`, `getCategories`, `getSummary`
- Future services: sessions, users, and reports.

When a backend is introduced, replace service implementations behind the same interfaces. Components must never read or write `localStorage` directly.

The mock UI passes an account ID for reporter ownership and technician assignment filtering. A production implementation must derive both permissions from the authenticated server session and must not trust a client-supplied account ID.

`ticketService.assign(ticketId, technicianId, managerIdentity)` requires the authenticated manager ID and name. A production implementation must derive this manager identity from the server session rather than accepting an untrusted client value.

Notification persistence and recipient fan-out are demo-only. A production implementation must create notifications on the server, authorize recipient queries from the authenticated session, and replace BroadcastChannel with a real-time backend transport.

The separate manual-maintenance module has been cancelled. Manual support tickets remain part of `ticketService`; asset maintenance notes and dates remain part of `assetInventoryService`.
