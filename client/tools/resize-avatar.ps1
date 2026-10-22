Add-Type -AssemblyName System.Drawing
$srcPath = "d:\IdeaProjects\World-of-308\docs\art\warrior-avatar-v1.jpg"
$dstPath = "d:\IdeaProjects\World-of-308\docs\art\warrior-avatar-128.png"

$src = [System.Drawing.Image]::FromFile($srcPath)
$bmp = New-Object System.Drawing.Bitmap 128, 128
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.DrawImage($src, 0, 0, 128, 128)
$bmp.Save($dstPath, [System.Drawing.Imaging.ImageFormat]::Png)

$g.Dispose()
$bmp.Dispose()
$src.Dispose()
Write-Host "Generated 128x128 avatar at $dstPath"
