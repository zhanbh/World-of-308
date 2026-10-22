Add-Type -AssemblyName System.Drawing

$v3Path = "d:\IdeaProjects\World-of-308\docs\art\characters\hunter\animation-v3\run-far-rebuilt.png"
$v3Img = [System.Drawing.Image]::FromFile($v3Path)

$cw = 627
$ch = 627
$dstPath = "d:\IdeaProjects\World-of-308\docs\art\characters\hunter\animation-v7\clean_cells\clean_cell_7.png"

$bmp = New-Object System.Drawing.Bitmap $cw, $ch
$g = [System.Drawing.Graphics]::FromImage($bmp)
$srcRect = New-Object System.Drawing.Rectangle $cw, $ch, $cw, $ch
$dstRect = New-Object System.Drawing.Rectangle 0, 0, $cw, $ch
$g.DrawImage($v3Img, $dstRect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)

$bmp.Save($dstPath, [System.Drawing.Imaging.ImageFormat]::Png)

$g.Dispose()
$bmp.Dispose()
$v3Img.Dispose()

Write-Host "Generated clean_cell_7 from v3 slot 3 at $dstPath"
