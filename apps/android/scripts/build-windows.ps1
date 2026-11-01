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

$V8Version = "14.9.207.39"
$V8Tag = "v8-$V8Version-7"
$V8Base = "https://github.com/NativeScript/v8-buildscripts/releases/download/$V8Tag"
$OutDir = Join-Path $Root "build\v8-prebuilt"
$V8Dir = Join-Path $OutDir "v8-$Abi"

if (-not $SkipV8) {
    $Lib = Join-Path $V8Dir "lib\libv8_monolith.a"
    if (-not (Test-Path $Lib)) {
        New-Item -ItemType Directory -Force $OutDir | Out-Null
        $Archive = Join-Path $OutDir "v8-$V8Version-android-$Abi.tar.gz"
        $Sums = Join-Path $OutDir "SHA256SUMS"

        Write-Host "Fetching V8 $V8Version ($Abi)..."
        Invoke-WebRequest "$V8Base/v8-$V8Version-android-$Abi.tar.gz" -OutFile $Archive
        Invoke-WebRequest "$V8Base/SHA256SUMS" -OutFile $Sums

        $Line = Select-String -Path $Sums -Pattern "v8-$V8Version-android-$Abi.tar.gz" |
            Select-Object -First 1
        if (-not $Line) { throw "V8 checksum entry not found for $Abi" }
        $Expected = (($Line.Line -split '\s+')[0]).ToLowerInvariant()
        $Actual = (Get-FileHash $Archive -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($Actual -ne $Expected) {
            throw "V8 checksum mismatch: expected $Expected, got $Actual"
        }

        tar -xzf $Archive -C $OutDir
        $Extracted = Join-Path $OutDir "android-$Abi"
        if (Test-Path $V8Dir) { Remove-Item -Recurse -Force $V8Dir }
        Move-Item $Extracted $V8Dir
    } else {
        Write-Host "Using existing V8 at $V8Dir"
    }
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
