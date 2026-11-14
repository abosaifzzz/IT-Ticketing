$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
$freshSecret = Read-Host 'Enter MySQL root password privately to create a NEW isolated audit database only' -AsSecureString
$freshPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($freshSecret)
try {
    $env:HELPDESK_FRESH_ADMIN_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($freshPointer)
    node scripts/prepare-fresh-test-db.js
    if ($LASTEXITCODE -ne 0) { throw 'Fresh database preparation stopped. Review the safe status above.' }
} finally {
    Remove-Item Env:HELPDESK_FRESH_ADMIN_PASSWORD -ErrorAction SilentlyContinue
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($freshPointer)
    $freshSecret.Dispose()
}
