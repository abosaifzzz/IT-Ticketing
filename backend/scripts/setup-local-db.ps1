$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)

function Convert-SetupSecret([Security.SecureString] $Secret) {
    $secretPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secret)
    try {
        return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($secretPointer)
    } finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($secretPointer)
    }
}

try {
    $adminSecret = Read-Host 'Enter the MySQL root password you set during installation' -AsSecureString
    $appSecret = Read-Host 'Choose an application database password (at least 16 characters)' -AsSecureString
    $env:HELPDESK_SETUP_ADMIN_PASSWORD = Convert-SetupSecret $adminSecret
    $env:HELPDESK_SETUP_APP_PASSWORD = Convert-SetupSecret $appSecret
    node scripts/setup-local-db.js
    if ($LASTEXITCODE -ne 0) { throw 'Setup stopped. Review the safe status message above.' }
} finally {
    Remove-Item Env:HELPDESK_SETUP_ADMIN_PASSWORD -ErrorAction SilentlyContinue
    Remove-Item Env:HELPDESK_SETUP_APP_PASSWORD -ErrorAction SilentlyContinue
    if ($adminSecret) { $adminSecret.Dispose() }
    if ($appSecret) { $appSecret.Dispose() }
}
