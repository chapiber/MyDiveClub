Add-Type -AssemblyName System.Drawing

function Save-CdmIcon {
  param([int]$Size, [string]$Path)
  $bmp = New-Object System.Drawing.Bitmap $Size, $Size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $rect = New-Object System.Drawing.Rectangle 0, 0, $Size, $Size
  $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    $rect,
    [System.Drawing.Color]::FromArgb(255, 0, 40, 104),
    [System.Drawing.Color]::FromArgb(255, 200, 16, 46),
    45
  )
  $g.FillRectangle($brush, $rect)
  $gold = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 201, 162, 39))
  $ellipseW = [int]($Size * 0.24)
  $ellipseH = [int]($Size * 0.28)
  $ellipseX = [int]($Size * 0.38)
  $ellipseY = [int]($Size * 0.12)
  $g.FillEllipse($gold, $ellipseX, $ellipseY, $ellipseW, $ellipseH)
  $fontSize = [int]($Size * 0.38)
  $font = New-Object System.Drawing.Font 'Segoe UI', $fontSize, ([System.Drawing.FontStyle]::Bold)
  $sf = New-Object System.Drawing.StringFormat
  $sf.Alignment = 'Center'
  $sf.LineAlignment = 'Center'
  $white = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
  $g.DrawString('26', $font, $white, ($Size / 2), ($Size * 0.58), $sf)
  $bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose()
  $bmp.Dispose()
}

$dir = Join-Path $PSScriptRoot '..\apps\cdm2026\assets\img'
Save-CdmIcon -Size 192 -Path (Join-Path $dir 'icon-192.png')
Save-CdmIcon -Size 512 -Path (Join-Path $dir 'icon-512.png')
Write-Host "Icons written to $dir"
