param([switch]$PreflightOnly)

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$androidDir = Join-Path $projectRoot 'android'
$apkPath = Join-Path $androidDir 'app\build\outputs\apk\release\app-release.apk'
$expectedPackage = 'com.bantaycabagan.mobileapp'
$expectedSigner = '3bcd799ba0fd217a7252e3fd3edbdd20232d435239292ee30fabbad0e7b48398'

function Assert-LastExitCode([string]$action) {
    if ($LASTEXITCODE -ne 0) {
        throw "$action failed with exit code $LASTEXITCODE."
    }
}

function Import-DotEnv([string]$path) {
    if (-not (Test-Path -LiteralPath $path)) {
        throw "Missing environment file: $path"
    }
    foreach ($line in Get-Content -LiteralPath $path) {
        if ($line -match '^\s*#' -or [string]::IsNullOrWhiteSpace($line)) { continue }
        if ($line -notmatch '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$') { continue }
        $name = $matches[1]
        $value = $matches[2].Trim()
        if (($value.StartsWith('"') -and $value.EndsWith('"')) -or
            ($value.StartsWith("'") -and $value.EndsWith("'"))) {
            $value = $value.Substring(1, $value.Length - 2)
        }
        [Environment]::SetEnvironmentVariable($name, $value, 'Process')
    }
}

if ((Resolve-Path -LiteralPath $projectRoot).Path -ne 'C:\cbm') {
    throw 'Run this build only from the prepared C:\cbm workspace.'
}

Import-DotEnv (Join-Path $projectRoot '.env')
$env:EXPO_PUBLIC_MAP_PREVIEW = 'false'
$env:ALLOW_CLEARTEXT_TRAFFIC = 'false'

if ($env:EXPO_PUBLIC_API_URL -ne 'https://13.229.17.177') {
    throw 'EXPO_PUBLIC_API_URL must target the deployed GeoSentri AWS backend.'
}
if ([string]::IsNullOrWhiteSpace($env:EXPO_PUBLIC_MAPTILER_API_KEY)) {
    throw 'EXPO_PUBLIC_MAPTILER_API_KEY is missing.'
}

$appConfig = Get-Content -LiteralPath (Join-Path $projectRoot 'app.json') -Raw | ConvertFrom-Json
$packageMetadata = Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json
$expectedVersion = [string]$appConfig.expo.version
$expectedVersionCode = [int]$appConfig.expo.android.versionCode
if ($expectedVersion -ne [string]$packageMetadata.version) {
    throw 'The app.json and package.json versions do not match.'
}

$gradleText = Get-Content -LiteralPath (Join-Path $androidDir 'app\build.gradle') -Raw
if ($gradleText -notmatch "applicationId\s+'$([regex]::Escape($expectedPackage))'") {
    throw 'The Android application ID does not match the GeoSentri package.'
}
$versionNamePattern = 'versionName\s+"{0}"' -f [regex]::Escape($expectedVersion)
if ($gradleText -notmatch "versionCode\s+$expectedVersionCode\b" -or
    $gradleText -notmatch $versionNamePattern) {
    throw 'The native Android version does not match app.json.'
}

$credentials = Get-Content -LiteralPath (Join-Path $projectRoot 'credentials.json') -Raw | ConvertFrom-Json
$keystore = Join-Path $projectRoot $credentials.android.keystore.keystorePath
if (-not (Test-Path -LiteralPath $keystore)) {
    throw 'The EAS-compatible release keystore is missing.'
}

$javaHome = $env:JAVA_HOME
if ([string]::IsNullOrWhiteSpace($javaHome)) {
    throw 'JAVA_HOME is not configured.'
}
$keytool = Join-Path $javaHome 'bin\keytool.exe'
$savedErrorPreference = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
$keytoolOutput = & $keytool -list -v -keystore $keystore `
    -storepass $credentials.android.keystore.keystorePassword `
    -alias $credentials.android.keystore.keyAlias 2>&1
$keytoolExitCode = $LASTEXITCODE
$ErrorActionPreference = $savedErrorPreference
if ($keytoolExitCode -ne 0) {
    throw "Release keystore verification failed with exit code $keytoolExitCode."
}
$signerLine = $keytoolOutput | Select-String -Pattern 'SHA256:' | Select-Object -First 1
if (-not $signerLine) { throw 'Could not read the release signing certificate.' }
$keystoreSigner = $signerLine.ToString().Split(':', 2)[1].Trim().Replace(':', '').ToLowerInvariant()
if ($keystoreSigner -ne $expectedSigner) {
    throw 'The release key does not match the EAS APK signing certificate.'
}

$androidSdk = if (-not [string]::IsNullOrWhiteSpace($env:ANDROID_HOME)) {
    $env:ANDROID_HOME
} else {
    Join-Path $env:LOCALAPPDATA 'Android\Sdk'
}
$buildTools = Get-ChildItem -LiteralPath (Join-Path $androidSdk 'build-tools') -Directory |
    Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'apksigner.bat') } |
    Sort-Object { [version]$_.Name } -Descending |
    Select-Object -First 1
if (-not $buildTools) { throw 'Android SDK build tools were not found.' }
$apkSigner = Join-Path $buildTools.FullName 'apksigner.bat'
$aapt2 = Join-Path $buildTools.FullName 'aapt2.exe'
$zipAlign = Join-Path $buildTools.FullName 'zipalign.exe'
$adb = Join-Path $androidSdk 'platform-tools\adb.exe'

if (Test-Path -LiteralPath $adb) {
    $connectedDevices = & $adb devices | Select-String -Pattern '^([^\s]+)\s+device$'
    foreach ($connectedDevice in $connectedDevices) {
        $serial = $connectedDevice.Matches[0].Groups[1].Value
        $installedPackage = (& $adb -s $serial shell dumpsys package $expectedPackage 2>$null) -join "`n"
        if ($installedPackage -match 'versionCode=(\d+)') {
            $installedVersionCode = [int]$matches[1]
            if ($expectedVersionCode -lt $installedVersionCode) {
                throw "Version code $expectedVersionCode is lower than the connected phone's installed code $installedVersionCode. Increase versionCode in app.json and android\app\build.gradle before building."
            }
            Write-Host "Connected phone version check: installed code $installedVersionCode, build code $expectedVersionCode."
        }
    }
}

Push-Location $projectRoot
try {
    & node 'scripts\build-config-check.cjs'
    Assert-LastExitCode 'GeoSentri build configuration check'
    & node 'scripts\typecheck.cjs'
    Assert-LastExitCode 'GeoSentri mobile type-check'
} finally {
    Pop-Location
}

if ($PreflightOnly) {
    Write-Host 'LOCAL APK PREFLIGHT PASSED' -ForegroundColor Green
    Write-Host "Package: $expectedPackage"
    Write-Host "Version: $expectedVersion (code $expectedVersionCode)"
    Write-Host 'Architectures to build: arm64-v8a, armeabi-v7a'
    Write-Host 'Signing key: matches the existing EAS APK'
    exit 0
}

if (Test-Path -LiteralPath $apkPath) {
    Remove-Item -LiteralPath $apkPath -Force
}

Write-Host ''
Write-Host 'Building GeoSentri release APK for arm64-v8a and armeabi-v7a...'
Push-Location $androidDir
try {
    & '.\gradlew.bat' ':app:assembleRelease' `
        '-PreactNativeArchitectures=armeabi-v7a,arm64-v8a' `
        '--no-daemon' '--stacktrace'
    Assert-LastExitCode 'Gradle release build'
} finally {
    Pop-Location
}

if (-not (Test-Path -LiteralPath $apkPath)) {
    throw "Gradle completed without producing the expected APK: $apkPath"
}

& $zipAlign -c -P 16 -v 4 $apkPath | Out-Null
Assert-LastExitCode 'APK alignment verification'

$signatureOutput = & $apkSigner verify --verbose --print-certs $apkPath 2>&1
Assert-LastExitCode 'APK signature verification'
$apkSignerLine = $signatureOutput | Select-String -Pattern 'certificate SHA-256 digest:' | Select-Object -First 1
if (-not $apkSignerLine) { throw 'Could not read the APK signing certificate.' }
$apkSignerDigest = $apkSignerLine.ToString().Split(':', 2)[1].Trim().ToLowerInvariant()
if ($apkSignerDigest -ne $expectedSigner) {
    throw 'Built APK signature does not match the EAS release certificate.'
}

$badging = (& $aapt2 dump badging $apkPath 2>&1) -join "`n"
Assert-LastExitCode 'APK manifest inspection'
if ($badging -notmatch "package: name='([^']+)' versionCode='([^']+)' versionName='([^']+)'") {
    throw 'Could not read the APK package metadata.'
}
$actualPackage = $matches[1]
$actualVersionCode = [int]$matches[2]
$actualVersion = $matches[3]
if ($actualPackage -ne $expectedPackage -or
    $actualVersionCode -ne $expectedVersionCode -or
    $actualVersion -ne $expectedVersion) {
    throw "Unexpected APK metadata: $actualPackage $actualVersion ($actualVersionCode)."
}
if ($badging -notmatch "native-code:.*'arm64-v8a'" -or
    $badging -notmatch "native-code:.*'armeabi-v7a'") {
    throw 'The APK does not contain both required ARM architectures.'
}

$outputDir = Join-Path $projectRoot 'dist-apk'
New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
$verifiedApk = Join-Path $outputDir "GeoSentri-$expectedVersion-v$expectedVersionCode-arm-universal.apk"
Copy-Item -LiteralPath $apkPath -Destination $verifiedApk -Force

Write-Host ''
Write-Host 'LOCAL APK BUILD VERIFIED' -ForegroundColor Green
Write-Host "APK: $verifiedApk"
Write-Host "Package: $actualPackage"
Write-Host "Version: $actualVersion (code $actualVersionCode)"
Write-Host 'Architectures: arm64-v8a, armeabi-v7a'
Write-Host 'Signing key: matches the existing EAS APK'
Write-Host "SHA-256: $((Get-FileHash -LiteralPath $verifiedApk -Algorithm SHA256).Hash)"
