Add-Type -AssemblyName System.Drawing

$outDir = "d:\IdeaProjects\World-of-308\docs\art\characters\hunter\animation-v4\thigh_crops"
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir }

$cells = @("near_cell_0", "near_cell_1", "near_cell_2", "near_cell_3", "far_cell_0", "far_cell_1", "far_cell_2", "far_cell_3")

foreach ($name in $cells) {
    $srcPath = "d:\IdeaProjects\World-of-308\docs\art\characters\hunter\animation-v4\extracted_cells\$name.png"
    $img = [System.Drawing.Image]::FromFile($srcPath)
    
    # Crop thigh region: X 200 to 420 (width 220), Y 280 to 450 (height 170)
    $bmp = New-Object System.Drawing.Bitmap 220, 170
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $srcRect = New-Object System.Drawing.Rectangle 200, 280, 220, 170
    $dstRect = New-Object System.Drawing.Rectangle 0, 0, 220, 170
    $g.DrawImage($img, $dstRect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)
    $bmp.Save("$outDir\thigh_$name.png", [System.Drawing.Imaging.ImageFormat]::Png)
    
    $g.Dispose()
    $bmp.Dispose()
    $img.Dispose()
}

Write-Host "Saved thigh crops to $outDir"
