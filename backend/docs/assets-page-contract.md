# Single IT Assets page and group stock allocation

This contract supersedes the older page layout and the quantity-only group restriction in `simple-assets.md`. Backend changes are implemented under the existing `/api/asset-management/simple` API. The frontend layout changes are described in [the frontend prompt](frontend-assets-prompt.md).

## Main page data

`GET /dashboard` accepts the same asset filters as `GET /assets`. In addition to the older fields, it returns numeric counters:

| Field | Arabic card |
| --- | --- |
| totalUnits | إجمالي الوحدات |
| employeeCustody | بعهدة موظفين |
| departmentCustody | بعهدة أقسام |
| unassigned | غير مسندة |
| faulty | معطلة |
| inMaintenance | قيد الصيانة |

These counters sum physical quantities, never group counts. The three custody counters sum to totalUnits; condition counters overlap custody counters. Faulty includes FAULTY and OUT_OF_SERVICE, excluding IN_MAINTENANCE. Existing breakdown arrays remain for older clients; the new page should not render the cancelled charts.

`GET /assets` keeps `{ items,total,page,pageSize }`; total counts records. Asset list/detail rows include `custodianName`, `employeeName`, `departmentName`, `locationName`, `quantity`, `isStock`, and `sourceAssetId`. Read names from the server rather than displaying IDs. Mutations may return null names until the next read.

Filters include `search`, `assetTypeId`, `condition`, `custodianType`, `custodianId`, `employeeId`, `departmentId`, `custodianSearch`, `groupId`, `assigned`, `locationId`, `from`, `to`, `page`, `pageSize`. Search now includes employee and department names. `custodianSearch` performs literal name search. IDs remain UUIDs, supplied through existing authenticated lookup APIs. These APIs remain IT-only; employee directory names do not confer account ownership.

## Main warehouse

Asset creation, individual custody changes and group custody changes can omit `locationId`; the server uses the one active WAREHOUSE. Development already has `المخزن الرئيسي`. If zero or several active warehouses exist, configure one or supply an explicit location; ambiguous defaults return 409. Existing explicit-location clients remain supported. Historical locations are never rewritten automatically. Assigned group creation also resolves the warehouse when locationId is omitted.

The frontend can hide the custody/locations navigation page and location selectors. Assignment and return actions still exist inside asset and group details. All changes remain authenticated, validated and auditable.

## Group components and allocation

Existing endpoints are extended; no parallel asset or ticket API was added:

- `POST /groups/:id/members`: `{ assetId,clientRequestId,expectedVersion?,notes? }`. assetId can identify quantity stock, including keyboards and mice. Each selected source contributes one unit. An unassigned group's stock definitions do not decrement stock. Adding stock to an already assigned group allocates immediately in the same transaction.
- `POST /groups/:id/custody` with `action: "ASSIGN"`, custodianType employee/department and custodianId: allocate exactly one unit per pending component. Nonserialized stock decreases by one; the allocated physical unit receives its own backend ID, custody, group membership, source link and history. PC cases retain their individual serial and ID. Transfer updates custody without consuming again.
- `GET /groups/:id`: members includes allocated physical units and pending component definitions. Pending entries have `pending: true`, `componentId`, `stockAssetId`, `availableQuantity`, and `quantity: 1`. `components` exposes source/allocation relationships. Membership, replacements and group history remain readable.
- `POST /groups/:id/remove-member`: use the displayed member's id (source ID for a pending definition, allocated unit ID for an allocated member). Removing a pending definition never changes stock. Existing allocated-member removal retains that unit's custody/location, ends membership and keeps its history; use return first when the unit must go back to warehouse.
- `POST /groups/:id/replace-member`: accepts warehouse quantity stock as the replacement, splitting one unit for an assigned group. Pending definitions can also be replaced. Replacement is atomic and historical records remain intact.

Stock is checked and locked inside the transaction. Shortage, faulty, reserved or retired stock returns 409 and rolls back all allocations. Retrying the same actor/request key returns the original result without consuming again. Stock quantity can reach zero only as an internal exhausted-stock state; the create/edit quantity field still requires a positive integer. Zero-stock records remain readable for replenishment/history.

## Return with condition

For group return, send `action: "RETURN"`, `custodianType: "none"` and a `returnCondition` of NEW, USED or OUT_OF_SERVICE. The frontend must present the Arabic choices جديد، مستعمل، خارج الخدمة. One default can apply to the whole group; optional `returnConditions: [{assetId,condition}]` overrides individual components. Use the currently displayed allocated member ID; source ID is also accepted. One override per component is allowed.

Example:

```json
{
  "clientRequestId": "keep-this-key-for-retries",
  "action": "RETURN",
  "custodianType": "none",
  "returnCondition": "USED",
  "returnConditions": [
    { "assetId": "allocated-unit-uuid", "condition": "OUT_OF_SERVICE" }
  ],
  "notes": "Inspection on return"
}
```

Returned working stock merges only into an available matching source with the same type, brand, model, condition and location. Different conditions create a separate warehouse stock record. Retired sources are never refilled. Allocated-unit history is preserved when its quantity is merged; internal archival of that allocation is audit bookkeeping, not an archive action the frontend should show. Physical totals stay unchanged. Serialized devices return individually, without merging serials. The group keeps pending definitions for later assignment, pointing to the returned stock. OUT_OF_SERVICE units cannot be assigned as working stock.

Explicit condition returns finish group memberships and current custody. Old clients that omit both condition fields retain the previous group-return behavior for compatibility. New UI return forms must always send the condition. Open maintenance must be completed first; changing faulty equipment back to working also requires `repairConfirmed: true` and notes. Individual `/assets/:id/custody` returns accept `returnCondition` and the same repair confirmation rule.

OUT_OF_SERVICE is a new simple condition backed by the existing UNREPAIRABLE technical condition. It is separate from IN_MAINTENANCE and appears under the معطلة summary card. No new procurement, stock-ledger or inventory-approval flow is required.

## Migration and scope

Migration 015 adds stock-source identity fields and `am_group_components`, backfills existing group members, and permits zero only for exhausted unassigned nonserialized stock. Existing APIs, historical assets, users and tickets are preserved. Both Engineer (`technician`) and Manager keep identical full asset access through the shared policy. Employee access stays denied.

Apply through `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\migrate-local-db.ps1`; enter the administrator password only in its hidden prompt. The workflow tests re-runs and grants restricted table permissions. The frontend should remove archive controls, not delete historical records or introduce hard-delete calls. Compatibility archival endpoints remain server-side for existing clients.

Verified locally on 2026-11-12: lint passed, 42/42 unit tests passed, and 112/112 live-database integration tests passed. Migration 015 was applied through the private workflow. Tests cover allocation, last-unit concurrency, rollback, replacement, main-warehouse defaults, per-condition returns, retired stock, employee-name filtering, role restrictions and unchanged existing workflows. Frontend files were inspected but not edited; apply the separate frontend prompt for the requested layout. Changed backend files: migration 015; assetManagement assets.js, database.js, groupStock.js, simple.js, simpleReads.js and tables.js; integration asset-management/simple-assets tests; API documentation and README.
