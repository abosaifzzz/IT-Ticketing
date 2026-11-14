# API authentication transition

API authentication is the default. Use Node 20+, start the backend, then run npm run dev in frontend/. Vite serves http://localhost:5173 with a same-origin /api proxy to http://127.0.0.1:3001. Backend APP_ORIGIN must match the browser origin exactly. The development port is strict to avoid silently breaking origin checks.

Copy .env.example to an ignored .env.local only if configuration changes are needed:
- VITE_AUTH_MODE=api
- VITE_API_BASE_URL=/api (same-origin path only)
- API_PROXY_TARGET=http://127.0.0.1:3001

For an explicit fictional-data development session, set VITE_AUTH_MODE=mock and run npm run dev. Restart Vite after changing modes. Production builds reject non-API auth configuration; production provider selection cannot load mock authentication. There is no automatic network-error or invalid-credentials fallback. Existing mock sessions are ignored in API mode.

Deploy frontend and API under the same origin, with /api forwarded to the backend and matching APP_ORIGIN. Vite's development proxy does not configure production hosting. Use HTTPS in production so the backend's Secure __Host- session cookie works.

The HTTP client always includes cookie credentials, suppresses caches, uses bounded timeouts and cancellation, accepts JSON only, and exposes consistent Arabic HttpError messages/status/code. It does not automatically retry mutations. Backend error details/HTML are not displayed. Authenticated 401 responses invalidate the React session; login/restoration handle their expected 401s separately.

authService retains login, restoreSession and logout. restoreSession may now be asynchronous. API sessions contain only allowlisted user identity and the provider/role in memory. Passwords exist only in the login form/request and clear on successful login. No token or API session is read from or written to localStorage. Browser theme and explicitly selected mock sessions retain their existing preference/demo storage behavior.

React waits for /auth/me before route redirects. Loading and restore-failure/retry views prevent a flash of the wrong portal. Role checks apply after identity restoration; unauthorized routes go to /unauthorized. Re-focusing a tab revalidates server identity. Stale restoration responses cannot overwrite a newer login/logout. Logout waits for the server; on network/server failure it keeps the signed-in view with an error and retry control.

Employee ticket pages are now migrated too; see EMPLOYEE_API.md. Engineer workflows are also migrated; see ENGINEER_API.md. Manager workflows and server reports are also connected; see MANAGER_API.md. Shared inventory, notification history and the live bell are now connected; see ASSETS_NOTIFICATIONS_API.md. For those unmigrated routes in API mode, ProtectedRoute blocks their layouts and descendants from mounting and shows ApiFeatureBoundary with the authenticated identity, existing navigation paths, theme control, logo and logout. No demo ticket/notification data is shown. The mock notification event service is initialized only in explicit mock mode.

When migrating each feature later, replace its mock dependencies (including shared layouts/header notifications) and only then mark its protected boundary apiReady. Do not mark an entire portal ready while descendants still use mock services. No routes, business features or cancelled modules were added or removed in this step.

Verification:
- npm run lint
- npm run build
- npm run verify:api-auth (provider, HTTP errors, cancellation, cookie options, storage exclusion and role policy)
- npm run verify:api-browser (headless Chrome against real backend authentication and fictional accounts in backend/.env.fresh.test; needs backend dependencies and the already prepared fresh test DB)
- npm run verify:auth and npm run verify:e2e (explicit mock-provider regression checks)

Browser verification uses an isolated temporary profile, checks all three roles, server-cookie refresh, protected/unauthorized redirects, logout, mobile overflow, persisted theme, invalid login, restoration retry and logout failure. It never prints passwords/cookies and removes only its own fictional DB accounts. The browser script assumes the standard Windows Chrome path. It does not require another administrator login.

The business page integrations, shared API notification bell and history are now connected. Remaining deployment work: configure the production same-origin reverse proxy/HTTPS and provision real application accounts privately using the backend tooling. No real credentials or demo roster is displayed or autofilled on the login page.


Production credential isolation is enforced by Vite build aliases plus productionGuard and verify-production.mjs. Original demoCredentials/mockAuthProvider modules and known demo password values are rejected from production chunks. Normal API development also avoids loading demo credentials. The explicit mock provider remains available to isolated tests and explicit Vite development mock mode. See ../LOCAL_VERIFICATION.md for the complete verified workflow and deployment limits.
