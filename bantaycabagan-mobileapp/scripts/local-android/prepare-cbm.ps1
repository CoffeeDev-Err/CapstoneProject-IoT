param([switch]$Fresh)

$ErrorActionPreference = 'Stop'

$sourceRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$repoRoot = Split-Path -Parent $sourceRoot
$destinationRoot = 'C:\cbm'
$contractsDestination = 'C:\contracts'
$expectedPackage = 'com.bantaycabagan.mobileapp'

function Assert-CbmDestination {
    if (-not (Test-Path -LiteralPath $destinationRoot)) { return }

    $resolvedDestination = (Resolve-Path -LiteralPath $destinationRoot).Path
    if ($resolvedDestination -ne $destinationRoot) {
        throw "Refusing to modify unexpected destination: $resolvedDestination"
    }

    $destinationItem = Get-Item -LiteralPath $destinationRoot -Force
    if (($destinationItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw 'C:\cbm must be a real directory, not a junction or symbolic link.'
    }
}

$appConfigPath = Join-Path $sourceRoot 'app.json'
$appConfig = Get-Content -LiteralPath $appConfigPath -Raw | ConvertFrom-Json
if ($appConfig.expo.android.package -ne $expectedPackage) {
    throw "The source directory is not the expected GeoSentri mobile app: $sourceRoot"
}

$requiredLocalFiles = @(
    '.env',
    'credentials.json',
    'credentials\android\keystore.jks'
)
foreach ($relativePath in $requiredLocalFiles) {
    $requiredPath = Join-Path $sourceRoot $relativePath
    if (-not (Test-Path -LiteralPath $requiredPath)) {
        throw "Missing required local build file: $requiredPath"
    }
}

$contractSource = Join-Path $repoRoot 'contracts\domain-contracts.json'
if (-not (Test-Path -LiteralPath $contractSource)) {
    throw "Missing shared domain contract: $contractSource"
}

Assert-CbmDestination

$previousLockHash = $null
$destinationLock = Join-Path $destinationRoot 'package-lock.json'
if (Test-Path -LiteralPath $destinationLock) {
    $previousLockHash = (Get-FileHash -LiteralPath $destinationLock -Algorithm SHA256).Hash
}

if ($Fresh -and (Test-Path -LiteralPath $destinationRoot)) {
    $backupRoot = "C:\cbm-backup-$((Get-Date).ToString('yyyyMMdd-HHmmss'))"
    Move-Item -LiteralPath $destinationRoot -Destination $backupRoot
    Write-Host "Previous CBM workspace preserved at: $backupRoot" -ForegroundColor Yellow
}

New-Item -ItemType Directory -Path $destinationRoot -Force | Out-Null
Assert-CbmDestination

$excludedDirectories = @(
    (Join-Path $sourceRoot 'node_modules'),
    (Join-Path $sourceRoot '.expo'),
    (Join-Path $sourceRoot 'dist-apk'),
    (Join-Path $sourceRoot 'android\.gradle'),
    (Join-Path $sourceRoot 'android\build'),
    (Join-Path $sourceRoot 'android\app\build'),
    (Join-Path $sourceRoot 'android\app\.cxx')
)
$robocopyArguments = @(
    $sourceRoot,
    $destinationRoot,
    '/E',
    '/COPY:DAT',
    '/DCOPY:DAT',
    '/R:2',
    '/W:1',
    '/XJ',
    '/NFL',
    '/NDL',
    '/NJH',
    '/NJS',
    '/NP',
    '/XD'
) + $excludedDirectories

& robocopy.exe @robocopyArguments
$robocopyExitCode = $LASTEXITCODE
if ($robocopyExitCode -ge 8) {
    throw "CBM source synchronization failed with robocopy exit code $robocopyExitCode."
}

Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'build-local-apk.ps1') `
    -Destination (Join-Path $destinationRoot 'build-local-apk.ps1') -Force
New-Item -ItemType Directory -Path $contractsDestination -Force | Out-Null
Copy-Item -LiteralPath $contractSource `
    -Destination (Join-Path $contractsDestination 'domain-contracts.json') -Force

$sourceLockHash = (Get-FileHash -LiteralPath (Join-Path $sourceRoot 'package-lock.json') -Algorithm SHA256).Hash
$nodeModulesPath = Join-Path $destinationRoot 'node_modules'
$dependenciesChanged = $Fresh -or
    -not (Test-Path -LiteralPath $nodeModulesPath) -or
    $previousLockHash -ne $sourceLockHash

if ($dependenciesChanged) {
    Write-Host 'Installing the exact mobile dependencies from package-lock.json...'
    Push-Location $destinationRoot
    try {
        & npm.cmd ci
        if ($LASTEXITCODE -ne 0) {
            throw "npm ci failed with exit code $LASTEXITCODE."
        }
    } finally {
        Pop-Location
    }
} else {
    Write-Host 'Dependencies are unchanged; existing C:\cbm\node_modules was retained.'
}

Write-Host ''
Write-Host 'CBM WORKSPACE READY' -ForegroundColor Green
Write-Host "Source: $sourceRoot"
Write-Host "Workspace: $destinationRoot"
Write-Host "Version: $($appConfig.expo.version) (code $($appConfig.expo.android.versionCode))"
Write-Host 'Next: run C:\cbm\build-local-apk.ps1 -PreflightOnly'
