Add-Type -AssemblyName System.Drawing

$outDir = "d:\IdeaProjects\World-of-308\client\tools\warrior_gait_inspect"
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }

$srcPath = "d:\IdeaProjects\World-of-308\docs\art\motion-studies\warrior\body\gait-v2\generated-source.png"
$img = [System.Drawing.Image]::FromFile($srcPath)
$cw = [int]($img.Width / 4)
$ch = [int]($img.Height / 2)

for ($row = 0; $row -lt 2; $row++) {
    for ($col = 0; $col -lt 4; $col++) {
        $index = $row * 4 + $col
        $bmp = New-Object System.Drawing.Bitmap $cw, $ch
        $g = [System.Drawing.Graphics]::FromImage($bmp)
        $srcRect = New-Object System.Drawing.Rectangle ($col * $cw), ($row * $ch), $cw, $ch
        $dstRect = New-Object System.Drawing.Rectangle 0, 0, $cw, $ch
        $g.DrawImage($img, $dstRect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)
        $bmp.Save("$outDir\src_cell_${index}.png", [System.Drawing.Imaging.ImageFormat]::Png)
        $g.Dispose()
        $bmp.Dispose()
    }
}
$img.Dispose()

$atlasPath = "d:\IdeaProjects\World-of-308\client\assets\resources\warrior-gait-v2.png"
$atlas = [System.Drawing.Image]::FromFile($atlasPath)
$cellSide = 416
for ($row = 0; $row -lt 2; $row++) {
    for ($col = 0; $col -lt 4; $col++) {
        $index = $row * 4 + $col
        $bmp = New-Object System.Drawing.Bitmap $cellSide, $cellSide
        $g = [System.Drawing.Graphics]::FromImage($bmp)
        $srcRect = New-Object System.Drawing.Rectangle ($col * $cellSide), ($row * $cellSide), $cellSide, $cellSide
        $dstRect = New-Object System.Drawing.Rectangle 0, 0, $cellSide, $cellSide
        $g.DrawImage($atlas, $dstRect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)
        $bmp.Save("$outDir\atlas_cell_${index}.png", [System.Drawing.Imaging.ImageFormat]::Png)
        $g.Dispose()
        $bmp.Dispose()
    }
}
$atlas.Dispose()

Write-Host "Successfully extracted all source and atlas cells to $outDir"
