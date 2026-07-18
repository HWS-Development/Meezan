$ErrorActionPreference = "Stop"

$site = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$root = Split-Path -Parent $site
$outlineScript = Join-Path $root "illustrator-export-site-outlines.jsx"
$textScript = Join-Path $root "illustrator-export-text-outlines.jsx"
$textRasterScript = Join-Path $root "illustrator-export-live-text-rasters.jsx"
$backgroundScript = Join-Path $root "illustrator-export-composite-backgrounds.jsx"
$specScript = Join-Path $root "illustrator-object-spec.jsx"
$pages = @("home", "experiences", "reservation", "blog", "chambres", "galerie")

$illustrator = New-Object -ComObject Illustrator.Application
try {
  $illustrator.DoJavaScriptFile($textScript) | Out-Null
  $illustrator.DoJavaScriptFile($textRasterScript) | Out-Null
  $illustrator.DoJavaScriptFile($backgroundScript) | Out-Null
  foreach ($page in $pages) {
    $illustrator.DoJavaScript('$.setenv("MEEZAN_PAGE", "' + $page + '");') | Out-Null
    $illustrator.DoJavaScriptFile($specScript) | Out-Null
  }
  # The full outline export is memory-intensive, so leave it until no further COM work remains.
  $illustrator.DoJavaScriptFile($outlineScript) | Out-Null
}
finally {
  if ($illustrator) {
    try { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($illustrator) } catch {}
  }
}

Push-Location $site
try {
  & "C:\Program Files\nodejs\node.exe" "scripts/build-illustrator-assets.mjs"
  if ($LASTEXITCODE -ne 0) { throw "Illustrator asset build failed." }
}
finally {
  Pop-Location
}
