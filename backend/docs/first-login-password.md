# Username onboarding and mandatory password change

Migration 018 extends this flow with required phone and one/multiple departments. Read [the current account-profile contract](account-profiles.md) and [the updated standalone frontend prompt](frontend-account-profiles-prompt.md) before implementing onboarding. Password-only setup cannot bypass a required profile.

Migration 017 preserves existing accounts, adds a unique nullable username and mandatory-change flag, and permits a username-based account without an email address. Existing users keep their passwords and are not automatically reset. Employee-directory records are not login accounts. No supplied roster has been imported by this change.

New operational accounts can be created by a recently authenticated Admin:

```http
POST /api/admin/users
Content-Type: application/json

{"username":"fictional.employee","fullName":"Fictional Employee","role":"employee"}
```

The backend creates an active local account, hashes the requested initial password `123` using Argon2id with a per-account salt, and sets `mustChangePassword=true`. Allowed usernames are 1–100 ASCII letters/digits/dots/underscores/hyphens/internal spaces, starting with a letter or digit, normalized to lowercase. They cannot contain `@`, preventing ambiguity with existing email identities. Employee is the role to use for a later username/name roster unless explicitly specified otherwise. Optional email remains supported. Duplicate usernames are rejected with 409. Username-based Admin creation remains inactive and unprovisioned; use the existing private strong-password setup. Legacy email-only API creation retains its inactive/unprovisioned behavior.

Login: `POST /api/auth/login` with `{ "username": "fictional.employee", "password": "123" }`. Existing `{email,password}` requests still work; do not submit both identifiers. Login and `GET /api/auth/me` return `{ user }`, including `user.mustChangePassword`. Session tokens stay in HttpOnly cookies.

Mandatory-change sessions can restore their identity, change their password, or log out. All other application API calls receive 403 `{ error, code: "PASSWORD_CHANGE_REQUIRED" }`; individual session-based guards also reject restricted sessions. Refreshing or manually navigating to a dashboard cannot bypass this restriction. Existing inactive-account and origin checks remain enforced.

```http
POST /api/auth/change-password
Content-Type: application/json

{"currentPassword":"123","newPassword":"a-user-chosen-password"}
```

The endpoint also supports voluntary password changes for an established session. It requires the current password, rejects reuse and `123`, preserves the existing non-empty/1024-byte operational password policy, and preserves the stronger Admin policy. It uses the replaceable local provider's password-change capability. A successful transaction updates the Argon2id hash, clears the mandatory flag, records a sanitized audit event and revokes **all** account sessions. Response: `{ "changed": true, "loginRequired": true }`; cookie is cleared. Sign in again using the new password. Concurrent reset/change operations compare locked credential state, preventing stale writes. No passwords are stored or returned in plaintext.

## Admin user page and reset

`GET /api/admin/users?search=&page=1` returns `{items,total,page,pageSize}`. Items include username, email if present, fullName, role, activity, lastLoginAt, `mustChangePassword`, `provisioningRequired` and `passwordStatus`: `NOT_PROVISIONED`, `CHANGE_REQUIRED` or `SET`. Neither hashes nor current passwords are returned. A list of readable stored passwords is deliberately unavailable because hashes cannot reveal them.

For an employee, engineer (`technician`) or manager:

```http
POST /api/admin/users/:id/reset-temporary-password
Content-Type: application/json

{}
```

Requires `admin.users.reset_password`, recent Admin authentication, the configured Origin and existing rate limits. It resets to the initial `123`, marks mandatory change, revokes sessions and records the actual Admin actor. Response: `{item:{id,mustChangePassword:true,sessionsRevoked:true}}`. Account activity is unchanged, so inactive accounts remain unable to log in. Admin targets and external-provider accounts are rejected; use existing protected out-of-band `/password-reset` recovery for Admins. Role-change protections and operational permissions are unchanged.

Because a shared initial password is known, distribute newly activated usernames privately and complete onboarding promptly. Mandatory change does not prevent someone who knows an unused username and the initial password from claiming the account first. A future unique expiring invitation flow would address that limitation.

## Setup and verification

Run from `backend/`, entering administrator credentials only in the terminal's private prompt:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\migrate-local-db.ps1
npm run lint
npm test
npm run test:integration
```

Focused real-database test: `npm run test:integration:first-login`. It checks hashed temporary credentials, duplicate usernames, account listing, login/refresh restrictions, wrong/reused password rejection, password replacement and session invalidation, Admin reset, inactive accounts and role restrictions. Uses fictional test accounts only.

Verified locally on 2026-11-17 after private migration completion: lint passed, 47/47 unit tests passed, 3/3 focused first-login database tests passed and the final complete database suite passed 129/129. The initial full run identified an obsolete strict login-response assertion; it was updated to require the new `mustChangePassword` field before the successful full rerun. Existing development accounts were not reset and no roster was imported. Frontend behavior has not been implemented or browser-tested in this backend-only change.

## Frontend implementation prompt

Work only in `frontend/`. Read `../AGENTS.md`, `../backend/docs/first-login-password.md` and the existing authentication/Admin interfaces first. Extend the existing UI; preserve Arabic RTL, routes, branding, responsive layouts and both themes.

1. Support username login through the existing auth service and credentialed HTTP client. Preserve existing email login. Consume `user.mustChangePassword` from both login and session restoration. Never store passwords or tokens in browser storage.
2. When that flag is true, route to a required Arabic password-change screen before any role dashboard or feature query. Keep logout available. Handle `PASSWORD_CHANGE_REQUIRED` centrally and consistently after refresh/direct navigation.
3. Submit current/new password to `POST /api/auth/change-password`; include a local confirmation field but do not send it. Never send a role/account ID. Require matching non-empty new values different from the initial/current password; apply stronger existing Admin rules where appropriate. On success clear session state and return to login, since all sessions were revoked. Handle errors without exposing credentials.
4. Extend the Admin users page with username, name, role, activity, last login and password status. Never add a current-password/hash column. Allow username-based operational account creation using the documented payload; show that the temporary password is `123` and must be changed. Preserve the protected strong-password flow for Admin accounts.
5. Add a confirmed reset action for operational accounts using `POST /api/admin/users/:id/reset-temporary-password` with `{}`. Refresh status after server success. Preserve account activity. Handle recent-reauthentication requirements and retry only after successful reauthentication. Admin-account recovery stays on the existing protected request workflow.
6. Do not import employee-directory records as users, invent account mappings or import a roster yet. The owner will provide usernames/names separately; roles require explicit policy. Preserve existing permission boundaries and keep the Admin portal operationally separate.
7. Test first login, refresh/direct-route enforcement, password change and re-login, Admin reset/session invalidation, inactive accounts, duplicate usernames, all role boundaries, Arabic loading/error states and both themes. Run frontend lint/build. Report what was actually verified.
