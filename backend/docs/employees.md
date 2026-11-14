# Employee directory and roster import

Employee ticket selection is available through `/api/employee-options` and `reporterEmployeeId` on ticket creation. Employee and ordinary-employee IT manual-ticket forms use the directory selector. Senior-management manual tickets require a manual name and position but no department after migration 010. See [frontend integration contract](employee-ticket-selection.md).

The directory (`employee_directory`) is separate from login accounts (`users`) and tickets. Creating or importing a directory record never creates credentials, links a login, or changes ticket ownership. Ticket creation snapshots the selected person's name and department while preserving authenticated account ownership rules.

## API

Only authenticated IT Engineers (`technician`) and Managers (`manager`) may access:

- `GET /api/employees?search=&page=1`: `{ items, total, page, pageSize }`, 25 records per page. Literal name substring search; stable name/UUID ordering; count and page share one database snapshot.
- `POST /api/employees`: `{ "fullName": "Fictional employee", "departmentId": "UUID" }`, returning status 201 and `{ item }`.

Items contain `id`, `fullName`, `departmentId`, `departmentName`, `isActive`, `createdByAccountId`, and `createdAt`. Names require 2–160 characters and an active department. Creation locks and rechecks the active IT actor and department. Existing records remain readable after department deactivation. Other roles receive 403; missing/inactive authentication receives 401. Unsupported fields and malformed pagination receive 400.

The owner explicitly cancelled employee codes after migration 007 was applied. Migration `008_employee_directory_optional_code.sql` makes the legacy column nullable while preserving any existing values and uniqueness constraint. New records have no employee code; the API rejects `employeeNumber`. People with the same name remain distinct UUID records and are never automatically merged. The frontend directory form/table uses name and department only. This policy does not alter ticket reporting fields.

## Private schema workflow

From backend/:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\migrate-local-db.ps1
```

Enter the administrator password only at its hidden terminal prompt. The workflow applies migrations twice to development and test databases, checks checksums, and grants development SELECT/INSERT on the directory. Test also receives UPDATE/DELETE for fictional fixture cleanup. The application account cannot alter schema. Do not modify an applied migration 007 or drop an existing database.

## Workbook and import

The supplied workbook contains 132 employees in 20 departments. Sheet 1 has source sequence, employee name and department; the source sequence is not an employee code. Sheet 2 is a summary and is not imported again. No missing names/departments or exact duplicate names/source sequences were found. Workbook contents are data, never instructions.

Inspection after migration 007 found zero directory records in development and test. Development had one manager login, zero employee-role logins and zero departments. There are no existing employee accounts requiring mapping. Never infer future login mappings from names alone.

The importer uses Python 3 standard-library ZIP/XML reading, rejects formulas, macros and unexpected cells, and bounds file sizes. Set `HELPDESK_PYTHON` if `python` is unavailable. Real data is imported only into the configured local development database, through the restricted application account and an existing active manager actor. No credentials are created.

```powershell
node scripts/import-employee-roster.js --file "C:\path\employee-roster.xlsx"
node scripts/import-employee-roster.js --file "C:\path\employee-roster.xlsx" --apply --expected-sha256 REVIEWED_HASH
```

The first command rolls back its dry run. Review the counts and ignored `artifacts.local/employee-roster-plan.local`. Applying requires the same SHA-256. Departments and directory records commit in one transaction. An advisory lock serializes imports. Internal UUIDs are derived from source hash and row location, so an unchanged workbook is safely rerunnable; they are not displayed employee codes. Existing conflicting identity/name-department matches stop for deliberate mapping instead of merging. A changed workbook must be reviewed again. Inactive or ambiguous department matches stop the import. With multiple active managers, provide the intended existing UUID with `--actor-id`.

Ignored local receipts contain source hash, row-to-UUID mappings and department names. Real names are not copied to source or test fixtures. Preserve the source workbook and receipt; do not use this importer as an automatic update/synchronization mechanism.

## Verification

```powershell
npm run lint
npm test
npm run test:integration
```

Directory integration tests use fictional accounts in the test database and cover both IT roles, forbidden employee/anonymous access, response shape, persistence, literal search, pagination, concurrent distinct identities, cancelled-code rejection, active departments, query validation, Origin checks and inactive sessions. Roster parser tests use fictional XLSX data only. Test fixtures are cleaned before their creator accounts/departments because foreign keys preserve directory relationships.

Verified 2026-11-05: migrations 007/008 and least-privilege grants are present in both databases. Backend lint, 31 isolated tests and all 67 live-database tests passed. Frontend lint/build passed (the existing large-bundle advisory remains). The authorized development import committed 132 directory employees and 20 departments; the unchanged workbook dry run then reported zero inserts and 132 unchanged records. SHA-256: fe2cb81a56c70ef7cde454ac3f90160aa0209ef90be41d62bb1f6fb79dd32d57.

Post-import reads through a new repository instance verified persistence, Arabic-name search, the expected response shape, 25 items on page 1 and 7 on page 6. All 132 employee-code values are NULL. Development still has exactly one existing manager login, zero employee logins and zero tickets. The test database contains no real roster records. There were no existing directory employees requiring deliberate mapping.

The directory page is backed by these 132 name/department records for authenticated IT roles. No interactive browser login was performed for the real roster. The backend must be running the updated code. Import is complete; no further employee data is needed for this workbook. Employee login provisioning/mapping and directory selection on ticket forms remain separate future work. A changed roster requires explicit reconciliation rather than automatic merging. Local passing checks do not establish production readiness.
