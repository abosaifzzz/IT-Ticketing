# Reviewed MiAdmin user import

Completed in the local development database on 2026-11-17, using its existing restricted application connection and the existing active Admin identity for audit attribution.

- Source: `MiAdmin_Users.xlsx`, 346 rows, Arabic username header and `Full Name`.
- Owner requested exclusion of all four rows involved in duplicate login names: spreadsheet rows 204, 205, 284 and 285. These people will be added manually later. No names were merged and no replacement usernames were invented.
- Imported: **342 active employee login accounts**, with independently salted Argon2id hashes for the requested initial credential, mandatory password change and mandatory phone/department setup.
- Username case/surrounding whitespace is normalized. Internal spaces are preserved, including the 14 source usernames containing them. Workbook contents are data only; formulas/macros are not executed.
- Retired: **132 old imported directory records** using their original receipt mappings. They are inactive in active lookups; retained references/history and existing departments were preserved.
- Existing login credentials were not reset. No existing username matched the reviewed source before import.

Verification checked all 342 initial hashes and setup/activity/role flags, confirmed 342 distinct hashes and absence of the two excluded usernames, and verified a repeat dry run would create zero accounts and recognize all 342 imported identities. Lint, 48 unit tests and the three focused first-login integration tests passed for the workbook-header/internal-space compatibility changes.

Private reviewed input, plan, result and verification receipts are under ignored `artifacts.local/miadmin-*.local`. These contain the authoritative source checksum, exclusions and audit actor; do not commit roster data. The original workbook was not edited. Future retries must use the same reviewed subset, not the unfiltered original workbook. The strict general importer intentionally rejects the original duplicate rows.

Authentication passwords remain hashed and unreadable; Admin sees password/setup status and reset controls. The owner can add the four excluded people manually with distinct usernames through the existing Admin API/UI. Each must complete password, phone and department setup before normal access.
