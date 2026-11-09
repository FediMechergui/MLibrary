$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
if (-not $env:JAVA_HOME -or -not (Test-Path -LiteralPath "$env:JAVA_HOME\bin\java.exe")) { $env:JAVA_HOME = 'C:\Program Files\Microsoft\jdk-21.0.12.101-hotspot' }
if (-not $env:ANDROID_HOME) { $env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
if (-not $env:VITE_API_BASE_URL) { $env:VITE_API_BASE_URL = 'https://mlibrary-fedimechergui.netlify.app' }
& npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw 'Web build failed' }
& npx.cmd cap sync android
if ($LASTEXITCODE -ne 0) { throw 'Capacitor sync failed' }
Push-Location -LiteralPath (Join-Path $projectRoot 'android')
try { & .\gradlew.bat assembleDebug --no-daemon; if ($LASTEXITCODE -ne 0) { throw 'Android build failed' } } finally { Pop-Location }
New-Item -ItemType Directory -Path (Join-Path $projectRoot 'artifacts') -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $projectRoot 'android\app\build\outputs\apk\debug\app-debug.apk') -Destination (Join-Path $projectRoot 'artifacts\MLibrary-debug.apk')
Write-Output 'APK: artifacts/MLibrary-debug.apk'
