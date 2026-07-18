param(
  [switch]$PromoteExactCrops
)

$ErrorActionPreference = "Stop"
$site = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$root = Split-Path -Parent $site
$candidate = Join-Path $site "visual-audit\candidate-illustrator"
$candidateCrops = Join-Path $site "visual-audit\candidate-crops"
$publicAssets = Join-Path $site "public\assets\illustrator-driven"
$node = "C:\Program Files\nodejs\node.exe"

foreach ($required in @($root, $site, $publicAssets, $node)) {
  if (!(Test-Path -LiteralPath $required)) { throw "Candidate export dependency not found: $required" }
}
New-Item -ItemType Directory -Force -Path $candidate | Out-Null
New-Item -ItemType Directory -Force -Path $candidateCrops | Out-Null
Add-Type -AssemblyName System.Drawing
Add-Type -Path (Join-Path $site "scripts\StrictImageComparer.cs") -ReferencedAssemblies "System.Drawing.dll"

function Fill-ImageRect($Path, $X, $Y, $Width, $Height, $Color) {
  $bitmap = [System.Drawing.Bitmap]::new($Path)
  $temporary = "$Path.tmp.png"
  try {
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $brush = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml($Color))
    try {
      $graphics.FillRectangle($brush, $X, $Y, $Width, $Height)
      $bitmap.Save($temporary, [System.Drawing.Imaging.ImageFormat]::Png)
    }
    finally {
      $brush.Dispose()
      $graphics.Dispose()
    }
  }
  finally {
    $bitmap.Dispose()
  }
  Move-Item -LiteralPath $temporary -Destination $Path -Force
}

function Copy-ImageRect($SourcePath, $TargetPath, $X, $Y, $Width, $Height) {
  $source = [System.Drawing.Bitmap]::new($SourcePath)
  try {
    if ($X -lt 0 -or $Y -lt 0 -or $X + $Width -gt $source.Width -or $Y + $Height -gt $source.Height) {
      throw "Crop outside source bounds: $TargetPath"
    }
    $crop = $source.Clone([System.Drawing.Rectangle]::new($X, $Y, $Width, $Height), $source.PixelFormat)
    try {
      $crop.Save($TargetPath, [System.Drawing.Imaging.ImageFormat]::Png)
    }
    finally {
      $crop.Dispose()
    }
  }
  finally {
    $source.Dispose()
  }
}

function Add-ReplacementImage($PagePath, $ImagePath, $X, $Y, $Width, $Height) {
  $pageBitmap = [System.Drawing.Bitmap]::new($PagePath)
  $replacement = [System.Drawing.Bitmap]::new($ImagePath)
  $temporary = "$PagePath.replacement.tmp.png"
  try {
    if ($replacement.Width -ne $Width -or $replacement.Height -ne $Height) {
      throw "Replacement must already match its exact runtime box: $ImagePath is $($replacement.Width)x$($replacement.Height), expected ${Width}x${Height}."
    }
    $graphics = [System.Drawing.Graphics]::FromImage($pageBitmap)
    try {
      $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
      $graphics.DrawImageUnscaled($replacement, $X, $Y)
      $pageBitmap.Save($temporary, [System.Drawing.Imaging.ImageFormat]::Png)
    }
    finally { $graphics.Dispose() }
  }
  finally {
    $replacement.Dispose()
    $pageBitmap.Dispose()
  }
  Move-Item -LiteralPath $temporary -Destination $PagePath -Force
}

$illustrator = New-Object -ComObject Illustrator.Application
try {
  $illustrator.DoJavaScriptFile((Join-Path $root "illustrator-export-reference-previews.jsx")) | Out-Null
}
finally {
  if ($illustrator) {
    try { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($illustrator) } catch {}
  }
}

Fill-ImageRect (Join-Path $candidate "reservation.png") 1352 2940 36 48 "#FFFFFF"
foreach ($page in @("experiences", "reservation", "blog", "chambres", "galerie")) {
  $homePath = Join-Path $candidate "home.png"
  $target = Join-Path $candidate "$page.png"
  $homeBitmap = [System.Drawing.Bitmap]::new($homePath)
  $targetBitmap = [System.Drawing.Bitmap]::new($target)
  $temporary = "$target.tmp.png"
  try {
    $header = $homeBitmap.Clone([System.Drawing.Rectangle]::new(0, 0, 1920, 189), $homeBitmap.PixelFormat)
    try {
      $graphics = [System.Drawing.Graphics]::FromImage($targetBitmap)
      try {
        $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
        $graphics.DrawImageUnscaled($header, 0, 0)
        $targetBitmap.Save($temporary, [System.Drawing.Imaging.ImageFormat]::Png)
      }
      finally { $graphics.Dispose() }
    }
    finally { $header.Dispose() }
  }
  finally {
    $targetBitmap.Dispose()
    $homeBitmap.Dispose()
  }
  Move-Item -LiteralPath $temporary -Destination $target -Force
}

$siteContent = Get-Content -LiteralPath (Join-Path $site "src\data\siteContent.json") -Raw | ConvertFrom-Json
$mediaOverrideJson = & $node (Join-Path $site "scripts\print-media-overrides.mjs")
if ($LASTEXITCODE -ne 0) { throw "Unable to read exact media configuration." }
$mediaOverrides = $mediaOverrideJson | ConvertFrom-Json
foreach ($pageProperty in $siteContent.pages.PSObject.Properties) {
  $page = $pageProperty.Name
  $pageOverrides = $mediaOverrides.$page
  foreach ($media in $pageProperty.Value.media) {
    if ([string]::IsNullOrWhiteSpace($media.replacementFile)) { continue }
    $override = $null
    if ($pageOverrides) {
      $overrideProperty = $pageOverrides.PSObject.Properties[$media.id]
      if ($overrideProperty) { $override = $overrideProperty.Value }
    }
    $bounds = if ($override) { $override } else { $media.bounds }
    $replacementRelative = $media.replacementFile.TrimStart("/").Replace("/", "\")
    $replacementPath = Join-Path (Join-Path $site "public") $replacementRelative
    if (!(Test-Path -LiteralPath $replacementPath)) { throw "Replacement asset not found: $replacementPath" }
    Add-ReplacementImage (Join-Path $candidate "$page.png") $replacementPath ([int][Math]::Round($bounds.x)) ([int][Math]::Round($bounds.y)) ([int][Math]::Round($bounds.width)) ([int][Math]::Round($bounds.height))
  }
}

$overlayJson = & $node (Join-Path $site "scripts\print-exact-overlays.mjs")
if ($LASTEXITCODE -ne 0) { throw "Unable to read exact overlay configuration." }
$overlays = $overlayJson | ConvertFrom-Json
$generated = @()
foreach ($pageProperty in $overlays.PSObject.Properties) {
  $page = $pageProperty.Name
  $source = Join-Path $candidate "$page.png"
  foreach ($overlay in $pageProperty.Value) {
    $fileName = [System.IO.Path]::GetFileName($overlay.src)
    $target = Join-Path $candidateCrops $fileName
    if ($null -ne $overlay.regenerate -and !$overlay.regenerate) {
      Copy-Item -LiteralPath (Join-Path $publicAssets $fileName) -Destination $target -Force
    }
    else {
      Copy-ImageRect $source $target $overlay.x $overlay.y $overlay.width $overlay.height
    }
    $generated += $target
  }
}

$candidateHeader = Join-Path $candidateCrops "header-canonical-exact.png"
Copy-ImageRect (Join-Path $candidate "home.png") $candidateHeader 0 0 1920 189
$generated += $candidateHeader

if ($PromoteExactCrops) {
  foreach ($crop in $generated) {
    Copy-Item -LiteralPath $crop -Destination (Join-Path $publicAssets ([System.IO.Path]::GetFileName($crop))) -Force
  }
}

$changedCrops = @()
foreach ($crop in $generated) {
  $current = Join-Path $publicAssets ([System.IO.Path]::GetFileName($crop))
  if (!(Test-Path -LiteralPath $current)) {
    $changedCrops += [System.IO.Path]::GetFileName($crop)
    continue
  }
  $comparison = [Meezane.Delivery.StrictImageComparer]::Compare($current, $crop, 0)
  if ($comparison.ExactDifferentPixels -gt 0 -or $comparison.ExpectedWidth -ne $comparison.ActualWidth -or $comparison.ExpectedHeight -ne $comparison.ActualHeight) {
    $changedCrops += [System.IO.Path]::GetFileName($crop)
  }
}

[ordered]@{
  pages = 6
  exactCrops = $generated.Count
  changedCrops = $changedCrops.Count
  changedCropFiles = $changedCrops
  promoted = [bool]$PromoteExactCrops
  candidate = $candidate
} | ConvertTo-Json
