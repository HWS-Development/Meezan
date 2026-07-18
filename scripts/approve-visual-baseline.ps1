param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("APPROVE")]
  [string]$Confirm,
  [string]$IllustratorSource,
  [string]$BrowserSource
)

$ErrorActionPreference = "Stop"
$site = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$baseline = Join-Path $site "visual-baseline"
$illustratorTarget = Join-Path $baseline "illustrator"
$browserTarget = Join-Path $baseline "browser"
$manifestPath = Join-Path $baseline "manifest.json"
$contentPath = Join-Path $site "src\data\siteContent.json"
$pages = @("home", "experiences", "reservation", "blog", "chambres", "galerie")

if (!$IllustratorSource) { $IllustratorSource = Join-Path $site "visual-audit\candidate-illustrator" }
if (!$BrowserSource) { $BrowserSource = Join-Path $site "visual-audit\candidate-browser" }

foreach ($path in @($IllustratorSource, $BrowserSource)) {
  if (!(Test-Path -LiteralPath $path)) { throw "Baseline source not found: $path" }
}

New-Item -ItemType Directory -Force -Path $illustratorTarget | Out-Null
New-Item -ItemType Directory -Force -Path $browserTarget | Out-Null
Add-Type -AssemblyName System.Drawing

$pageManifest = [ordered]@{}
foreach ($page in $pages) {
  $illustratorInput = Join-Path $IllustratorSource "$page.png"
  $browserInput = Join-Path $BrowserSource "$page.png"
  if (!(Test-Path -LiteralPath $illustratorInput)) { throw "Missing Illustrator baseline candidate: $illustratorInput" }
  if (!(Test-Path -LiteralPath $browserInput)) { throw "Missing browser baseline candidate: $browserInput" }

  $illustratorImage = [System.Drawing.Bitmap]::new($illustratorInput)
  $browserImage = [System.Drawing.Bitmap]::new($browserInput)
  try {
    if ($illustratorImage.Width -ne $browserImage.Width -or $illustratorImage.Height -ne $browserImage.Height) {
      throw "$page baseline dimensions do not match."
    }
    $width = $illustratorImage.Width
    $height = $illustratorImage.Height
  }
  finally {
    $illustratorImage.Dispose()
    $browserImage.Dispose()
  }

  $illustratorOutput = Join-Path $illustratorTarget "$page.png"
  $browserOutput = Join-Path $browserTarget "$page.png"
  Copy-Item -LiteralPath $illustratorInput -Destination $illustratorOutput -Force
  Copy-Item -LiteralPath $browserInput -Destination $browserOutput -Force

  $pageManifest[$page] = [ordered]@{
    width = $width
    height = $height
    illustratorSha256 = (Get-FileHash -LiteralPath $illustratorOutput -Algorithm SHA256).Hash.ToLowerInvariant()
    browserSha256 = (Get-FileHash -LiteralPath $browserOutput -Algorithm SHA256).Hash.ToLowerInvariant()
  }
}

$manifest = [ordered]@{
  schemaVersion = 1
  approvedAt = (Get-Date).ToUniversalTime().ToString("o")
  approval = "Explicit developer approval of Illustrator and browser golden images"
  siteContentSha256 = (Get-FileHash -LiteralPath $contentPath -Algorithm SHA256).Hash.ToLowerInvariant()
  pages = $pageManifest
}

$json = $manifest | ConvertTo-Json -Depth 6
[System.IO.File]::WriteAllText($manifestPath, $json + [Environment]::NewLine, [System.Text.UTF8Encoding]::new($false))
$manifest | ConvertTo-Json -Depth 6
