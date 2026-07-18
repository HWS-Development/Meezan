$ErrorActionPreference = "Stop"
$site = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$source = Join-Path $site "visual-baseline\illustrator\home.png"
$outputDirectory = Join-Path $site "public\assets\social"
$output = Join-Path $outputDirectory "og-home.jpg"

if (!(Test-Path -LiteralPath $source)) { throw "Approved Home baseline not found: $source" }
New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
Add-Type -AssemblyName System.Drawing

$image = [System.Drawing.Bitmap]::new($source)
try {
  $crop = $image.Clone([System.Drawing.Rectangle]::new(360, 190, 1200, 630), [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  try {
    $encoder = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq "image/jpeg" }
    $parameters = [System.Drawing.Imaging.EncoderParameters]::new(1)
    try {
      $parameters.Param[0] = [System.Drawing.Imaging.EncoderParameter]::new([System.Drawing.Imaging.Encoder]::Quality, [long]90)
      $crop.Save($output, $encoder, $parameters)
    }
    finally { $parameters.Dispose() }
  }
  finally { $crop.Dispose() }
}
finally { $image.Dispose() }

[ordered]@{
  output = $output
  width = 1200
  height = 630
  bytes = (Get-Item -LiteralPath $output).Length
  sha256 = (Get-FileHash -LiteralPath $output -Algorithm SHA256).Hash.ToLowerInvariant()
} | ConvertTo-Json
