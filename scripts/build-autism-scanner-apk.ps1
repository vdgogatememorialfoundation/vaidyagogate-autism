# Build Autism-only scanner debug APK (Capacitor Android)
# Requires: Node.js, JDK 17+, Android SDK

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent

Write-Host "Syncing Autism scanner Capacitor config..." -ForegroundColor Cyan
node (Join-Path $root "scripts\sync-mobile-capacitor.js") --scanner-only
if ($LASTEXITCODE -ne 0) { throw "sync-mobile-capacitor.js failed" }

& (Join-Path $root "scripts\build-scanner-apk.ps1")

$apkRoot = Join-Path $root "Autism-Scanner-debug.apk"
$apkLegacy = Join-Path $root "VGMF-Scanner-debug.apk"
$downloads = Join-Path $root "public\downloads"
if (Test-Path $apkLegacy) {
    Copy-Item $apkLegacy $apkRoot -Force
    New-Item -ItemType Directory -Force -Path $downloads | Out-Null
    Copy-Item $apkRoot (Join-Path $downloads "autism-scanner.apk") -Force
    Write-Host ""
    Write-Host "Web download copy:" -ForegroundColor Green
    Write-Host "  public\downloads\autism-scanner.apk"
    Write-Host "  https://autism.vaidyagogate.org/scanner-download.html"
}
