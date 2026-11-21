$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
$cleanupSecret = Read-Host 'MySQL root password (hidden): remove ONLY the empty obsolete fresh-test database' -AsSecureString
$cleanupPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($cleanupSecret)
try {
    $env:HELPDESK_CLEANUP_ADMIN_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($cleanupPointer)
    node scripts/remove-obsolete-fresh-db.js
    if ($LASTEXITCODE -ne 0) { throw 'Cleanup stopped. Review the safe status above.' }
} finally {
    Remove-Item Env:HELPDESK_CLEANUP_ADMIN_PASSWORD -ErrorAction SilentlyContinue
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($cleanupPointer)
    $cleanupSecret.Dispose()
}
