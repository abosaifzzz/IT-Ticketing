# Simple, flexible asset management — frontend contract

This is the preferred asset-management contract as of 2026-11-12. It reuses the existing backend, authentication, database asset rows, categories, counters, locations, employee directory, departments, custody history and transaction/idempotency helpers. It does not introduce a second backend or duplicate physical records.

The earlier quantity and comprehensive asset endpoints remain available for existing clients and historical operations. Their stock ledgers, procurement/supplier fields, QR flows, inventory approvals and advanced reports are not part of this simple API and are not required by its UI. Do not add computer specifications or star ratings.

## Base, authorization and envelopes

Base path: `/api/asset-management/simple`.

Use cookie credentials and the existing authentication provider. Authenticated active IT Engineers (`technician`) and Managers (`manager`) have identical full access to every IT Assets operation. Employees and other roles have no access. The shared backend policy covers types/serial configuration, individual assets, groups/membership, custody, maintenance, history, dashboards and exports, including compatibility endpoints. Maintenance job ownership does not restrict either IT role. Safe deletion, repair confirmation and all transactional integrity checks still apply. Permissions outside IT Assets remain unchanged.

Every write includes `clientRequestId`: 1–128 ASCII letters/digits/underscore/hyphen. Reuse the same key/body after a network failure; the committed response is replayed without repeating movements or assignments. A different operation/body with the same account/key returns 409. Send the exact configured Origin, including for DELETE. PATCH is for metadata; dedicated custody and condition endpoints prevent accidental owner/state changes. An optional expectedVersion on mutable asset/group writes rejects stale forms with 409.

Lists: `{ items, total, page, pageSize }`, default page 1/pageSize 25; max pageSize 100. POST responses: 201 `{ item }`; PATCH and DELETE: 200 `{ item }`. Details: `{ item }`. Dashboard: aggregate object directly. Errors preserve `{ error }` with 400 invalid/unsupported fields, 401 unauthenticated/inactive session, 403 forbidden role, 404 missing record, and 409 duplicates, conflicting custody/membership, stale version or an unsafe state change. No token/password enters response JSON or browser storage.

## Asset types

| Method | URL | Fields / behavior |
| --- | --- | --- |
| GET | `/types` | search,page,pageSize,activeOnly=true/false; optional from/to creation dates |
| GET | `/types/:id` | Includes inactive types so historical references remain readable |
| POST | `/types` | name; optional prefix,serialMode=OPTIONAL,uniqueSerial=true; either IT role |
| PATCH | `/types/:id` | Any of name,prefix,serialMode,uniqueSerial,isActive; either IT role |
| DELETE | `/types/:id` | Soft deactivates, never removes referenced history; either IT role |

Response: `{ id, name, prefix, serialMode, uniqueSerial, isActive }`. Names/prefixes are unique using the existing database constraints. Prefix is optional on creation: omitting it generates a safe internal prefix automatically. A provided prefix matches `[A-Z][A-Z0-9]{0,11}`. It can be changed before the first numbered asset; afterward it is protected so existing labels cannot collide or be renumbered. Names and serial policy remain configurable.

serialMode:

- REQUIRED: a nonempty serial must be provided.
- OPTIONAL: a serial may be omitted.
- DISABLED: serial input is rejected.

No asset type name or PC-specific branch controls this behavior. Migration 013 translates the old requires_serial configuration to preserve existing behavior; either IT role can then configure any type, e.g. require serials for printers or permit them on monitors.

Normalization uses NFKC, uppercase and removal of whitespace. With uniqueSerial=true, normalized serials must be unique among records with enforced serial keys. Types with uniqueSerial=false allow duplicates and store no enforced key. Switching uniqueness on checks existing rows transactionally; conflicts return 409 and roll back. Switching to REQUIRED fails if an active existing asset lacks a serial; switching to DISABLED fails if active existing assets still carry serials. No serial values are silently discarded. Archived historical values are preserved.

## Individual assets

| Method | URL | Request fields |
| --- | --- | --- |
| GET | `/assets` | search,page,pageSize,assetTypeId,condition,locationId,custodianType,custodianId,groupId,assigned=true/false; optional from/to creation dates |
| GET | `/assets/:id` | Asset plus readable movement history, assignment history and membership history |
| POST | `/assets` | assetTypeId,locationId; optional brand,model,serialNumber,quantity=1,condition=USED,custodianType=none,custodianId,notes |
| PATCH | `/assets/:id` | Any of assetTypeId,brand,model,serialNumber,quantity,notes; optional expectedVersion |
| DELETE | `/assets/:id` | optional expectedVersion,notes; either IT role; safe soft deletion only |
| POST | `/assets/:id/condition` | condition; optional repairConfirmed,notes,expectedVersion |
| POST | `/assets/:id/custody` | action,locationId,custodianType; custodianId for employee/department; optional notes,expectedVersion |

Every write also includes clientRequestId. UUID `id` is the route identity. `internalAssetId` is the immutable backend-generated physical tag; neither is caller-editable. Changing a type does not renumber an existing asset. Category counters are database-locked and collision-safe under concurrent creation.

Asset response fields:

```json
{
  "id": "asset-uuid",
  "internalAssetId": "MON-0001",
  "assetTypeId": "type-uuid",
  "assetTypeName": "Monitor",
  "brand": "Example",
  "model": "Example model",
  "serialNumber": null,
  "quantity": 1,
  "condition": "USED",
  "locationId": "location-uuid",
  "custodianType": "none",
  "custodianId": null,
  "departmentId": null,
  "groupId": null,
  "notes": "",
  "version": 0,
  "createdAt": "ISO timestamp",
  "updatedAt": "ISO timestamp",
  "deletedAt": null
}
```

assetTypeName is provided on reads; mutations may omit it until the frontend refreshes or resolves the type list. Text fields are generally <=160 characters; notes <=4000 and may contain newlines. Serial validation follows the selected type. Unknown fields such as supplier workflow, CPU/RAM/disk/OS/IP/hostname, internalAssetId or generic custody/location updates are rejected. Metadata updates preserve omitted fields.

Deleting an assigned, grouped, in-maintenance asset or one with an open legacy maintenance job returns 409. Safe deletion sets archived_at, preserving movement history, IDs, ticket links and foreign keys. Active lists/dashboard omit it and details return 404 through the simple API; compatibility/history APIs retain the original row. Legacy retired assets are not part of the active simple registry and cannot be silently restored. Legacy good-but-reserved assets need their existing reservation released before simple mutations; the new UI does not implement reservations.

Conditions are exactly NEW, USED, FAULTY, IN_MAINTENANCE. They are derived consistently from the existing operational/technical state plus the new usage_condition field, so old clients' status updates remain reflected. All old healthy assets initially map to USED; old unhealthy/inspection/unrepairable states map to FAULTY; open maintenance maps to IN_MAINTENANCE. No historical event is rewritten.

Setting FAULTY/IN_MAINTENANCE records basic history without asking for providers, costs or purchasing details. Returning from either to NEW/USED requires repairConfirmed=true and a nonempty note. Existing open legacy jobs retain assigned-engineer checks and are closed with preserved repair history when repaired through this endpoint. Leaving a legacy job open while changing it to FAULTY is rejected; finish that old job through its existing endpoint. A simple condition change does not remove current custody or group membership.

## Custody and location

custodianType is employee, department or none. For employee custody, custodianId is an **employee_directory UUID**, not a login-account ID; department is derived from that employee and validated as active. For department custody, custodianId is the existing department UUID. None requires a null/omitted custodianId.

Custody action:

- ASSIGN: currently unassigned asset/group; requires employee or department and location.
- TRANSFER: explicitly states the desired custodian and location. Sending none intentionally leaves it unassigned, e.g. an unassigned location transfer.
- RETURN: custodianType must be none, no custodianId, destination location required.

The endpoint locks the asset/group and changes current fields plus assignment/movement history in one transaction. The existing am_custody active-assignment constraint prevents overlap. Direct individual custody changes are rejected while the asset is grouped; operate on the whole group or remove membership first.

Reuse existing authenticated lookup endpoints: `/api/employee-options?search=&page=1` supplies active directory employees with department names/IDs; `/api/departments?activeOnly=true` supplies active departments. Locations use `/api/asset-management/locations?activeOnly=true`; creation/update by either IT role stays on the existing locations endpoint with kind default LOCATION, without requiring warehouse workflows. Fetch all pages or offer server search; do not treat the first page as the complete directory.

## Flexible groups

| Method | URL | Request fields |
| --- | --- | --- |
| GET | `/groups` | search,page,pageSize,locationId,custodianType,custodianId |
| GET | `/groups/:id` | Group plus members,membershipHistory,replacementHistory,history |
| POST | `/groups` | name; optional description,locationId,custodianType=none,custodianId |
| PATCH | `/groups/:id` | name and/or description; optional expectedVersion |
| DELETE | `/groups/:id` | optional expectedVersion; either IT role |
| POST | `/groups/:id/members` | assetId; optional notes,expectedVersion |
| POST | `/groups/:id/remove-member` | assetId; optional notes,expectedVersion |
| POST | `/groups/:id/replace-member` | oldAssetId,replacementAssetId; optional oldLocationId,notes,expectedVersion |
| POST | `/groups/:id/custody` | action,locationId,custodianType; custodianId if assigned; optional notes,expectedVersion |

Groups reuse am_workstations rows, retaining existing identities/clients. A group is `{id,name,description,locationId,custodianType,custodianId,isActive,version,deletedAt}`. Names are unique. An unassigned group can have no location; an assigned group requires a location. Any configured types and multiple members of the same type are allowed; there is no PC-only composition rule.

Policy:

1. A physical asset has at most one active membership, enforced by a generated unique key. Each member retains its own identity and condition.
2. Only quantity-one assets can join groups. Adding an unassigned asset adopts the group's custody and its location when one is set. An already-assigned asset can join only if its custody already matches; conflicting custody must be explicitly returned/transferred first. An unassigned group with no location does not force its members into a fabricated location.
3. Assign/transfer/return of the whole group synchronizes all current members atomically. Fault/maintenance conditions remain independent and are not reset by custody changes.
4. Removing a member ends membership but **keeps its individual custody and location unchanged**. Its condition is also unchanged. Return/transfer it separately if desired. The detached asset no longer follows later group custody changes.
5. Replacement is atomic and may use any configured type. Incoming asset must be ungrouped/unassigned and active. The outgoing asset leaves group/custody, keeps its condition and moves to oldLocationId (or its existing location). The replacement adopts the group's custody/location while retaining its own condition. Both movements share one replacement operation; historical membership records the replacement asset. Any failure rolls everything back.
6. Delete a group only after returning custody and removing members. Soft deletion retains membership/replacement history. A group never contributes an extra physical unit to counts.

The existing workstation attach/detach/replace endpoints now use the same membership-history helper, so both API surfaces share one source of truth. No second physical-asset/group registry is created.

## Simple dashboard and history

`GET /dashboard` returns `{ total, byType, byCondition, byAssignment, byLocation }`. Optional asset filters match GET /assets. Each bucket contains a count; byType includes assetTypeId/name, byCondition condition, byAssignment custodianType, byLocation locationId. All counts sum the quantity of active asset records, without joining memberships or adding group totals. List total and pagination still count records. Quantity catalogue/ERP balances are outside this physical-asset dashboard.

Asset history fields: id,action,userId,timestamp,oldValues,newValues,notes,replacementId. Older raw asset-state values are normalized to simple asset values on reads; the original stored movement remains untouched. Creation, metadata changes, assignment/return/transfer, replacement, conditions, maintenance entry/return and membership changes are recorded. Assignment history includes issuing and acknowledgement actors/dates; membership history retains join/end actors, dates and replacement links. Audit and movement rows remain append-only.

## Migration, changed files and checks

Migration `013_simple_assets.sql`:

- am_categories: serial_mode,unique_serial, preserving old serial requirements via existing configuration.
- am_assets: usage_condition (defaults USED), archived_at for safe deletion.
- am_workstations: nullable location for unassigned logical groups, description, archived_at.
- am_group_memberships: unique active asset membership, group/asset/user foreign keys, historical join/end fields and replacement pointer. Current workstation associations are backfilled; unknown historical actors remain null rather than invented.

No old tables/endpoints or physical records are dropped, renamed or reset. In the local databases there were zero individual assets/workstations before this migration; the populated backfill path is explicit SQL but was not exercised against real local asset records. Existing quantities, tickets, employee-directory records and authentication remain separate and intact.

Apply from backend/ using the private workflow:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\migrate-local-db.ps1
npm run lint
npm test
npm run test:integration
```

Never send administrator passwords in chat or pass them as command arguments. Migration 013 and restricted table grants are applied locally; the private workflow tests re-runs/checksums. Bootstrap/fresh scripts now account for 13 migrations and the extra table. No new library, service, environment variable, upload setting or credential is required by the simple module.

New files: simple.js (services/handlers), serial.js (shared serial policy), simpleReads.js, simpleRouter.js, migration 013, unit/integration tests and this contract. Updated: shared asset creation/history helpers, legacy serial conversion/workstation compatibility, router/repository wiring, DELETE Origin/CORS support, table grant metadata, fresh-check scripts, package test scripts and documentation. Existing asset test cleanup now also removes its fictional membership rows.

Remaining integration: update the frontend asset navigation/forms to this simple contract and leave older complex screens as compatibility/history views as appropriate. Do not make ledger, QR, approval or advanced-report screens a prerequisite for ordinary asset/group work. No frontend files have been edited for this backend task. Use Arabic RTL, existing themes and centralized services in the frontend. Local checks do not imply production deployment readiness.
## Verification — 2026-11-10

- `npm run lint`: passed.
- `npm test`: 40/40 passed.
- `npm run test:integration`: 95/95 passed, including 11 simple-module database scenarios and all legacy asset/ticket/authentication regressions.
- Database scenarios cover per-type REQUIRED/OPTIONAL/DISABLED serials, configurable duplicate handling and failed policy transitions; generated immutable IDs; soft deletion; arbitrary mixed-type groups; synchronized employee/department custody; detached-member policy; group return/transfer; replacement rollback and retries; concurrent active-membership uniqueness; basic repair confirmation/history; search/pagination/response shape; physical dashboard totals; and legacy workstation membership synchronization.
- MySQL 8.0.46 on port 3307. serial_mode and am_group_memberships are present in development/test. Development membership grants are SELECT/INSERT/UPDATE; test additionally has DELETE for exact fictional-fixture cleanup. The private migration workflow ran migrations twice and verified checksums.
- At the original 2026-11-10 verification, development contained zero am_assets/am_workstations rows and 132 employee-directory records. Tests created no real asset inventory or login mappings. All write fixtures were fictional and test-database scoped.
- Frontend files were neither edited nor built. No new environment variables or dependencies are required. Frontend forms/navigation still need deliberate migration to the simple contract. Local success is not a deployment-readiness claim.

## Quantity and serial policy (2026-11-12)

`POST /assets` accepts `quantity` (integer 1?1,000,000; default 1). One request creates **one asset record**, with one internal ID and the specified quantity. `PATCH /assets/:id` accepts quantity with an optional `expectedVersion`. Responses retain `{ item }`; item/list/detail/history include numeric `quantity`.

- REQUIRED serial types: quantity must equal 1 with a serial for that device. Unique serials remain governed by `uniqueSerial`. PC cases are currently configured as REQUIRED with uniqueness enabled.
- DISABLED serial types: quantity can exceed 1; omit the serial. The other current development types have serials disabled.
- OPTIONAL serial types: quantities greater than 1 require an empty serial; a record with a serial must have quantity 1.
- Rules follow type configuration, never a type name or prefix. Changing type/serial policy cannot turn a batch into serialized devices. No serial is copied across multiple units.
- Quantity changes require returned custody, no group membership, and completed maintenance. Existing version/idempotency checks prevent stale writes and duplicate creation. Quantity zero is invalid; safe deletion archives a record and retains its quantity/history.
- Custody, location, condition and maintenance actions apply to **all units in the record**. Partial assignment/return or partial maintenance is not supported. Group members and replacements must be quantity 1. The compatibility workstation/replacement APIs enforce the same rule.
- Dashboard buckets and totals count physical units using quantity. Lists and pagination count records. CSV/XLSX exports include the stored quantity. Compatibility distribution totals include these units; legacy physical-count approvals remain individual-only and exclude batches from snapshots, rejecting explicit batch counts.

Example for ten nonserialized monitors:

```json
{
  "clientRequestId": "retain-this-key-for-retry",
  "assetTypeId": "monitor-type-uuid",
  "locationId": "location-uuid",
  "quantity": 10,
  "condition": "NEW"
}
```

Submit PC cases one device per record with `quantity: 1` and its own `serialNumber`.

Migration `014_simple_asset_quantity.sql` adds `am_assets.quantity` with default 1, bounded positive values, and a constraint preventing serials/group membership on multi-unit records. Existing records stay intact. Apply using the private migration command above; do not change database grants or use administrator credentials in application configuration.

Frontend integration: the current `TrackedAssetFormPage.jsx` already provides the Arabic field **??????** and sends a JSON number. The backend retains the existing response shape. Keep the default at 1 and display returned quantities in lists/details. For REQUIRED serial types, force quantity 1 and require a serial. For OPTIONAL types, a supplied serial forces quantity 1. Hide serial entry for DISABLED types. Disable quantity editing during custody/group membership/maintenance. Use server-confirmed responses, retain clientRequestId for retries and pass expectedVersion on edits. The existing service response shape remains `{ item }`. Frontend files are outside this backend change.


Quantity verification on 2026-11-12: migration 014 quantity columns/defaults verified in development and test on MySQL 8.0.46 port 3307; the two development assets retained quantity 1. Lint and 42/42 unit tests passed; all 106/106 live-database integration tests passed, including quantity persistence/retry, both IT roles, serialized-device isolation, batch custody, optimistic concurrency, dashboard totals, SQL constraints and compatibility guards. No development assets or login accounts were created by these tests. All test fixtures were cleaned up. Frontend code was inspected for the quantity payload but was not edited or browser-tested in this backend task.

## Issuing and receiving warehouse stock (2026-11-21)

This supersedes the earlier rule that custody applies to every unit of a multi-unit record.

- `POST /assets/:id/custody` with `action: ASSIGN` on a stock record (`isStock`, e.g. 10 keyboards) accepts optional `quantity` (default 1). It reduces the stock record by that number and creates a separate held record (`sourceAssetId` = the stock record) in the chosen employee/department custody. The response is the held record plus `issuedFromStockId`. Asking for more than is available returns 409. Stock records can never be transferred or returned as a whole. A stock record may reach quantity 0 and remain for restocking.
- `RETURN` on a held record merges its units back into the original stock record when type/brand/model/condition/location match (otherwise into a new stock record) and archives the held record. The response is the stock record plus `mergedFromAssetId`.
- `POST /assets/:id/receive` with `quantity` (and optional `notes`) adds units to an unassigned, ungrouped, unserialized record and marks it as stock. Serialized devices (e.g. PC cases) are still registered one record each.
- Movements: STOCK_ISSUE, ASSIGN, MERGE_TO_WAREHOUSE, GROUP_STOCK_RETURN, STOCK_RECEIVE.
