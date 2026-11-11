param([switch]$SkipWeb)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
if (-not $env:JAVA_HOME) { $env:JAVA_HOME = 'C:\Program Files\Microsoft\jdk-21.0.12.101-hotspot' }
if (-not $env:ANDROID_HOME) { $env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
if (-not $env:VITE_API_BASE_URL) { $env:VITE_API_BASE_URL = 'https://mlibrary-fedimechergui.netlify.app' }
$env:MLIBRARY_NATIVE_BUILD = '1'
$privateDir = Join-Path $projectRoot '.private'
$env:MLIBRARY_UPLOAD_STORE = Join-Path $privateDir 'mlibrary-upload.p12'
$passwordPath = Join-Path $privateDir 'upload-password.dpapi'
if (-not ((Test-Path -LiteralPath $env:MLIBRARY_UPLOAD_STORE) -and (Test-Path -LiteralPath $passwordPath))) { throw 'Run scripts/setup-signing.ps1 on the signing computer first.' }
Add-Type -AssemblyName System.Security
$env:MLIBRARY_UPLOAD_PASSWORD = [Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($passwordPath), $null, [Security.Cryptography.DataProtectionScope]::CurrentUser))
try {
    if (-not $SkipWeb) {
        & npm.cmd run build
        if ($LASTEXITCODE -ne 0) { throw 'Web build failed' }
        & npx.cmd cap sync android
        if ($LASTEXITCODE -ne 0) { throw 'Capacitor sync failed' }
    }
    Push-Location -LiteralPath (Join-Path $projectRoot 'android')
    try { & .\gradlew.bat testReleaseUnitTest bundleRelease assembleRelease --no-daemon; if ($LASTEXITCODE -ne 0) { throw 'Store build failed' } } finally { Pop-Location }
    $version = (Get-Content -Raw -Encoding UTF8 package.json | ConvertFrom-Json).version
    New-Item -ItemType Directory -Path artifacts -Force | Out-Null
    Copy-Item -LiteralPath android/app/build/outputs/bundle/release/app-release.aab -Destination "artifacts/MLibrary-$version-store.aab"
    Copy-Item -LiteralPath android/app/build/outputs/apk/release/app-release.apk -Destination "artifacts/MLibrary-$version-store.apk"
    Write-Output "Signed store artifacts: artifacts/MLibrary-$version-store.aab and -store.apk"
} finally { Remove-Item Env:MLIBRARY_UPLOAD_PASSWORD -ErrorAction SilentlyContinue; Remove-Item Env:MLIBRARY_UPLOAD_STORE -ErrorAction SilentlyContinue }
