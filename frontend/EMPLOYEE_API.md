# Employee tickets over the API

The employee dashboard, Create Ticket, My Tickets, full details and tracking popup now use the backend in API mode. Existing development mock pages remain behind explicit VITE_AUTH_MODE=mock. API mode never reads their ticket/reference/notification stores.

Employee routes are enabled individually within their employee portal. Notification history and the live bell are now connected; see ASSETS_NOTIFICATIONS_API.md. Engineer workflows are now connected separately (see ENGINEER_API.md); manager workflows are also connected (see MANAGER_API.md). Shared asset pages are enabled for IT roles only; employee asset access remains denied. The shared API header shows identity, navigation, themes, logo and logout without mounting the legacy mock notification header. Feature data is not fetched from or merged with browser persistence.

Data operations:
- GET /api/dashboard supplies account-scoped dashboard totals, independent of the currently displayed page.
- GET /api/tickets supplies paginated cards/list rows. Dashboard pages contain 12 rows; My Tickets contains 20. My Tickets preserves search, status, UTC creation-day and oldest/newest filters, with visible next/previous controls.
- GET /api/tickets/:id fetches full details, comments, public engineer notes and complete employee-visible history. A popup always fetches this detail endpoint; it never fabricates history from a list row.
- Active departments, categories and subcategories come from their reference endpoints. Selections use stable IDs; changing a category clears its subcategory. Reporter name and department start blank for every new ticket and remain manually entered.
- POST /api/tickets defaults to createdFor:self. The form can switch to other and include an optional employee number. An explicit payload allowlist excludes reporterAccountId, creator/actor identity, source, status and history. Ownership comes solely from the cookie session.
- A creation request key is retained in memory for retries of the same form. A new form payload uses a new key. A lost response can be retried without creating duplicate rows; errors leave the form available with its manually entered values. Drafts are not persisted across a browser reload.
- Comments, resolution confirmation and reopening post to their ticket action endpoints with expectedVersion. Reopening is available from resolved and closed tickets. Solution/reopening history comes from the server. Submission locks prevent duplicate clicks. Failed comments/reopening explanations remain available for correction/retry.
- HTTP 409 refreshes the server snapshot without silently replaying a mutation; the user can retry deliberately. List and dashboard totals refresh after popup actions. Explicit refresh controls fetch current server state.
- Aborted or superseded queries cannot overwrite the current route/filter response. Session refresh on tab focus runs in the background so it does not discard an in-progress employee form just to check /auth/me.

The existing Arabic cards, desktop list, modal, timeline and field layouts are retained. Shared comment/confirmation controls now await asynchronous saves and show busy/error states. The modal traps keyboard focus, supports Escape, and restores focus after closing. All themes and the official logo remain unchanged.

Verification:
- npm run lint
- npm run build
- npm run verify:api-employee
- npm run verify:employee-browser
- npm run verify:api-auth
- npm run verify:api-browser
- npm run verify:e2e

The employee browser test uses real backend repositories/API and fictional fixtures in the already prepared backend/.env.fresh.test database. It checks blank/manual reporter fields, personal and on-behalf creation, category/subcategory dependency, validation, response-loss retry deduplication, refresh persistence, two same-name accounts with separate ownership, private-note exclusion, popup/detail comments, conflict recovery, confirmation and repeated reopening, history, search/status/date/sort/pagination, mobile/desktop overflow and light/dark persistence. It cleans up only its own fixture records and requires no administrator login. Ignored screenshots are written to artifacts.local/.

To use this against the normal development server, its database must have the ticket/workflow/reference migrations and the deferred asset/notification migration/grants batch required by the current backend server. The previous fresh-database audit applied these only to the separate audit database. This frontend task does not change backend schema or existing development data.

Follow-up engineer, manager, inventory and notification integrations are documented in ENGINEER_API.md, MANAGER_API.md and ASSETS_NOTIFICATIONS_API.md.
