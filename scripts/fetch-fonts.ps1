$ErrorActionPreference = "Stop"
$ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
$cssUrl = "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
$outDir = "public\fonts"
New-Item -ItemType Directory -Path $outDir -Force | Out-Null

$css = (Invoke-WebRequest -Uri $cssUrl -Headers @{ "User-Agent" = $ua } -UseBasicParsing -TimeoutSec 30).Content
Write-Output "CSS length: $($css.Length)"

$blocks = [regex]::Matches($css, "(?s)/\*\s*(\S+)\s*\*/\s*@font-face\s*\{(.*?)\}")
$fontCss = @()
$seen = @{}
foreach ($block in $blocks) {
  $subset = $block.Groups[1].Value
  $body = $block.Groups[2].Value
  if ($subset -ne "latin") { continue }
  $family = [regex]::Match($body, "font-family:\s*'([^']+)'").Groups[1].Value
  $weight = [regex]::Match($body, "font-weight:\s*(\d+)").Groups[1].Value
  $url = [regex]::Match($body, "url\((https://[^)]+\.woff2)\)").Groups[1].Value
  if (-not $url) { continue }
  $fileName = "$family-$weight.woff2" -replace " ", ""
  if ($seen[$fileName]) { continue }
  $seen[$fileName] = $true
  $dest = Join-Path $outDir $fileName
  Invoke-WebRequest -Uri $url -OutFile $dest -UseBasicParsing -TimeoutSec 60
  $size = (Get-Item $dest).Length
  Write-Output "Downloaded $fileName ($size bytes)"
  $fontCss += "@font-face {`n  font-family: '$family';`n  font-style: normal;`n  font-weight: $weight;`n  font-display: swap;`n  src: url('/fonts/$fileName') format('woff2');`n}"
}

$fontCss -join "`n" | Set-Content -Path "public\fonts\fonts.css" -Encoding utf8
Write-Output "Wrote public/fonts/fonts.css"
