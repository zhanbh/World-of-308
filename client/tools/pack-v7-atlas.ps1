Add-Type -AssemblyName System.Drawing

$outDir = "d:\IdeaProjects\World-of-308\docs\art\characters\hunter\animation-v7"
$cellsDir = "$outDir\clean_cells"
$atlasPath = "$outDir\run-atlas.png"

$atlasW = 1664
$atlasH = 832
$cellSize = 416

$atlasBmp = New-Object System.Drawing.Bitmap($atlasW, $atlasH, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($atlasBmp)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$g.Clear([System.Drawing.Color]::Transparent)

$scale = 0.36
$scaledW = [int][Math]::Round(627 * $scale) # 226
$scaledH = [int][Math]::Round(627 * $scale) # 226

# Character anchor: anchorX = 208, anchorY = 352
# Baseline foot is around Y=610 in 627x627 source cell:
# 610 * 0.36 = 219.6 -> 220
# Top offset dy = 352 - 220 = 132
# Horizontal offset dx = 208 - (226 / 2) = 95
$dx = 95
$dy = 132

for ($i = 0; $i -le 7; $i++) {
    $cellPath = "$cellsDir\clean_cell_$i.png"
    $bytes = [System.IO.File]::ReadAllBytes($cellPath)
    $ms = New-Object System.IO.MemoryStream(,$bytes)
    $cellImg = [System.Drawing.Image]::FromStream($ms)

    $col = $i % 4
    $row = [int][Math]::Floor($i / 4)

    $destX = $col * $cellSize + $dx
    $destY = $row * $cellSize + $dy

    $destRect = New-Object System.Drawing.Rectangle($destX, $destY, $scaledW, $scaledH)
    $srcRect = New-Object System.Drawing.Rectangle(0, 0, 627, 627)

    $g.DrawImage($cellImg, $destRect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)

    $cellImg.Dispose()
    $ms.Dispose()

    Write-Host ("Drawn cell {0} at col={1}, row={2}, pos=({3}, {4})" -f $i, $col, $row, $destX, $destY)
}

$g.Dispose()
$atlasBmp.Save($atlasPath, [System.Drawing.Imaging.ImageFormat]::Png)
$atlasBmp.Dispose()

Write-Host "Successfully generated $atlasPath (1664x832)"
