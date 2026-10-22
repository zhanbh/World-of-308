Add-Type -AssemblyName System.Drawing

$outDir = "d:\IdeaProjects\World-of-308\docs\art\characters\hunter\animation-v4\extracted_cells"
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir }

function Extract-Cells($imgPath, $prefix) {
    $img = [System.Drawing.Image]::FromFile($imgPath)
    $cw = 627
    $ch = 627
    for ($row = 0; $row -lt 2; $row++) {
        for ($col = 0; $col -lt 2; $col++) {
            $index = $row * 2 + $col
            $bmp = New-Object System.Drawing.Bitmap $cw, $ch
            $g = [System.Drawing.Graphics]::FromImage($bmp)
            $srcRect = New-Object System.Drawing.Rectangle ($col * $cw), ($row * $ch), $cw, $ch
            $dstRect = New-Object System.Drawing.Rectangle 0, 0, $cw, $ch
            $g.DrawImage($img, $dstRect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)
            $bmp.Save("$outDir\${prefix}_cell_${index}.png", [System.Drawing.Imaging.ImageFormat]::Png)
            $g.Dispose()
            $bmp.Dispose()
        }
    }
    $img.Dispose()
}

Extract-Cells "d:\IdeaProjects\World-of-308\docs\art\characters\hunter\animation-v4\run-near-source.png" "near"
Extract-Cells "d:\IdeaProjects\World-of-308\docs\art\characters\hunter\animation-v4\run-far-rebuilt.png" "far"

Write-Host "Extracted all cells to $outDir"
