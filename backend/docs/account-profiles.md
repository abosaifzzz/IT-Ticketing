# Account profiles and account-based ticket reporters

This contract supersedes ordinary-employee directory selection in ticket creation and extends migration 017 onboarding. Historical tickets, reference labels, UUIDs and IT-number references are preserved. The supplied MiAdmin roster was imported on 2026-11-17: 342 accounts, excluding four duplicate-username rows at the owner's request. See [the import record](miadmin-import.md). Backend-only implementation; frontend integration is a separate task.

## Schema and migration

Migration `018_account_profiles.sql` adds `users.phone`, `must_complete_profile`, `profile_completed_at`, import provenance, `user_departments` (unique user/department membership), a reviewed import ledger, and ticket reporter account/username/phone snapshots. Existing operational accounts must complete their profiles on their next sign-in; their existing passwords are **not** reset. Admins retain their existing strong-password policy and independent permissions. Existing departments remain available, including departments previously created by the old workbook import. Historical contact details are not guessed or backfilled.

From `backend/`, use the private workflow:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\migrate-local-db.ps1
```

The workflow applies migrations twice, verifies checksums and grants access to the new tables. The runtime account can replace user/department memberships, insert import receipts, and retire directory entries; immutable audit and import-ledger tables remain SELECT/INSERT only. The owner confirmed migration 018 completion locally. No database password is needed in chat.

## Authentication and onboarding

New username-based operational accounts and reviewed roster imports start with the requested initial password `123`, stored only as independently salted Argon2id hashes. They have both `mustChangePassword` and `mustCompleteProfile` set. Existing email login remains supported. A shared initial password can be claimed by someone who knows an unused username before the intended user does; distribute usernames privately and complete onboarding promptly. Unique expiring invitations remain a future improvement.

`POST /api/auth/login` accepts `{username,password}` or the existing `{email,password}`, never both. It and `GET /api/auth/me` return `{user:{id,username,name,role,roleLabel,mustChangePassword,mustCompleteProfile}}`. Tokens remain in HttpOnly cookies, never JSON/browser storage. The canonical engineer identifier remains `technician`; Admin role-input APIs also accept `engineer` as an alias.

If either setup flag is true, the session cannot use operational or Admin APIs. The backend returns 403 with `PASSWORD_CHANGE_REQUIRED` or `PROFILE_SETUP_REQUIRED`. Allowed authenticated setup endpoints:

| Endpoint | Request / response |
| --- | --- |
| GET `/api/auth/setup-options` | `{items:[{id,name}]}` containing active departments only |
| GET `/api/auth/profile` | `{item:{id,username,fullName,role,phone,departmentIds,departments,mustCompleteProfile,profileCompletedAt}}`; departments include `isActive` |
| POST `/api/auth/complete-setup` | `{currentPassword,newPassword,phone,departmentIds:[UUID,...]}` |
| POST `/api/auth/logout` | Clear session cookie |
| POST `/api/auth/logout-all` | Revoke all account sessions |

Setup validates the current password and requires a different non-empty new password, phone and 1–100 distinct active department IDs. Phone accepts an optional leading `+`, ASCII digits and spaces/parentheses/hyphens, with 7–15 digits and a 32-character cap. Password processing keeps the existing 1024-byte bound; Admin passwords retain the 16-character minimum. No account ID or role is accepted in setup. The credential/profile/membership update, sanitized audit event and session revocation are one transaction. Inactive accounts, stale credentials, duplicate departments and inactive/unknown departments are rejected without partial changes. A successful response is `{changed:true,setupCompleted:true,loginRequired:true}` and clears the cookie. Sign in again with the new password.

Existing operational accounts marked for profile completion also use this setup flow with their **current existing password**, then choose a new one; they do not suddenly acquire the initial password. A password-only `/api/auth/change-password` request cannot bypass mandatory profile setup. After profile completion, the existing password-change and reset flows remain usable. A temporary reset preserves a completed phone/department profile while requiring a password change.

Completed users may update their own contact/memberships through `PATCH /api/auth/profile` with `{phone,departmentIds}`. Supply the complete profile pair. Identity and role fields cannot be edited through this route. The endpoint validates active departments and records a sanitized audit event; it does not rewrite ticket snapshots.

## Admin user management

Existing `/api/admin/users` list/search/pagination and detail endpoints now include username, fullName, phone, departmentIds/departments, setup flags, passwordStatus, activity and last-login data. Passwords/hashes are never returned.

- `POST /api/admin/users`: `{username,fullName,role,email?}`. For employee/engineer/manager identities, username onboarding is active and requires password/profile setup. `engineer` normalizes to `technician`. Admin creation remains inactive/unprovisioned until its strong password is privately provisioned; it never receives the shared weak initial password. Legacy email-only creation remains an inactive/protected provisioning path.
- `PATCH /api/admin/users/:id`: any of `fullName`, `username`, `isActive`, and the complete pair `phone,departmentIds`. Profile edits validate memberships and mark the saved profile complete; password-change requirements remain. Username, activity and profile changes revoke existing sessions. The last active Admin protection remains enforced.
- Role changes: `POST /api/admin/users/:id/role-change` with `{role,reason,adminPassword?}` returns 200 and the updated account immediately after recent Admin reauthentication. `admin`, `manager`, `engineer`/`technician`, `employee` are supported. Promotion to Admin requires a new strong `adminPassword`; other role changes must omit it. The backend blocks self-role changes and loss of the last active Admin, audits the actor and revokes target sessions. Admin password recovery remains protected; Admin never inherits operational permissions.
- Existing temporary operational resets and protected Admin recovery remain as documented in [the password contract](first-login-password.md).

Admin and operational permissions remain independent. Managers/engineers cannot call these Admin APIs or change arbitrary user profiles. Existing Manager IT-staff management remains limited to its original operational roles and fields.

## Employee ticket creation

`POST /api/tickets` derives ordinary portal reporter identity exclusively from the active authenticated **employee** account and its saved profile. Send normal category/subcategory, title/description and optional request ID; omit any employee/name selection:

```json
{"categoryId":"UUID","subcategoryId":"UUID","title":"Short description","description":"Problem details","clientRequestId":"caller-retained-unique-key"}
```

- One **active** assigned department: omit departmentId; the backend selects it.
- Multiple active departments: send `departmentId` belonging to that account. Missing, inactive or unrelated selections fail with 400.
- No active memberships or missing contact profile: reject creation until corrected.
- `createdFor` is `self`; employee-created `other` mode is retired. Employees cannot submit `reporterUserId`, ownership or creator fields.
- Old descriptive `reporterName`, `employeeNumber` and directory-selection inputs are ignored for ordinary account-backed reporter identity. They cannot override name, phone, username or ownership. They are accepted only as harmless compatibility input while the frontend is migrated. Do not continue sending them in the new UI.
- Category/subcategory validation, assignment scope, ticket lifecycle, notes, history, notifications and request-key retry behavior remain unchanged. An exact retry keeps the original snapshot after profile/reference changes.

Ticket DTOs now include `reporterUserId`, `reporterUsername` and `reporterPhone` alongside `reporterName`, departmentId/department and existing reporterAccountId. These are immutable snapshots taken during creation, not joins to mutable profile values. IT lists/details/unassigned summaries expose them; IT search also matches username and phone. Historical tickets may have null contact fields, and must render an honest unavailable value.

## IT tickets on behalf of employees

Engineers and Managers use `GET /api/user-options?search=&page=1`, returning `{items,total,page,pageSize}` (25 per page). Search matches username/full name. Items are active **employee login accounts** with phone, completed profile and at least one active department, including their departments and active flags. Incomplete/inactive accounts and Admin/IT identities are excluded; Employees/Admins cannot access this lookup. The legacy employee directory is not its source.

Create an ordinary manual ticket with the selected account's UUID:

```json
{"reporterUserId":"EMPLOYEE_USER_UUID","departmentId":"ASSIGNED_DEPARTMENT_UUID","categoryId":"UUID","title":"Short description","description":"Details","clientRequestId":"unique-key"}
```

After migration 019, account-selected manual employee tickets belong to the selected employee and appear in its account-scoped list. The authenticated IT creator remains separate. Existing explicitly linked manual tickets are backfilled; historical name-only and senior-management tickets remain unowned. User options include incomplete and disabled employee accounts with activity/setup flags; disabled accounts cannot receive new tickets. Existing active department memberships constrain selection; if none exist yet, IT must select an active department. Saved phone remains authoritative; if absent, optional `reporterPhone` supplies a ticket-only snapshot without completing or changing the employee profile. Optional initial engineer assignment remains Manager-only.

The separate existing senior-management manual workflow (`requesterType:top_management`, manual name/position, no department) remains compatible. Such requests have no selected employee account and therefore no invented username/phone. Historical and senior-management exceptions must not be presented as complete account profiles.

## Reviewed roster replacement

The new source must contain exactly `username` and `fullName`. Supported file formats: CSV with those headers, JSON array of objects, or XLSX columns A/B with those headers. The supplied MiAdmin workbook header pair (Arabic username header and `Full Name`) is also supported. Internal spaces in usernames are preserved; surrounding whitespace and case are normalized. Workbook formulas/macros are rejected and source/expanded sizes are bounded. Duplicate normalized usernames, invalid rows and existing unrelated login identities stop the whole import. No department or role is inferred from a name. Imported users are `employee`; later roles are assigned through Admin management.

After receiving the file, dry-run from `backend/`:

```powershell
npm run users:import -- --file "<new file.xlsx>" --actor-id "<active Admin UUID>" --retire-directory-receipt ".\artifacts.local\employee-roster-import.local"
```

The receipt must be the completed receipt from the **original** directory import. It identifies exact imported rows and their original creator. A missing/mismatched receipt stops retirement; manually added directory records are preserved. Review the count-only plan and source checksum, then apply the exact reviewed file:

```powershell
npm run users:import -- --file "<new file.xlsx>" --actor-id "<active Admin UUID>" --retire-directory-receipt ".\artifacts.local\employee-roster-import.local" --apply --expected-sha256 "<reviewed SHA-256>"
```

This restricted local-development command uses the ignored environment connection, requires an active Admin with current user create/update permissions, and prints counts/checksum only. It creates users and retires mapped old directory rows atomically under the administration guard. Old directory rows become inactive and disappear from active lookups; they are **not physically deleted**, because existing custody/history may reference them. Existing departments, unrelated login accounts, manually added directory entries, tickets and asset custody remain untouched. Mapping historical directory-based asset custody to new login accounts requires deliberate later review, not name-based guessing.

Same-file re-runs do not duplicate users or reset changed passwords/profiles. Import provenance is verified before treating a username as already imported; unrelated matches require deliberate mapping. The applied MiAdmin import uses the explicitly reviewed subset recorded in the private receipt; the original workbook still contains the four excluded rows and must not be blindly re-imported.

## Checks and frontend handoff

Commands: `npm run lint`, `npm test`, `npm run test:integration`; focused profile integration: `npm run test:integration:profiles`. The live suite uses the designated test database and fictional accounts only. Established workflow test fixtures explicitly seed completed profiles; legacy report fixtures retain historical labels to verify compatibility. New tests exercise setup atomicity, validation/CSRF, refresh restrictions, session revocation, account identity, one/multiple department rules, IT lookup/creation authorization, snapshots, Admin edits/role alias requests, and transactional/retried roster retirement.

The complete separate implementation prompt is [frontend-account-profiles-prompt.md](frontend-account-profiles-prompt.md). It has not been executed. Existing frontend directory selectors and password-only onboarding need that migration before the new flow can be used normally. Local tests are not a production-readiness claim.

Verified locally on 2026-11-17 after the operator confirmed migration 018: lint passed, 48/48 unit tests passed, and the complete live-database suite passed 137/137 (including eight profile/roster integration cases). Tests also cover CSV/JSON/XLSX readers, formula rejection, concurrent setup, inactive selected employees and cross-path legacy username collisions. The real replacement roster and directory retirement remain pending the new source file; no development users were imported, reset or removed during verification. No frontend files were changed or browser-tested.
