$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
$adminSecret = Read-Host 'Enter your MySQL root password privately to migrate development and test databases' -AsSecureString
$secretPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($adminSecret)
try {
    $env:HELPDESK_MIGRATION_ADMIN_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($secretPointer)
    node scripts/migrate-local-db.js
    if ($LASTEXITCODE -ne 0) { throw 'Migration stopped. Review the safe status message above.' }
} finally {
    Remove-Item Env:HELPDESK_MIGRATION_ADMIN_PASSWORD -ErrorAction SilentlyContinue
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($secretPointer)
    $adminSecret.Dispose()
}
