#Requires -Version 5.1
<#
  Windows helper for a full modplayjs Android build using the pinned
  prebuilt V8 (NativeScript/v8-buildscripts) - no Chromium checkout.

  Usage:
    .\scripts\build-windows.ps1
    .\scripts\build-windows.ps1 -Task :app:assembleRelease
    .\scripts\build-windows.ps1 -SkipV8        # stub JNI build

  Prerequisites:
    - JDK 21 (JAVA_HOME)
    - Android SDK 37, build-tools 37.0.0, NDK 29.0.14206865,
      CMake 4.1.2 (ANDROID_HOME)
    - Node.js 22
    - `tar` available (Windows 10 1803+)
#>
param(
    [string]$Task = ":app:assembleDebug",
    [string]$Abi = "arm64-v8a",
    [switch]$SkipV8
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
Set-Location $Root

function Require-Command([string]$Name) {
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Missing required command: $Name"
    }
}

Require-Command node
Require-Command npm
Require-Command java
Require-Command tar

if (-not $env:JAVA_HOME) {
    throw "JAVA_HOME is not set. Point it at a JDK 21 installation."
}
if (-not $env:ANDROID_HOME -and -not $env:ANDROID_SDK_ROOT) {
    throw "ANDROID_HOME is not set. Point it at the Android SDK."
}
if (-not $env:ANDROID_HOME) { $env:ANDROID_HOME = $env:ANDROID_SDK_ROOT }

$V8Dir = ""
if (-not $SkipV8) {
    $V8Dir = (node "apps/android/scripts/fetch-v8.mjs" $Abi).Trim()
    if ($LASTEXITCODE -ne 0) { throw "V8 fetch failed" }
}

Write-Host "Installing JS dependencies..."
npm ci
if ($LASTEXITCODE -ne 0) { throw "npm ci failed" }

Write-Host "Building JS packages..."
npm run build
if ($LASTEXITCODE -ne 0) { throw "JS build failed" }

Write-Host "Building Android engine bundle..."
npm run build:engine -w @modplayjs/android
if ($LASTEXITCODE -ne 0) { throw "engine bundle failed" }

Set-Location (Join-Path $Root "apps\android")
$GradleArgs = @($Task)
if (-not $SkipV8) {
    $GradleV8 = $V8Dir.Replace('\', '/')
    $GradleArgs += "-Pv8Dir=$GradleV8"
}

Write-Host "Running .\gradlew.bat $($GradleArgs -join ' ')"
& .\gradlew.bat @GradleArgs
if ($LASTEXITCODE -ne 0) { throw "Gradle build failed" }

Write-Host "Done. APK is under apps\android\app\build\outputs\apk\."
