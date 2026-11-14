# Engineer API integration

API mode connects the engineer dashboard, assignment-scoped queue/details, self-claim, availability, manual support tickets and ticket asset withdrawal. Explicit development mock mode retains the original pages. Cookie authentication and the shared HTTP client are used; no feature records or session tokens are stored in browser storage.

The dashboard and queue use server aggregates and scoped ticket queries. Visible pages refresh on focus and every 15 seconds, with a manual refresh control. Availability is read from the server and persisted through PATCH /api/it-users/me/availability. An unavailable engineer may continue assigned work but cannot self-claim. Manager assignment and self-claim identities use separate server snapshot fields.

Ticket actions submit expectedVersion. Pending reasons and solution descriptions are mandatory; notes explicitly select public/internal visibility. The API enforces assignment scope. Forbidden/not-found refreshes remove stale ticket content. Mutation conflicts reload server state, and failed forms retain their drafts.

Manual employee and senior-management tickets require a manually entered reporter and department. Senior-management position is required. The authenticated creator is derived by the server and never submitted as owner. There is no assignment control. An in-memory request key permits retry after a lost creation response without making another ticket.

Asset selection reads working stock from /api/assets. Withdrawal submits the selected stock version and ticket ID; the server performs the transactional one-unit withdrawal. The resulting record displays its actual withdrawing engineer. Batch splitting, stock conflicts, duplicate prevention and single-unit transitions are covered by live tests.

Manager administration is not exposed. Manager workflows are now connected (see MANAGER_API.md). Shared inventory, notifications and the live bell are now connected; see ASSETS_NOTIFICATIONS_API.md.

Verification: npm run lint; npm run build; npm run verify:api-engineer; npm run verify:engineer-browser. The browser suite uses Chrome and the already configured backend/.env.fresh.test database, creates only fictional fixtures, and removes its own fixtures. It covers engineer role restrictions, reassignment revocation, self-claim races, availability persistence, required action fields, note privacy, stock version conflicts, batch/single withdrawals, manual-ticket retry, refresh, RTL/mobile layout and both themes. No administrator sign-in is needed.

If the system drive lacks temporary space, set TEMP and TMP to a writable workspace-drive temporary directory before running node scripts/verify-engineer-browser.mjs directly. Generated screenshots and profiles live under ignored artifacts.local when configured there. Production same-origin deployment and private real-account provisioning remain deployment tasks.
