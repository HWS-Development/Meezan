param([switch]$Candidate)

$ErrorActionPreference = "Stop"

$site = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$baselineRoot = Join-Path $site "visual-baseline"
$illustratorBaseline = if ($Candidate) { Join-Path $site "visual-audit\candidate-illustrator" } else { Join-Path $baselineRoot "illustrator" }
$browserBaseline = Join-Path $baselineRoot "browser"
$baselineManifestPath = Join-Path $baselineRoot "manifest.json"
$rendered = if ($Candidate) { Join-Path $site "visual-audit\candidate-browser" } else { Join-Path $site "visual-audit\rendered" }
$reportPath = if ($Candidate) { Join-Path $site "visual-audit\candidate-report.json" } else { Join-Path $site "visual-audit\report.json" }
$contentPath = Join-Path $site "src\data\siteContent.json"
$chrome = "C:\Program Files\Google\Chrome\Application\chrome.exe"
$npm = "C:\Program Files\nodejs\npm.cmd"

$requiredPaths = @($chrome, $npm, $contentPath, $illustratorBaseline)
if (!$Candidate) { $requiredPaths += $baselineManifestPath }
foreach ($required in $requiredPaths) {
  if (!(Test-Path -LiteralPath $required)) { throw "Strict audit dependency not found: $required" }
}

New-Item -ItemType Directory -Force -Path $rendered | Out-Null
$tempRoot = [System.IO.Path]::GetTempPath()
if (!(Test-Path -LiteralPath $tempRoot)) { throw "Temporary directory not found: $tempRoot" }
$chromeProfile = Join-Path $tempRoot ("meezane-visual-audit-" + [Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $chromeProfile | Out-Null

Add-Type -AssemblyName System.Drawing
Add-Type -Path (Join-Path $site "scripts\StrictImageComparer.cs") -ReferencedAssemblies "System.Drawing.dll"

function Get-FreeTcpPort {
  $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
  try {
    $listener.Start()
    return ([System.Net.IPEndPoint]$listener.LocalEndpoint).Port
  }
  finally {
    $listener.Stop()
  }
}

function To-Metrics($comparison) {
  $significantPercent = if ($comparison.PixelCount) {
    [Math]::Round(($comparison.SignificantDifferentPixels / $comparison.PixelCount) * 100, 6)
  } else { 100 }

  return [ordered]@{
    expectedWidth = $comparison.ExpectedWidth
    expectedHeight = $comparison.ExpectedHeight
    actualWidth = $comparison.ActualWidth
    actualHeight = $comparison.ActualHeight
    comparedPixels = $comparison.PixelCount
    exactDifferentPixels = $comparison.ExactDifferentPixels
    significantDifferentPixels = $comparison.SignificantDifferentPixels
    significantDifferentPercent = $significantPercent
    averageRgbaDelta = [Math]::Round($comparison.AverageRgbaDelta, 6)
    maxRgbaDelta = $comparison.MaxRgbaDelta
    differenceBounds = [ordered]@{
      left = $comparison.DifferenceLeft
      top = $comparison.DifferenceTop
      right = $comparison.DifferenceRight
      bottom = $comparison.DifferenceBottom
    }
  }
}

$contentText = [System.IO.File]::ReadAllText($contentPath)
$normalizedContent = $contentText.Replace("`r`n", "`n").Replace("`r", "`n")
$contentBytes = [System.Text.UTF8Encoding]::new($false).GetBytes($normalizedContent)
$contentHasher = [System.Security.Cryptography.SHA256]::Create()
try {
  $contentHash = ([System.BitConverter]::ToString($contentHasher.ComputeHash($contentBytes))).Replace("-", "").ToLowerInvariant()
}
finally {
  $contentHasher.Dispose()
}
$siteContent = Get-Content -LiteralPath $contentPath -Raw | ConvertFrom-Json
if ($Candidate) {
  $candidatePages = [ordered]@{}
  foreach ($pageProperty in $siteContent.pages.PSObject.Properties) {
    $candidatePages[$pageProperty.Name] = [pscustomobject]@{
      width = $pageProperty.Value.artboard.width
      height = $pageProperty.Value.artboard.height
    }
  }
  $manifest = [pscustomobject]@{ pages = [pscustomobject]$candidatePages; siteContentSha256 = $contentHash }
}
else {
  $manifest = Get-Content -LiteralPath $baselineManifestPath -Raw | ConvertFrom-Json
  if ($contentHash -ne $manifest.siteContentSha256) {
    throw "siteContent.json changed after visual approval. Export, review, then explicitly approve a new baseline."
  }
}

$routes = [ordered]@{
  home = "/"
  experiences = "/experiences"
  reservation = "/reservation"
  blog = "/blog"
  chambres = "/chambres"
  galerie = "/galerie"
}

foreach ($page in $routes.Keys) {
  $approved = $manifest.pages.$page
  if (!$approved) { throw "Baseline manifest is missing page: $page" }
  $illustratorPath = Join-Path $illustratorBaseline "$page.png"
  $browserPath = Join-Path $browserBaseline "$page.png"
  foreach ($path in @($illustratorPath, $browserPath)) {
    if (!(Test-Path -LiteralPath $path)) { throw "Approved baseline image missing: $path" }
  }
  if (!$Candidate) {
    $illustratorHash = (Get-FileHash -LiteralPath $illustratorPath -Algorithm SHA256).Hash.ToLowerInvariant()
    $browserHash = (Get-FileHash -LiteralPath $browserPath -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($illustratorHash -ne $approved.illustratorSha256) { throw "$page Illustrator baseline hash mismatch." }
    if ($browserHash -ne $approved.browserSha256) { throw "$page browser baseline hash mismatch." }
  }
}

Push-Location $site
try {
  $buildScript = if ($Candidate) { "build" } else { "build:strict" }
  & $npm run $buildScript | Out-Host
  if ($LASTEXITCODE -ne 0) { throw "Production build failed." }

  $previewPort = Get-FreeTcpPort
  $vite = Join-Path $site "node_modules\vite\bin\vite.js"
  $server = Start-Process -FilePath "C:\Program Files\nodejs\node.exe" -ArgumentList @($vite, "preview", "--host", "127.0.0.1", "--port", "$previewPort", "--strictPort") -WorkingDirectory $site -PassThru -WindowStyle Hidden
  try {
    $ready = $false
    for ($attempt = 0; $attempt -lt 40; $attempt++) {
      try {
        $response = Invoke-WebRequest -Uri "http://127.0.0.1:$previewPort/" -UseBasicParsing -TimeoutSec 2
        if ($response.StatusCode -eq 200 -and $response.Content -match "Meezane") {
          $ready = $true
          break
        }
      }
      catch {}
      Start-Sleep -Milliseconds 500
    }
    if (!$ready) { throw "Preview server did not start." }

    $results = @()
    $failedPages = @()
    foreach ($page in $routes.Keys) {
      $approved = $manifest.pages.$page
      $output = Join-Path $rendered "$page.png"
      if (Test-Path -LiteralPath $output) { Remove-Item -LiteralPath $output -Force }

      $url = "http://127.0.0.1:$previewPort" + $routes[$page]
      & $chrome "--headless=new" "--disable-gpu" "--disable-background-networking" "--disable-extensions" "--disable-sync" "--no-first-run" "--hide-scrollbars" "--run-all-compositor-stages-before-draw" "--virtual-time-budget=8000" "--force-device-scale-factor=1" "--user-data-dir=$chromeProfile" "--window-size=$($approved.width),$($approved.height)" "--screenshot=$output" $url | Out-Null
      if ($LASTEXITCODE -ne 0) { throw "Chrome screenshot failed for $page with exit code $LASTEXITCODE." }
      if (!(Test-Path -LiteralPath $output)) { throw "Chrome did not create a fresh screenshot for $page." }

      $illustratorComparison = [Meezane.Delivery.StrictImageComparer]::Compare(
        (Join-Path $illustratorBaseline "$page.png"),
        $output,
        36
      )
      $illustratorMetrics = To-Metrics $illustratorComparison
      $browserComparison = if ($Candidate) { $null } else {
        [Meezane.Delivery.StrictImageComparer]::Compare((Join-Path $browserBaseline "$page.png"), $output, 0)
      }
      $browserMetrics = if ($Candidate) { $null } else { To-Metrics $browserComparison }

      $dimensionsMatch =
        $illustratorComparison.ExpectedWidth -eq $illustratorComparison.ActualWidth -and
        $illustratorComparison.ExpectedHeight -eq $illustratorComparison.ActualHeight
      $fidelityPassed =
        $dimensionsMatch -and
        $illustratorMetrics.averageRgbaDelta -le 0.5 -and
        $illustratorMetrics.significantDifferentPercent -le 0.1
      $regressionPassed = $Candidate -or (
        $browserComparison.ExpectedWidth -eq $browserComparison.ActualWidth -and
        $browserComparison.ExpectedHeight -eq $browserComparison.ActualHeight -and
        $browserComparison.ExactDifferentPixels -eq 0
      )
      $passed = $fidelityPassed -and $regressionPassed
      if (!$passed) { $failedPages += $page }

      $results += [ordered]@{
        page = $page
        path = $routes[$page]
        passed = $passed
        illustratorFidelityPassed = $fidelityPassed
        browserRegressionPassed = $regressionPassed
        illustrator = $illustratorMetrics
        browser = $browserMetrics
      }
    }

    $report = [ordered]@{
      generatedAt = (Get-Date).ToUniversalTime().ToString("o")
      comparison = "Every RGBA pixel; no sampling"
      illustratorPolicy = "average RGBA delta <= 0.5 and significant pixel delta > 36 on <= 0.1% of pixels"
      browserPolicy = if ($Candidate) { "candidate mode; approve explicitly before strict delivery" } else { "zero pixel differences from the explicitly approved browser baseline" }
      baselineManifestSha256 = if ($Candidate) { $null } else { (Get-FileHash -LiteralPath $baselineManifestPath -Algorithm SHA256).Hash.ToLowerInvariant() }
      passed = $failedPages.Count -eq 0
      results = $results
    }
    $json = $report | ConvertTo-Json -Depth 8
    [System.IO.File]::WriteAllText($reportPath, $json + [Environment]::NewLine, [System.Text.UTF8Encoding]::new($false))
    $json

    if ($failedPages.Count -gt 0) {
      throw "Strict visual audit failed for: $($failedPages -join ', ')"
    }
  }
  finally {
    if ($server -and !$server.HasExited) { Stop-Process -Id $server.Id -Force }
  }
}
finally {
  Pop-Location
  if (Test-Path -LiteralPath $chromeProfile) {
    Remove-Item -LiteralPath $chromeProfile -Recurse -Force -ErrorAction SilentlyContinue
  }
}
