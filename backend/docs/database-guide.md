# Simple database guide

## Which database should I open?

| Database | Purpose | Keep? |
| --- | --- | --- |
| `hospital_it_helpdesk_dev` | The application you use locally. The normal backend `.env` points here. | Yes: your users, tickets and assets are here. |
| `hospital_it_helpdesk_test` | Separate database for automated backend tests, configured in `.env.test`. | Yes: tests must never run against your main data. |
| `sys` | MySQL's own diagnostic/system schema. It is not a duplicate helpdesk database. | Yes: leave it alone. |
| `hospital_it_helpdesk_test_fresh_b72262d27768` | An old, empty database created for earlier fresh-install verification. | Removed on 2026-11-18 after explicit empty-data and active-connection checks. |

Other MySQL system databases may be hidden by DBeaver's display settings. Do not delete `mysql`, `information_schema` or `performance_schema` either.

## How the application works

1. A person signs in using an account from `users`. Passwords are stored as hashes. `auth_sessions` keeps the temporary login sessions.
2. Their phone is saved in `users`. `user_departments` links that person to one or multiple rows in `departments`.
3. Creating a ticket writes to `tickets`. An employee's account is the owner; a ticket also saves the reporter name, username, department and phone as historical snapshots. Later profile changes do not rewrite these snapshots.
4. A Manager assigns an Engineer. Assignment/status/note/comment/resolution events go into `ticket_history`.
5. Notification tables keep the event, recipients, account history and read status. Reports calculate results from ticket/history data, not a second copy of the tickets.
6. Asset tables separately manage devices/batch quantities, groups and custody. Administration tables manage system settings, permissions, audit and recovery requests.

IT manual tickets retain a separate creator and selected reporter; selecting a reporter does not automatically give their employee portal ownership of that manual ticket. Admin remains a separate system role with no Manager/Engineer operational inheritance.

## Table groups

| Tables | Meaning |
| --- | --- |
| `users`, `auth_sessions` | Accounts, profiles and login sessions |
| `departments`, `user_departments` | Department list and each user's memberships |
| `fault_categories`, `fault_subcategories` | Ticket fault choices |
| `tickets`, `ticket_history` | Current tickets and their complete activity history |
| `notification_events`, `notification_accounts`, `notifications` | Reliable notifications and per-account read/history state |
| `am_assets`, `am_categories`, `am_locations` | Preferred asset registry, configurable asset types and locations; the simple API calls categories “types” |
| `am_workstations`, `am_group_memberships`, `am_group_components` | Logical asset groups, membership history and quantity allocation |
| `am_custody`, `am_movements`, `am_maintenance`, `am_replacements` | Assignment/returns, movement, condition/maintenance and replacement history |
| Other `am_*` tables | Asset IDs/sequences, retry protection, history and older compatibility APIs |
| `assets`, `asset_history`, `asset_withdrawals` | Older quantity-inventory/withdrawal API compatibility; currently empty locally, but still referenced by backend endpoints |
| `employee_directory` | Retired original workbook records. Not login accounts. Retained inactive for old references/history and import verification |
| `user_roster_imports` | Evidence that a reviewed user file was imported, preventing duplicate imports |
| `admin_*` | System settings, explicit permissions, audit, backup and protected change requests; `admin_guard` serializes sensitive updates |
| `schema_migrations` | Records which schema updates have been applied. It is hidden from the restricted runtime database account, but needed by the private migration workflow |

An empty table is not necessarily unused. Removing it can break an endpoint even if you never opened that feature. The current schemas contain 45 application tables plus the protected migration ledger. None of the main database's tables was dropped: source routes/repositories still reference these table groups. Do not rename or manually delete tables in DBeaver to simplify the tree. Focus on the relevant group and use the application's pages for routine changes.

## Cleanup completed on 2026-11-18

- Removed the empty obsolete fresh-test database, including its 14 tables, through the private administrator workflow. Old local fresh-test configuration files were removed afterward. Main, ordinary test and system databases were retained.
- Deleted seven already-expired development login sessions. No valid session was removed.
- Removed the fictional `invalid-role@demo.example` orphan from the test database and leftover test audit records. Fixed the invalid-role regression test to use an actually unsupported role instead of the now-valid `admin` role, preventing recurrence of that orphan.
- Cleared test audit residue again after verification. Required configuration/seed rows remain; “empty test database” here means no user/ticket/asset/directory/session records, not removal of schema/configuration.
- Preserved development counts: **349 accounts** (including the 342 imported employees), **5 tickets**, **5 preferred asset records**, 20 departments and all historical relationships. Asset records can represent quantities; five records does not necessarily mean five physical units.
- Checks: lint passed, 48/48 unit tests passed, 137/137 real-database tests passed.

Count-only inspection/cleanup receipts are stored in ignored `artifacts.local/`. No passwords were printed or included in documentation. Administrative credentials were entered only in the private terminal prompt.

The ordinary checks use `hospital_it_helpdesk_test`. `npm run check:fresh` is an optional separate fresh-install audit: to run it again later, first explicitly create a new isolated audit database with `scripts/prepare-fresh-test-db.ps1`. Do not point test commands at `.env` or development. The obsolete audit database is no longer needed for normal application use.
