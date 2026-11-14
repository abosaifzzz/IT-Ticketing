# Frontend employee selection contract

Backend support added 2026-11-07. No migration or additional grants are required after migrations 007–009. The imported roster remains directory data, not login accounts. Frontend files have not been changed in this update.

## Employee options

`GET /api/employee-options?search=&page=1` requires an active authenticated employee, technician or manager session. It returns `{ items, total, page, pageSize }` with pageSize 25. Each item contains only `{ id, fullName, departmentId, departmentName }`. Only active employees in active departments are included. Search is a literal name substring; ordering is name then UUID. Unknown query fields, duplicate parameters, invalid pages or search longer than 200 characters return 400. Missing/inactive authentication returns 401. Use cookie credentials and no persistent browser roster storage.

Pagination matters: the imported roster has 132 records, so page 1 is not the whole roster. Use server search plus accessible load-more/pagination or fetch all pages before offering a client-filtered list. Show department labels to distinguish identical names and use directory UUIDs as option values.

`GET /api/employees` and `POST /api/employees` remain IT-only administration; employees must not use or gain access to these routes.

## Ticket creation

`POST /api/tickets` accepts an optional `reporterEmployeeId` directory UUID. For the new employee selector, send:

```json
{
  "reporterEmployeeId": "selected-directory-uuid",
  "createdFor": "self",
  "categoryId": "active-category-uuid",
  "title": "Ticket title",
  "description": "Ticket details",
  "clientRequestId": "stable-per-submission-idempotency-key"
}
```

Include `subcategoryId` if selected. Use `createdFor: "other"` for reporting on behalf of someone else. The person must be selected explicitly in both modes; no automatic identity mapping is inferred from a login name/email.

When reporterEmployeeId is supplied, omit reporterName, departmentId/department and employeeNumber from the request. The backend locks/rechecks the directory record and reads its name and current active department in the creation transaction. It snapshots those labels on the ticket. If labels or department are included for compatibility, they must match the selected record or the request fails with 400. Employee codes are not needed. Invalid/missing/inactive directory records, inactive departments and mismatched selections return 400 with an Arabic message. The API cannot infer a directory person from a submitted name.

The ticket response still exposes canonical reporterName, departmentId and department. Ticket ownership is always the authenticated submitting employee account, including createdFor other; selecting somebody else's name never transfers or grants account access. No login credentials are created. Exact retries return the original ticket even if the directory record subsequently changes or deactivates. New submissions must revalidate selection. Changing directory labels never rewrites historical tickets.

Backward compatibility: requests without reporterEmployeeId retain explicit manual reporterName and department requirements. Existing manual IT support tickets, including senior-management requests, continue to work. Directory selection is permitted for ordinary-employee IT manual tickets but forbidden for top_management requests. Migrating those IT forms is not required for the employee frontend task.

## Frontend requirements

Replace only employee Create Ticket reporter-name entry with an Arabic searchable, keyboard-accessible selector. Selecting a record fills a read-only department field. Changing/clearing typed search must clear stale selection and department; require a selected UUID before submission. Keep personal/on-behalf choice, default self, and category/subcategory validation. Show loading, empty, retry, inactive-selection and session-expiry states. Preserve existing submission locking/idempotency keys, event refresh, routes, Arabic RTL and both themes. Send only allowlisted fields through the existing centralized ticket service; never submit account ownership fields or use localStorage for directory data.

Tests should cover a selection outside page 1, Arabic search, same-name distinct UUIDs/departments, automatic read-only department, stale selection clearing, both report modes, inactive records/departments, refresh persistence and account isolation. Read this document before frontend implementation; older root instructions about typing the reporter manually are superseded only for this explicitly requested directory-selector flow.
