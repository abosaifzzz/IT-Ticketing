Verified locally on 2026-11-19 after migration 019 was applied through the private operator workflow.

- Development and test both have the updated manual-ownership constraint. Development had three explicitly account-linked manual tickets; all three have employee ownership after backfill. No ownership was inferred from names.
- Backend lint passed; 50 unit tests passed; the final complete live-MySQL suite passed 140/140 using fictional test fixtures. Local output is in ignored artifacts.local/manual-ticket-final.local.
- Coverage includes both IT roles creating account-owned manual tickets, employee listing/detail visibility and unrelated-account isolation, incomplete employee setup, ticket-only contact snapshots, retry deduplication, inactive-account rejection, existing workflow/internal-note restrictions, repeated successful Admin reauthentication and temporary-password reset/session revocation.
- One prior audit assertion expected the old unowned manual-ticket behavior; it was corrected and the entire suite rerun successfully.
- No frontend files were edited in this task. Sound consistency, coded Admin dialogs and updated picker behavior still need the separate frontend implementation prompt. These local checks do not establish production readiness.
