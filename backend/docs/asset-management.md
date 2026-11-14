# Comprehensive asset-management API

The preferred simple asset/type/group/custody API is now `/api/asset-management/simple`. See [the simple API contract](simple-assets.md). Existing endpoints remain for compatibility; complex ledger, QR, approval and advanced-report workflows are not required by the simple module.

This extends the existing Node/Express/MySQL backend. Migration `012_comprehensive_assets.sql` is applied locally to development and test. Existing `/api/assets` quantity APIs and ticket withdrawals remain operational; new functionality is under `/api/asset-management`. Frontend files were not changed. This request explicitly authorizes asset categories and asset-specific maintenance; it does not restore the cancelled unrelated manual-maintenance module, ratings, computer specifications or ticket priority.

## Authentication, permissions and common contract

Use existing HttpOnly session cookies with `credentials: 'include'`. Every write requires the exact configured Origin and a `clientRequestId` string of 1–128 ASCII letters/digits/underscore/hyphen. A retry with the same actor/key/operation/body returns the stored result without repeating stock, movements or notifications. Reusing a key for different data returns 409. The frontend must retain the key after an uncertain response, and change it only when submitting a different operation. All API paths below include the base `/api/asset-management`.

Employees have no access to this module, including attachments. Authenticated active IT Engineers (`technician`) and Managers (`manager`) have identical full access through the shared `src/assets/permissions.js` policy. All routes and transactional writes enforce it, including type/location administration, serial policies, retirement, adjustments, approvals/imports, corrections, legacy conversion, maintenance and reports/exports. Either IT role may manage maintenance assigned to another engineer and link an existing ticket through the asset APIs. Ticket API authorization and lifecycle permissions remain unchanged. Audit and movement entries record the actual acting account, without role substitution.

GET lists return `{ items, total, page, pageSize }`. Default page=1/pageSize=25; maximum pageSize=100 and page=1000000. Write and detail responses are `{ item }`; POST returns 201 including safe replays, PATCH 200. Dashboard returns its aggregate object directly. Persisted rows use the snake_case column names documented below; request fields and pagination use camelCase. UUIDs identify database records; `asset_tag` is the permanent physical label such as PC-0001. Never derive permission or account ownership from an employee directory name.

Error envelope remains `{ error: message }`. 400: missing/unsupported fields, invalid IDs/types/enums, inappropriate serial/condition or malformed import. 401: absent/expired/inactive session. 403: role authorization or Origin rejection. 404: unknown reference. 409: duplicate serial/prefix/name, stale inventory snapshot, conflicting current custody/workstation, insufficient unreserved stock, already finalized job/session, reused request key, or retryable lock conflict. 503: missing configured PDF font. Client-facing errors must be handled by the existing centralized HTTP client. Raw SQL, credentials, file contents and stack traces are not returned.

## Values and identity rules

- `technicalCondition`: GOOD, FAULTY, UNDER_INSPECTION, UNREPAIRABLE.
- `operationalStatus`: AVAILABLE, IN_USE, RESERVED, IN_MAINTENANCE, RETIRED.
- `custodianType`: employee, department, none.
- GOOD/AVAILABLE/unassigned/unlinked assets are available spares. FAULTY, UNDER_INSPECTION, UNREPAIRABLE, RESERVED, IN_MAINTENANCE and RETIRED assets are excluded. Conditions and statuses are separate fields.
- Seeded categories: PC cases/PC; Monitors/MON; Keyboards/KB; Mice/MS; Printers/PR; Scanners/SC; Label printers/LB. Only PC cases require/accept a serial. Serial uniqueness uses NFKC, trimming, uppercase and removal of whitespace. Category prefixes and serials cannot be changed by generic metadata editing. Prefixes match `[A-Z][A-Z0-9]{0,11}`.
- PC/monitor/printer/scanner/label categories are INDIVIDUAL; keyboard/mouse categories are CONFIGURABLE and permit separate individual or quantity catalogue records. QUANTITY categories reject individual creation. Individual-only categories reject stock catalogue creation.
- Category row counters lock in the creation transaction and issue minimum-four-digit numbers, growing beyond 9999 without truncation. No fake individual asset is created for quantity stock. No CPU/RAM/disk/OS/IP/hostname fields are accepted.
- Text generally max 160 characters, notes/action/issue max 4000 and reasons max 2000; dates are ISO calendar days. Quantities are positive integers up to 1000000 per transaction (count may be zero), balances never negative and reserved never exceeds quantity. Monetary cost is an optional nonnegative decimal **string**, at most 12 digits before and 2 after the decimal.

## Read endpoints and filters

All support page/pageSize. Date filters `from`/`to` are inclusive calendar dates on the event/registration date for dated collections. Sending date filters to a collection without a timestamp returns 400. Search is a literal substring, not SQL wildcard syntax.

| GET path | Additional filters | Item fields / date basis |
| --- | --- | --- |
| `/categories` | search, activeOnly=true/false | id,name,prefix,requires_serial,tracking,is_active,created_at |
| `/locations` | search, activeOnly | id,name,kind,parent_id,department_id,is_active; no date filter |
| `/assets` | search,categoryId,locationId,departmentId,employeeId,workstationId,technicalCondition,operationalStatus,availableOnly | individual asset fields below; created_at |
| `/items` | search,categoryId,activeOnly | id,category_id,name,brand,model,minimum_stock,is_active; no date filter |
| `/stock/balances` | itemId,locationId,technicalCondition | item_id,location_id,technical_condition,quantity,reserved; no date filter |
| `/stock/transactions` | itemId,locationId,type,ticketId | id,movement_id,item_id,location_id,destination_id,technical_condition,quantity_delta,reserved_delta,result_quantity,result_reserved,created_at,actor_id,type,reason,ticket_id; movement date |
| `/ticket-links` | ticketId,assetId | ticket_id,asset_id,actor_id,created_at; created_at |
| `/movements` | assetId,itemId,type,ticketId | movement fields below; created_at |
| `/custody` | assetId,employeeId,departmentId,acknowledgement,currentOnly | custody fields below; issued_at; currentOnly=false includes ended custody |
| `/workstations` | search,locationId,departmentId,employeeId,activeOnly | id,name,location_id,department_id,employee_id,is_active,version; no date filter |
| `/maintenance` | assetId,status,engineerId | maintenance fields below; created_at |
| `/replacements` | ticketId | id,old_asset_id,new_asset_id,reason,ticket_id,actor_id,created_at |
| `/inventory-sessions` | search,locationId,departmentId,categoryId,status | session fields below; created_at |
| `/inventory-discrepancies` | sessionId,decision,discrepancy | entry fields below; session creation date; excludes NONE |
| `/audit` | none beyond pagination/dates | id,entity_type,entity_id,action,actor_id,before_data,after_data,created_at |
| `/legacy-assets` | search | original quantity records, including archived; created_at |

`GET /assets/:id`: asset plus movements, custody, maintenance, workstationHistory, tickets, safe attachment metadata, asset audit and authenticated QR payload/lookupUrl. Converted individuals also include legacyAssetId and legacyHistory. `GET /lookup/:assetTag` returns the same protected detail. QR contains the tag/lookup URL, no credentials or public sensitive data.

`GET /items/:id`: catalogue metadata with current balances and transaction history. `GET /replacements/:id`: operation plus both linked movements.

`GET /workstations/:id`: row plus current components and complete association history. `GET /maintenance/:id`: job plus immutable history/audit and attachment metadata. `GET /custody/:id`: assignment plus printable `receipt` data with asset label, employee name, department, issuing/acknowledging user IDs and dates. This is data for a frontend printable receipt; it does not assert that the directory person has an authenticated login.

`GET /inventory-sessions/:id`: session plus entries, staged initialRows, expected/counted completion and per-location progress. `GET /dashboard`: individual condition/status buckets, stock condition buckets/reserved totals, availableIndividualSpares, lowStock items and unconvertedLegacy record/unit totals. Converted legacy records are archived and excluded from old active totals so inventory is not double counted.

## Asset/category/location/catalogue writes

Every request includes clientRequestId. Fields marked optional may be omitted; unspecified optional strings become empty. Unknown fields are rejected, including technical specification fields.

| Method/path | Request fields | Result / permission |
| --- | --- | --- |
| POST `/categories` | name,prefix,tracking (INDIVIDUAL/QUANTITY/CONFIGURABLE) | category + initialized sequence; either IT role |
| PATCH `/categories/:id` | name,isActive (default true) | category; either IT role; identity/prefix/tracking immutable |
| POST `/locations` | name; optional kind=LOCATION or WAREHOUSE,parentId,departmentId | location; either IT role; parent must be an active warehouse, warehouse cannot have a parent |
| PATCH `/locations/:id` | name,isActive | location; either IT role; no implicit relocation |
| POST `/assets` | categoryId,locationId; optional brand,model,serialNumber,technicalCondition=GOOD,operationalStatus=AVAILABLE,custodianType=none,employeeId,departmentId,receivedDate,supplier,notes | individual asset; IT. Initial IN_USE requires custody; AVAILABLE requires GOOD/unassigned. RESERVED supports initial faulty stock. Initial RETIRED allows either IT role. IN_MAINTENANCE must use a maintenance job |
| PATCH `/assets/:id` | optional brand,model,supplier,receivedDate,notes | metadata only; IT. Omitted metadata values use empty/null defaults, so submit the intended complete metadata form. Cannot change tag, category, serial, condition, state, owner, location or workstation |
| POST `/items` | categoryId,name; optional brand,model,minimumStock=0 | quantity catalogue item, no units fabricated; IT |
| PATCH `/items/:id` | minimumStock,isActive | catalogue thresholds/activity; either IT role |

Individual row fields: id,asset_tag,category_id,brand,model,serial_number,serial_key,technical_condition,operational_status,location_id,department_id,custodian_type,employee_id,workstation_id,received_date,supplier,notes,version,created_at,updated_at. Treat serial_key as normalized server data, not an editable field. Active references are checked under shared locks. Employee custody derives department from the directory and rejects mismatches.

## Movements, custody and quantity stock

`POST /assets/:id/movements` accepts type,reason; optional locationId,custodianType=none,employeeId,departmentId,ticketId,technicalCondition. Result is the updated asset. Supported types:

- ISSUE: GOOD/AVAILABLE unassigned asset only; requires destination and employee/department custodian. Creates PENDING custody.
- RETURN: current deployed asset, destination required; ends custody. Good becomes AVAILABLE; faulty becomes RESERVED.
- TRANSFER: current deployed asset, new custodian and destination; ends previous custody and opens new custody.
- RESERVE / RELEASE_RESERVATION: GOOD available spare to reserved, or GOOD reserved to available.
- RETIRE: either IT role, unassigned and out of maintenance; final state, no deletion.
- INVENTORY_ADJUSTMENT: either IT role, reason and technicalCondition required; cannot restore faulty assets to GOOD or bypass open maintenance.

Components cannot be independently moved while attached: detach first or transfer the entire workstation. Every movement stores id,type,asset_id OR item_id,quantity,source_id,destination_id,previous_state,new_state,actor_id,reason,ticket_id,replacement_id,created_at. No mutation/delete route exists for movement history.

`POST /custody/:id/acknowledge`: receivedBy, optional receiptAttachmentId. The IT actor records a witnessed receipt, preserving their authenticated ID. Assignment must be current and pending. Receipt attachment must belong to the same asset. Reassignment/return preserves old acknowledgements. Custody row fields: id,asset_id,type,employee_id,department_id,location_id,issued_by,issued_at,ended_at,acknowledgement,received_by,acknowledged_by,acknowledged_at,receipt_attachment_id,movement_id,notes. Generated active-asset uniqueness enforces at most one active assignment.

`POST /stock/transactions`: itemId,locationId,type,reason; optional technicalCondition=GOOD,quantity=1,destinationId,ticketId,adjustment,issueMovementId,custodianType=none,employeeId,departmentId. Returns `{ movementId, balance }`.

- RECEIVE adds units; ISSUE consumes unreserved GOOD units and requires a different active destinationId. Optional recipient custody is recorded in the movement snapshot without fabricating a tagged asset.
- RETURN requires original issueMovementId for the same item and limits cumulative returns to issued quantity. Returned condition may reflect damage; source/destination follow the original issue and return location.
- TRANSFER requires a different destination and moves equal quantity atomically.
- RESERVE / RELEASE_RESERVATION changes reserved quantity while preserving physical quantity; only GOOD units may be reserved.
- INVENTORY_ADJUSTMENT allows either IT role and a nonzero signed adjustment, bounded to +/-1000000, plus reason.

Balance keys are item/location/condition. Locked updates enforce quantity>=reserved>=0. Ledger rows preserve deltas and resulting balances. Any available GOOD stock total at/below minimum_stock produces an active-IT low-stock notification in the same transaction. No record gets a fake per-unit tag.

`POST /corrections`: movementId,reason; either IT role. Appends an authorized stock adjustment reversing a simple receipt/issue/return once; original movement remains unchanged. Complex transfers/replacements use explicit compensating movements/operations rather than rewriting history.

## Workstations and replacement

| Method/path | Request fields | Result |
| --- | --- | --- |
| POST `/workstations` | name,locationId,custodianType=employee/department; optional employeeId,departmentId | workstation |
| PATCH `/workstations/:id` | name,isActive | row; cannot deactivate with attached components |
| POST `/workstations/:id/attach` | assetId,reason | GOOD spare becomes IN_USE in workstation custody/location; at most one PC case |
| POST `/workstations/:id/detach` | assetId,reason | clears association and records history; existing custody remains until explicit return/transfer |
| POST `/workstations/:id/transfer` | locationId,custodianType; optional employeeId,departmentId; reason | transfers row and all active components/custodies atomically |
| POST `/replacements` | oldAssetId,replacementAssetId,oldDestinationId,failureReason; optional oldCondition=FAULTY/UNDER_INSPECTION,ticketId,notes | replacement row plus oldMovementId/replacementMovementId |

Replacement requires an old deployed asset and a GOOD/AVAILABLE unassigned replacement in the same category. Assets are locked in sorted order. The old component/custody ends, moves to the chosen inspection/fault location with RESERVED status, and the replacement inherits custody/workstation/location and becomes IN_USE. Both movements share replacement_id. Any error rolls back all writes. Retry uses clientRequestId. Maintenance is explicitly opened afterward if needed. Ticket links preserve the original ticket lifecycle. Compatibility presently means identical category; no implicit cross-category substitutes are allowed.

## Maintenance and ticket links

`POST /maintenance`: assetId,issue,engineerId,locationId; optional provider,ticketId,notes. Return/ detach active custody first. Active technician engineer required; either IT role can open jobs for any active engineer. Asset becomes IN_MAINTENANCE and remains excluded from spares.

`POST /maintenance/:id/outcome`: actionTaken,outcome,locationId; optional inspectionConfirmed,cost,notes. Outcomes AWAITING_PART/UNDER_INSPECTION keep the job OPEN and asset IN_MAINTENANCE. REPAIRED requires inspectionConfirmed=true, closes the job and makes the asset GOOD/AVAILABLE. UNREPAIRABLE/BEYOND_ECONOMICAL_REPAIR close the job and leave UNREPAIRABLE/RESERVED; either IT role may then retire it. All intermediate action/outcome updates remain in append-only audit and movements.

Job fields: id,asset_id,issue_description,engineer_id,status,action_taken,outcome,provider,cost,ticket_id,notes,created_at,closed_at. One open job per asset is enforced by a generated unique key.

`POST /ticket-links`: assetId,ticketId. Creates an auditable many-to-many association; original single-unit `/api/assets/:assetId/withdraw` remains unchanged for legacy inventory.

## Inventory and imports

| Method/path | Request fields / permission | Result |
| --- | --- | --- |
| POST `/inventory-sessions` | name; optional type=PERIODIC/INITIAL,locationId,departmentId,categoryId; either IT role | draft session; PERIODIC snapshots expected assets, versions and stock balances |
| POST `/inventory-sessions/:id/counts` | entryId OR assetId OR itemId; locationId; optional quantity=1,technicalCondition=GOOD,observedCondition,notes; IT | draft periodic count entry. Individual count is 0/1. Use zero to explicitly mark missing |
| POST `/inventory-sessions/:id/review` | either IT role | all expected rows must have counts; INITIAL must have staged rows; status REVIEW |
| POST `/inventory-sessions/:id/decisions` | entryId,decision=APPROVED/REJECTED,reason; either IT role | reviewed discrepancy |
| POST `/inventory-sessions/:id/approve` | either IT role | all discrepancies reviewed; status APPROVED, approved_by recorded |
| POST `/inventory-sessions/:id/finalize` | reason; either IT role | applies approved corrections in one transaction, then FINALIZED |
| POST `/inventory-sessions/:id/import` | rows (1–200), either IT role | stage INITIAL rows only, no authoritative inventory change |
| POST `/inventory-sessions/:id/import-file` | format=csv/xlsx,data=base64, either IT role | same staged import path after strict parsing |

Session fields: id,name,type,status,location_id,department_id,category_id,created_by,approved_by,created_at,finalized_at. Count entry fields: id,session_id,asset_id OR item_id,location_id,technical_condition,expected_quantity,counted_quantity,expected_version,observed_condition,observed_location_id,discrepancy,decision,notes,counted_by,applied_movement_id. Discrepancies: NONE,MISSING,UNEXPECTED,QUANTITY,CONDITION,LOCATION.

Counting never changes live balances/asset state. Finalization rejects stale asset versions or changed stock quantities. Approved missing assets leave custody/workstation and become RESERVED/UNDER_INSPECTION; approved location/condition differences create movements. Repair-to-GOOD requires maintenance, and retired/in-maintenance state cannot be bypassed. Rejected entries remain historical. Registered unexpected assets can be corrected through approved location/condition movements; unknown physical equipment must first be staged through INITIAL registration. Recounting an approved/finalized session is blocked.

INITIAL JSON rows: `{ sourceKey, kind: 'asset'|'stock', data }`. Asset data uses POST /assets fields without clientRequestId. Stock data uses itemId,locationId,technicalCondition,quantity and becomes an initial receipt. sourceKey must identify the physical source record, not a newly generated value per retry. Session-local duplicate keys are rejected; previously finalized source keys are rejected across sessions under a database lock. Finalization creates all staged records atomically, enforcing PC serial uniqueness and active references. New catalogue items/locations must be reviewed and created beforehand rather than guessing names during import.

CSV/Excel columns are exactly `sourceKey,kind,data`; data is a JSON object encoded as a CSV cell or Excel text cell. UTF-8 CSV, first XLSX sheet only. Max 200 rows/file, 5 MiB source, 32 MiB expanded XLSX. Formula/macro cells are rejected; source text is never executed. Python 3 is used as a bounded subprocess with no shell and no persisted upload file. Parser failures are sanitized. Import data is staged until review, approval and finalization. Original files are not modified.

## Attachments

`POST /assets/:assetId/attachments`: fileName,mediaType,data (base64), optional maintenanceId. Max decoded 5 MiB. Allow PNG/JPEG/PDF only with matching magic bytes, no path separators in filename, maintenance must belong to asset. Returns id,asset_id,maintenance_id,file_name,media_type,byte_length,sha256,uploaded_by,created_at. Content is stored in a protected MEDIUMBLOB, not a public directory. Every mutation requires Origin/authentication/idempotency.

`GET /attachments/:id` downloads content only for IT sessions, with attachment disposition and nosniff. There is no public URL, inline HTML/SVG/executable upload or delete route. Files are not malware-scanned; production scanning/quarantine remains necessary before broad attachment use. Private database backups must include BLOB data.

## Reports and exports

`GET /reports/:name`, either IT role. Names: assets,totals,categories,departments,custody,spares,faulty,maintenance,transactions,replacements,frequent-faults,discrepancies,retired,stock,low-stock. Use collection-specific filters above. Custody defaults to currentOnly=true; set false for historical assignments. Totals/category/department distribution keep individualCount separate from stockQuantityCurrent, stockReservedCurrent and goodStockAvailableCurrent, so a batch is never treated as a tagged individual asset. Frequent-faults counts maintenance jobs per asset. Event/date reports use their recorded creation date; current stock balances/low-stock have no historical date reconstruction and reject date filters. Distribution from/to filters individual asset registration dates; fields ending Current always describe current stock balances rather than a historical balance reconstruction. frequent-fault dates filter job creation dates.

Append `format=csv|xlsx|pdf` for a real download of matching rows. Ordinary collection exports omit pagination and cap at 10000 rows; narrow filters if larger. Aggregated reports paginate grouped results. Low-stock exports all current low-stock rows. CSV neutralizes formula prefixes; XLSX stores all text as text and uses RTL sheet direction. PDF uses PDFKit and a locally available Arabic-capable font. PDF export is authenticated and does not invoke a browser or public conversion service. Layout is a simple field listing, not a finished branded custody form.

## Notifications, migration and operation

New asset events use the existing durable notification tables, account revisions, history/read APIs, polling and authenticated SSE. Events carry type=asset_event, resourceType/resourceId, nullable ticketId. Recipients are resolved to active IT accounts only; directory employee records are not silently linked to unrelated login accounts. Issue/transfer/return/replacement/maintenance/low-stock/review/finalize create notifications in the same transaction as state changes. Failure rolls everything back; retries reuse the committed response. New frontend notification rendering must handle asset_event and resourceType instead of assuming ticketId is always present.

The migration adds 21 InnoDB/utf8mb4 tables: categories,sequences,locations,workstations,assets,items,balances,operations,replacements,movements,stock_transactions,custody,maintenance,inventory_sessions,inventory_entries,attachments,audit,workstation_history,ticket_links,legacy_mappings,initial_rows, all prefixed am_. It also permits non-ticket notification events without inventing a ticket_history row. Ticket-linked events retain the ticket FK/cascade. New immutable tables have development SELECT/INSERT grants only; test accounts additionally receive cleanup permissions. No existing assets/tickets/directories are automatically converted, deleted or renumbered.

Apply through the existing private workflow from backend/:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\migrate-local-db.ps1
npm run lint
npm test
npm run test:integration
```

The workflow applies migrations twice and checks checksums on development/test. Fresh/setup scripts now include the new tables and least-privilege grants. Existing fresh configurations must be prepared/migrated separately before running check:fresh; this work does not overwrite previous private environment files.

`POST /legacy-conversions`: legacyAssetId,kind=asset/stock,categoryId,locationId,reason; optional serialNumber,itemId; either IT role. One-unit records may become individuals after explicit category/serial review. Batches may become quantity catalogue/balances only when the category supports quantity tracking. Existing matching catalogue records are reused. Converted original rows are archived with a conversion history entry and mapping, not deleted; original tickets/withdrawals/history keep their original keys. Archived/withdrawn records and multi-unit individual-category batches require deliberate reconciliation and are rejected, not silently split into invented physical assets. Old generic update/withdraw cannot mutate converted archived records. Repeated conversion keys safely return the original mapping.

Optional environment/configuration: HELPDESK_PYTHON selects Python 3 for CSV/XLSX parsing; ASSET_REPORT_FONT selects an Arabic-capable TrueType font for PDF. Windows defaults to C:/Windows/Fonts/arial.ttf; set a licensed installed font on other hosts. No new administrator secret, upload-directory exposure or external service is required. Install locked dependencies with npm ci; PDFKit is the only new runtime library. No frontend bundle was rebuilt or edited.

Remaining integration work: migrate the existing asset UI to these endpoints and render asset notifications; classify actual legacy inventory and gather real PC serials/locations/custodians; design branded printable labels/receipts; add production malware scanning, operational backup/recovery and capacity controls for attachments, deployment security review and operational reconciliation processes. Local tests do not certify deployment readiness. Acknowledgement is an IT-recorded witness action until a deliberate directory-to-login identity mapping exists; it is not an employee e-signature or cryptographic signature.
## Verification record — 2026-11-09

- MySQL 8.0.46, port 3307. The private migration workflow completed; it runs each database migration twice and verifies checksums. All 21 new tables and restricted development/test grants were independently verified through the application connections.
- `npm run lint`: passed. `npm test`: 38/38 passed.
- Full `npm run test:integration`: 83/83 passed at the final regression checkpoint. A subsequent targeted run of `npm run test:integration:asset-management` passed all 13 scenarios, including the additional aggregate-report/date-filter check.
- Scenarios include concurrent tag allocation, normalized mandatory PC serials, tracking modes, negative stock/reservations/returns, custody/workstation conflicts, injected mid-replacement rollback, idempotency, maintenance inspection, inventory approval, legacy conversion and blocked stale writes, CSV import, real XLSX/PDF/CSV exports, QR/attachment authorization, notification persistence, and read-only checks using the restricted development account.
- Unit tests additionally validate strict input/forbidden technical fields, pagination/date limits, formula-safe exports, and XLSX parser formula rejection.
- One pre-existing workflow test incorrectly expected IT-only solutions in an employee response. Only its assertions were corrected: employees omit solutions, while manager history retains them. Ticket production behavior was not changed.
- Development has zero legacy asset records, zero new individual assets, zero quantity catalogue items and zero conversions after migration. Its 132 employee-directory records remain intact. All asset test fixtures are fictional and confined to the test database, apart from read-only development permission checks.
- This run did not recreate an empty database or overwrite an existing fresh-test configuration. Updated fresh/bootstrap scripts include the full schema/grants for the next private fresh-database preparation. No frontend files were edited or built.
