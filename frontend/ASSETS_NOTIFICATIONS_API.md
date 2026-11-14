# Shared assets and notifications API integration

API mode now connects all shared inventory routes and notification history/bell for employee, technician and manager accounts. Explicit development mock mode retains the earlier demo implementations. Assets and notifications are never sourced from or merged with localStorage in API mode; only theme and user sound preferences are stored locally.

## Inventory

The shared /it/assets routes require technician or manager role in the frontend and backend. Employee direct routes are denied and employee navigation has no inventory entry. Engineers/managers create and edit records; only managers see archive controls and the backend rejects engineer archive requests.

GET /assets supplies paginated search/status/department/holding-type filters, with optional archived records. GET /assets/statistics supplies unit-based totals independently of the current filters. Details use GET /assets/:id, including server audit events, changed fields, actor names, withdrawal ticket/time, source record and withdrawing engineer. Related tickets use the normal server-scoped ticket list. Visible inventory/details refresh on focus and every 15 seconds, plus explicit refresh controls.

POST/PATCH allowlists exclude asset category, ratings, actor fields and withdrawal identities. Positive integer quantity is required. Asset IDs remain immutable. Department and IT-storage holdings are explicit. An unchanged historical department is retained on edit; changing departments selects an active reference. A withdrawn unit keeps quantity one and its withdrawn status, both disabled in the form and protected by the server. Stale edits display a conflict and require an explicit reload before another save; no mutation is blindly retried.

GET /assets/export.xlsx receives the same search/status/department/holding filters without pagination or archived inclusion. The server produces the complete filtered active inventory workbook with Arabic headers, RTL sheet layout, quantities and safe text cells. The HTTP client validates the XLSX content type and downloads the returned binary with cookie credentials. No client-side inventory recalculation/export serialization is used.

## Notifications

One account-bound in-memory feed is mounted above route layouts in API mode. GET /notifications supplies the latest bell items and account-scoped history; GET /notifications/state?since=REVISION supplies the unread count and durable revision. Revisions remain decimal strings to preserve BIGINT precision. The browser never submits a recipient/account selector.

PATCH /notifications/:id/read and POST /notifications/read-all update server state. History supports unread-only filtering and cursor pagination. Opening an item first marks it read, then uses an allowlisted portal route; the ticket endpoint still enforces ownership or assignment. No optimistic cross-account cache is used. Account switches hide prior account data and stop the old feed.

Cookie-authenticated EventSource connects to /notifications/stream under the configured same-origin API base. ready/reconnect/refresh events trigger REST refresh of persisted records. A state poll runs every 15 seconds even while SSE is active, and closed streams are retried during polling/focus. Errors retain retry controls; 401 invalidates authentication and session-ended revalidates identity. Stream and request cleanup runs on account changes and unmount. pagehide closes streams for Chrome back/forward caching; pageshow requires foreground identity restoration before a cached feed resumes. This prevents a cached page from binding another signed-in account's data to its previous identity.

The Vite development proxy binds upstream cancellation before and after stream headers, releasing connections when a client leaves. Browser artifacts are excluded from Vite watching and ESLint. Production proxies must support unbuffered SSE and release disconnected upstream requests; persisted polling remains available if streaming is blocked.

## Sound

Sound is browser-only and disabled by default. Users can enable, mute or preview it in notification history. Preferences persist through the existing preference service. Web Audio unlock/resume requires user interaction; suspended or unsupported contexts fail safely. Initial history and repeated/reconnected snapshots do not replay old notification sounds. Only newly observed unread new-ticket/assignment events produce their corresponding sounds, subject to the user's settings. No browser notification permission is requested and no audio setting affects server notification persistence.

## Verification

Run npm run lint, npm run build, npm run verify:api-assets-notifications and npm run verify:assets-notifications-browser. Existing authentication, employee, engineer, manager and mock regression suites also remain available. Live tests use the already configured backend/.env.fresh.test database and fictional fixtures only, then remove their own records; no administrator password is needed.

The live suite verifies employee asset denial, quantities, create/edit validation, stale updates, immutable withdrawn fields, batch withdrawal identity/history, manager-only archive, filtered Arabic RTL XLSX contents, poisoned localStorage exclusion, SSE delivery, forced polling fallback, reconnect refresh, recipient/read isolation, read persistence, account changes, sound opt-in, session revocation, Arabic RTL/mobile/tablet/desktop overflow and light/dark themes. Screenshots are ignored under artifacts.local. When C: has no temporary space, set TEMP/TMP to a writable D: workspace temporary directory and run the node scripts directly.

The existing backend asset/notification migrations and runtime grants must already be applied before these modules are used against development data. The frontend does not apply database migrations. Production HTTPS/proxy setup and private real-account provisioning remain deployment tasks.
