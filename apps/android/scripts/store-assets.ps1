#Requires -Version 5.1
<#
  Assembles the Play Store upload assets into apps/android/store/upload/
  (git-ignored) and, with a phone connected, captures the screenshots.

  Usage:
    .\scripts\store-assets.ps1                 # icon + feature + screenshots
    .\scripts\store-assets.ps1 -SkipCapture    # icon + feature + validate only

  Why a separate folder: Play wants one file per slot with exact pixel sizes,
  and the screenshots are captures of a real device. Keeping them out of git
  means nothing to lose when the UI changes — they are regenerated, not edited.

  Screenshot slot rules (Play Console, "Phone assets"):
    - 2 to 8 files, PNG or JPEG, up to 8 MB each
    - 16:9 or 9:16, each side between 320 and 3840 px
    - 4+ files at a minimum of 1080 px per side to qualify for promotion
  A modern phone is taller than 16:9, so each capture is fitted into a
  1080 x 1920 canvas on the app's own background colour. Nothing is cropped:
  the full UI stays visible, with narrow bars either side.
#>
param(
    [string]$Adb = "adb",
    [string]$Suffix = "",
    [switch]$SkipCapture
)

$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
$Store = Join-Path $Root "apps\android\store"
$Out = Join-Path $Store "upload"
$Background = "#0C0A18"   # the app's surface colour (res/values Theme.Modplay)
$CanvasWidth = 1080
$CanvasHeight = 1920

New-Item -ItemType Directory -Force -Path $Out | Out-Null

function Copy-Asset([string]$Name) {
    $src = Join-Path $Store $Name
    if (-not (Test-Path $src)) { throw "Missing source asset: $src" }
    Copy-Item $src (Join-Path $Out $Name) -Force
    Write-Host "copied  $Name"
}

Copy-Asset "icon-512.png"
Copy-Asset "feature-1024x500.png"

# ---------------------------------------------------------------- screenshots

$Shots = @(
    @{ Name = "01-home"; Hint = "Home tab, recent list filled" },
    @{ Name = "02-library"; Hint = "Library tab, with a search or format filter set" },
    @{ Name = "03-player"; Hint = "Playing tab, a tracker module loaded" },
    @{ Name = "04-pattern"; Hint = "Player header -> pattern view, rows visible" },
    @{ Name = "05-folders"; Hint = "Player, swipe left: folder drawer at the playing file" },
    @{ Name = "06-audio"; Hint = "Player, swipe right: audio panel" }
)

Add-Type -AssemblyName System.Drawing

function Convert-ToNineBySixteen([string]$Source, [string]$Target) {
    $image = [System.Drawing.Image]::FromFile($Source)
    try {
        $scale = [Math]::Min($CanvasWidth / $image.Width, $CanvasHeight / $image.Height)
        $width = [int][Math]::Round($image.Width * $scale)
        $height = [int][Math]::Round($image.Height * $scale)
        $bitmap = New-Object System.Drawing.Bitmap($CanvasWidth, $CanvasHeight)
        try {
            $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
            try {
                $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
                $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
                $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml($Background))
                $graphics.DrawImage(
                    $image,
                    [int](($CanvasWidth - $width) / 2),
                    [int](($CanvasHeight - $height) / 2),
                    $width,
                    $height
                )
            } finally { $graphics.Dispose() }
            $bitmap.Save($Target, [System.Drawing.Imaging.ImageFormat]::Png)
        } finally { $bitmap.Dispose() }
    } finally { $image.Dispose() }
}

if (-not $SkipCapture) {
    if (-not (Get-Command $Adb -ErrorAction SilentlyContinue)) {
        throw "adb not found ($Adb). Add platform-tools to PATH or pass -Adb <path\adb.exe>."
    }
    $devices = & $Adb devices 2>&1 | Select-Object -Skip 1 | Where-Object { $_ -match "\sdevice$" }
    if (-not $devices) {
        Write-Warning "No device on '$Adb devices'. Skipping screenshots; run again once it is connected."
    } else {
        Write-Host ""
        Write-Host "Capturing screenshots. For each step, bring the app to that screen, then press Enter."
        Write-Host "Type 's' to skip one, 'q' to stop."
        foreach ($shot in $Shots) {
            Write-Host ""
            Write-Host ("  {0,-12} {1}" -f $shot.Name, $shot.Hint) -ForegroundColor Cyan
            $answer = Read-Host "  Enter to capture"
            if ($answer -eq "q") { break }
            if ($answer -eq "s") { Write-Host "  skipped"; continue }

            $remote = "/sdcard/modplay-shot.png"
            $local = Join-Path $Out ("{0}{1}.png" -f $shot.Name, $Suffix)
            # Capture to a scratch file: System.Drawing keeps the source open
            # while it draws, so converting onto the same path would fail.
            $raw = Join-Path $Out ("_raw-{0}{1}.png" -f $shot.Name, $Suffix)
            & $Adb shell screencap -p $remote | Out-Null
            & $Adb pull $remote $raw | Out-Null
            & $Adb shell rm $remote | Out-Null
            if (-not (Test-Path $raw)) { Write-Warning "  capture failed"; continue }
            Convert-ToNineBySixteen $raw $local
            Remove-Item $raw -Force
            Write-Host "  saved $([System.IO.Path]::GetFileName($local))"
        }
    }
}

# ------------------------------------------------------------------ validation

function Get-ImageInfo([string]$Path) {
    $image = [System.Drawing.Image]::FromFile($Path)
    try { [pscustomobject]@{ Width = $image.Width; Height = $image.Height } }
    finally { $image.Dispose() }
}

$problems = @()
$rows = @()

$icon = Join-Path $Out "icon-512.png"
if (Test-Path $icon) {
    $info = Get-ImageInfo $icon
    $mb = (Get-Item $icon).Length / 1MB
    $ok = $info.Width -eq 512 -and $info.Height -eq 512 -and $mb -le 1
    if (-not $ok) { $problems += "icon-512.png must be 512x512 and <= 1 MB" }
    $rows += [pscustomobject]@{ File = "icon-512.png"; Size = "$($info.Width)x$($info.Height)"; MB = "{0:N2}" -f $mb; Ok = $ok }
}

$feature = Join-Path $Out "feature-1024x500.png"
if (Test-Path $feature) {
    $info = Get-ImageInfo $feature
    $mb = (Get-Item $feature).Length / 1MB
    $ok = $info.Width -eq 1024 -and $info.Height -eq 500 -and $mb -le 15
    if (-not $ok) { $problems += "feature-1024x500.png must be 1024x500 and <= 15 MB" }
    $rows += [pscustomobject]@{ File = "feature-1024x500.png"; Size = "$($info.Width)x$($info.Height)"; MB = "{0:N2}" -f $mb; Ok = $ok }
}

$shots = Get-ChildItem $Out -Filter "*.png" | Where-Object { $_.Name -match "^\d\d-" } | Sort-Object Name
foreach ($file in $shots) {
    $info = Get-ImageInfo $file.FullName
    $mb = $file.Length / 1MB
    $ratio = $info.Width / $info.Height
    $nineBySixteen = [Math]::Abs($ratio - (9 / 16)) -lt 0.01
    $sixteenByNine = [Math]::Abs($ratio - (16 / 9)) -lt 0.01
    $sidesOk = $info.Width -ge 320 -and $info.Width -le 3840 -and
               $info.Height -ge 320 -and $info.Height -le 3840
    $ok = ($nineBySixteen -or $sixteenByNine) -and $sidesOk -and $mb -le 8
    if (-not $ok) { $problems += "$($file.Name) fails the phone-screenshot rules" }
    $rows += [pscustomobject]@{ File = $file.Name; Size = "$($info.Width)x$($info.Height)"; MB = "{0:N2}" -f $mb; Ok = $ok }
}

Write-Host ""
$rows | Format-Table -AutoSize

if ($shots.Count -lt 2) {
    Write-Warning "Play needs at least 2 phone screenshots; there are $($shots.Count)."
} elseif ($shots.Count -lt 4) {
    Write-Warning "$($shots.Count) screenshots: valid, but 4+ are needed to qualify for promotion."
}

if ($problems.Count -gt 0) {
    $problems | ForEach-Object { Write-Warning $_ }
    exit 1
}

Write-Host "Assets ready in $Out"
