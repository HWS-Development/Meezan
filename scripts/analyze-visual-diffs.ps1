$ErrorActionPreference = "Stop"

$site = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$audit = Join-Path $site "visual-audit"
$reference = Join-Path $audit "reference"
$rendered = Join-Path $audit "rendered"
$diffFolder = Join-Path $audit "diff"
$reportPath = Join-Path $audit "diff-analysis.json"
$step = 4
$binSize = 120

New-Item -ItemType Directory -Force -Path $diffFolder | Out-Null
Add-Type -AssemblyName System.Drawing

$pages = @("home", "experiences", "reservation", "blog", "chambres", "galerie")
$results = @()

foreach ($page in $pages) {
  $expected = [System.Drawing.Bitmap]::new((Join-Path $reference "$page.png"))
  $actual = [System.Drawing.Bitmap]::new((Join-Path $rendered "$page.png"))
  try {
    $width = [Math]::Min($expected.Width, $actual.Width)
    $height = [Math]::Min($expected.Height, $actual.Height)
    $rowBinCount = [Math]::Ceiling($height / $binSize)
    $columnBinCount = [Math]::Ceiling($width / $binSize)
    $rowSamples = [long[]]::new($rowBinCount)
    $rowDifferent = [long[]]::new($rowBinCount)
    $rowDelta = [double[]]::new($rowBinCount)
    $columnSamples = [long[]]::new($columnBinCount)
    $columnDifferent = [long[]]::new($columnBinCount)
    $columnDelta = [double[]]::new($columnBinCount)
    $maskWidth = [int][Math]::Ceiling($width / $step)
    $maskHeight = [int][Math]::Ceiling($height / $step)
    $mask = [System.Drawing.Bitmap]::new($maskWidth, $maskHeight)

    try {
      for ($y = 0; $y -lt $height; $y += $step) {
        $rowBin = [Math]::Floor($y / $binSize)
        for ($x = 0; $x -lt $width; $x += $step) {
          $columnBin = [Math]::Floor($x / $binSize)
          $a = $expected.GetPixel($x, $y)
          $b = $actual.GetPixel($x, $y)
          $delta = [Math]::Abs($a.R - $b.R) + [Math]::Abs($a.G - $b.G) + [Math]::Abs($a.B - $b.B)
          $rowSamples[$rowBin]++
          $rowDelta[$rowBin] += $delta
          $columnSamples[$columnBin]++
          $columnDelta[$columnBin] += $delta

          if ($delta -gt 36) {
            $rowDifferent[$rowBin]++
            $columnDifferent[$columnBin]++
            $intensity = [Math]::Min(255, 96 + $delta)
            $mask.SetPixel([Math]::Floor($x / $step), [Math]::Floor($y / $step), [System.Drawing.Color]::FromArgb($intensity, 0, 0))
          }
          elseif ($delta -gt 9) {
            $intensity = [Math]::Min(255, 40 + ($delta * 4))
            $mask.SetPixel([Math]::Floor($x / $step), [Math]::Floor($y / $step), [System.Drawing.Color]::FromArgb(0, 0, $intensity))
          }
        }
      }

      $mask.Save((Join-Path $diffFolder "$page.png"), [System.Drawing.Imaging.ImageFormat]::Png)
    }
    finally {
      $mask.Dispose()
    }

    $rows = @()
    for ($index = 0; $index -lt $rowBinCount; $index++) {
      $rows += [ordered]@{
        y = $index * $binSize
        height = [Math]::Min($binSize, $height - ($index * $binSize))
        averageRgbDelta = [Math]::Round($rowDelta[$index] / [Math]::Max(1, $rowSamples[$index]), 3)
        differentSamplePercent = [Math]::Round(($rowDifferent[$index] / [Math]::Max(1, $rowSamples[$index])) * 100, 3)
      }
    }

    $columns = @()
    for ($index = 0; $index -lt $columnBinCount; $index++) {
      $columns += [ordered]@{
        x = $index * $binSize
        width = [Math]::Min($binSize, $width - ($index * $binSize))
        averageRgbDelta = [Math]::Round($columnDelta[$index] / [Math]::Max(1, $columnSamples[$index]), 3)
        differentSamplePercent = [Math]::Round(($columnDifferent[$index] / [Math]::Max(1, $columnSamples[$index])) * 100, 3)
      }
    }

    $results += [ordered]@{
      page = $page
      mask = "visual-audit/diff/$page.png"
      rowBins = $rows
      columnBins = $columns
    }
  }
  finally {
    $expected.Dispose()
    $actual.Dispose()
  }
}

$report = [ordered]@{
  generatedAt = (Get-Date).ToString("s")
  sampleStep = $step
  binSize = $binSize
  results = $results
}
$report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $reportPath -Encoding UTF8
$reportPath
