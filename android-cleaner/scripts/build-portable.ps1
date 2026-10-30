$ErrorActionPreference = "Stop"

$root = Split-Path $PSScriptRoot -Parent
$workspace = Split-Path $root -Parent
$mingw = Join-Path $workspace "tools\mingw64\bin"

if (Test-Path $mingw) {
    $env:Path = "$mingw;$env:USERPROFILE\.cargo\bin;$env:Path"
}
if (-not $env:CARGO_BUILD_JOBS) {
    $env:CARGO_BUILD_JOBS = "2"
}

Write-Host "Building Tauri app..." -ForegroundColor Cyan
Push-Location $root
try {
    & npm.cmd run tauri build -- --no-bundle
    if ($LASTEXITCODE -ne 0) { throw "Tauri build failed ($LASTEXITCODE)" }

    Write-Host "Building single-file launcher..." -ForegroundColor Cyan
    Push-Location (Join-Path $root "launcher")
    try {
        & cargo build --release
        if ($LASTEXITCODE -ne 0) { throw "launcher build failed ($LASTEXITCODE)" }
    } finally {
        Pop-Location
    }

    $launcher = Join-Path $root "launcher\target\release\android-cleaner-launcher.exe"
    if (-not (Test-Path $launcher)) { throw "launcher output not found: $launcher" }

    $projectRootExe = Join-Path $root "AndroidStorageCleaner.exe"
    $workspaceRootExe = Join-Path $workspace "AndroidStorageCleaner.exe"
    Copy-Item $launcher $projectRootExe -Force
    Copy-Item $launcher $workspaceRootExe -Force

    # Legacy folder from earlier builds.
    $legacyRelease = Join-Path $root "release"
    if (Test-Path $legacyRelease) { Remove-Item $legacyRelease -Recurse -Force }

    # Transient build output; the portable exe already embeds the frontend.
    foreach ($dir in @(
        (Join-Path $root "dist"),
        (Join-Path $root "src-tauri\target\debug"),
        (Join-Path $root "launcher\target\debug"),
        (Join-Path $root "src-tauri\target\release\android-cleaner.exe"),
        (Join-Path $root "src-tauri\target\release\WebView2Loader.dll"),
        (Join-Path $root "launcher\target\release\android-cleaner-launcher.exe")
    )) {
        if (Test-Path $dir) { Remove-Item $dir -Recurse -Force -ErrorAction SilentlyContinue }
    }

    $size = [math]::Round((Get-Item $projectRootExe).Length / 1MB, 1)
    Write-Host ""
    Write-Host "Portable executable ready ($size MB):" -ForegroundColor Green
    Write-Host "  $projectRootExe"
    Write-Host "  $workspaceRootExe"
} finally {
    Pop-Location
}

exit 0
