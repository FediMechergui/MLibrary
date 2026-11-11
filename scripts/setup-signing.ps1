$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$privateDir = Join-Path $projectRoot '.private'
if (-not $env:JAVA_HOME) { $env:JAVA_HOME = 'C:\Program Files\Microsoft\jdk-21.0.12.101-hotspot' }
$keytool = Join-Path $env:JAVA_HOME 'bin\keytool.exe'
if (-not (Test-Path -LiteralPath $keytool)) { throw 'JDK 21 keytool is required' }
New-Item -ItemType Directory -Path $privateDir -Force | Out-Null
$identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
& icacls.exe $privateDir /inheritance:r /grant:r "${identity}:(OI)(CI)F" 'SYSTEM:(OI)(CI)F' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not restrict signing directory access' }
$storePath = Join-Path $privateDir 'mlibrary-upload.p12'
$passwordPath = Join-Path $privateDir 'upload-password.dpapi'
Add-Type -AssemblyName System.Security
if ((Test-Path -LiteralPath $storePath) -or (Test-Path -LiteralPath $passwordPath)) {
    if (-not ((Test-Path -LiteralPath $storePath) -and (Test-Path -LiteralPath $passwordPath))) { throw 'Incomplete signing setup. Recover the existing key; do not replace it.' }
    Write-Output 'Existing permanent upload key preserved.'
    exit 0
}
$random = New-Object byte[] 32
$generator = [Security.Cryptography.RandomNumberGenerator]::Create()
$generator.GetBytes($random)
$generator.Dispose()
$password = [Convert]::ToBase64String($random)
$protected = [Security.Cryptography.ProtectedData]::Protect([Text.Encoding]::UTF8.GetBytes($password), $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
[IO.File]::WriteAllBytes($passwordPath, $protected)
$env:MLIBRARY_UPLOAD_PASSWORD = $password
try {
    & $keytool -genkeypair -keystore $storePath -storetype PKCS12 -storepass:env MLIBRARY_UPLOAD_PASSWORD -alias mlibrary-upload -keyalg RSA -keysize 4096 -validity 10000 -dname 'CN=MLibrary Upload, O=MLibrary' -noprompt
    if ($LASTEXITCODE -ne 0) { throw 'Upload key creation failed. Preserve the password file for recovery.' }
    New-Item -ItemType Directory -Path (Join-Path $projectRoot 'artifacts') -Force | Out-Null
    & $keytool -exportcert -rfc -keystore $storePath -storepass:env MLIBRARY_UPLOAD_PASSWORD -alias mlibrary-upload -file (Join-Path $projectRoot 'artifacts\MLibrary-upload-certificate.pem')
    if ($LASTEXITCODE -ne 0) { throw 'Certificate export failed' }
    Write-Output 'Permanent upload key created. Password protected for the current Windows account; private files are excluded from Git.'
} finally { Remove-Item Env:MLIBRARY_UPLOAD_PASSWORD -ErrorAction SilentlyContinue; $password = $null }
