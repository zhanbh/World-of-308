Add-Type -AssemblyName System.Drawing

$s3 = [System.Drawing.Bitmap]::FromFile("d:\IdeaProjects\World-of-308\client\tools\warrior_gait_inspect\src_cell_3.png")
$s4 = [System.Drawing.Bitmap]::FromFile("d:\IdeaProjects\World-of-308\client\tools\warrior_gait_inspect\src_cell_4.png")

$cw = 120
$ch = 120
$crop3 = New-Object System.Drawing.Bitmap $cw, $ch
$crop4 = New-Object System.Drawing.Bitmap $cw, $ch

$g3 = [System.Drawing.Graphics]::FromImage($crop3)
$srcRect = New-Object System.Drawing.Rectangle 200, 200, $cw, $ch
$dstRect = New-Object System.Drawing.Rectangle 0, 0, $cw, $ch
$g3.DrawImage($s3, $dstRect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)
$g3.Dispose()

$g4 = [System.Drawing.Graphics]::FromImage($crop4)
$g4.DrawImage($s4, $dstRect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)
$g4.Dispose()

$zoomW = $cw * 2
$zoomH = $ch * 2
$combo = New-Object System.Drawing.Bitmap ($zoomW * 2), $zoomH
$g = [System.Drawing.Graphics]::FromImage($combo)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half

$dst1 = New-Object System.Drawing.Rectangle 0, 0, $zoomW, $zoomH
$src1 = New-Object System.Drawing.Rectangle 0, 0, $cw, $ch
$g.DrawImage($crop3, $dst1, $src1, [System.Drawing.GraphicsUnit]::Pixel)

$dst2 = New-Object System.Drawing.Rectangle $zoomW, 0, $zoomW, $zoomH
$g.DrawImage($crop4, $dst2, $src1, [System.Drawing.GraphicsUnit]::Pixel)
$g.Dispose()

$zoomPath = "d:\IdeaProjects\World-of-308\client\tools\warrior_gait_inspect\zoom_sash_knee.png"
$combo.Save($zoomPath, [System.Drawing.Imaging.ImageFormat]::Png)
$combo.Dispose()
$crop3.Dispose()
$crop4.Dispose()
$s3.Dispose()
$s4.Dispose()
Write-Host "Saved zoom sash comparison to $zoomPath"
