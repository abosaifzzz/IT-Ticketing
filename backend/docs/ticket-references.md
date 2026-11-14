# Permanent ticket references

Tickets now expose a server-generated `reference` such as `IT0`, `IT1`, `IT2`. The full UUID remains `id` and continues to identify routes, ownership, assignments, history, withdrawals and notifications. Clients must not submit reference/sequence fields when creating tickets.

Migration `009_ticket_references.sql` assigns existing tickets in creation-time/UUID order, starting with IT0, and adds a unique unsigned BIGINT AUTO_INCREMENT sequence. Public references use sequence minus one. New allocations are database-controlled across concurrent requests and processes; counters do not reset per role, date or server restart. Existing idempotency keys retain the original ticket and reference. MySQL can leave gaps after rolled-back or duplicate insert attempts; numbers must never be reused or renumbered. The practical maximum reference is IT18446744073709551614, rather than mathematical infinity.

The API includes reference on ticket lists/details/action results and unassigned queue summaries. Scoped search accepts IT references. Recurring summaries include `ticketReferences` alongside internal `ticketIds`. New notification copy uses the IT reference; historical persisted notification messages remain unchanged. Frontend cards, lists, details, assignment modals and tracking popups display the permanent reference with LTR isolation inside the Arabic UI. Internal UUIDs stay in URLs and requests.

Apply using the existing private terminal workflow from backend/:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\migrate-local-db.ps1
```

Never put administrator passwords in chat, source or command arguments. The workflow runs migrations twice and verifies checksums on development/test. No additional grants or tables are required.

Verified locally 2026-11-05: migration applied to development and test; the three existing development tickets are IT0, IT1 and IT2 with unique numbers. Backend lint, 32 isolated tests and 68 live-database tests passed. Tests include concurrent allocation, search, persistence and idempotent retries. Frontend lint/build passed with the existing bundle-size advisory. Existing ticket data and ownership were preserved. Restart the backend if it is not running in watch mode, then refresh the browser.
