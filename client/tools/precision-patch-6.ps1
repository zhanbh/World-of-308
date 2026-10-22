Add-Type -AssemblyName System.Drawing

$src = "d:\IdeaProjects\World-of-308\docs\art\characters\hunter\animation-v4\extracted_cells\far_cell_2.png"
$dst = "d:\IdeaProjects\World-of-308\docs\art\characters\hunter\animation-v7\clean_cells\clean_cell_6.png"

$bytes = [System.IO.File]::ReadAllBytes($src)
$ms = New-Object System.IO.MemoryStream(,$bytes)
$img = [System.Drawing.Image]::FromStream($ms)
$bmp = New-Object System.Drawing.Bitmap $img

# The strap, gold buckle, and jade ornament are strictly bounded by:
# X: 372 to 418
# Y: 323 to 355

# Top anchor row: Y=321
# Bottom anchor row: Y=357
$yTop = 321
$yBot = 357

for ($x = 372; $x -le 418; $x++) {
    $cTop = $bmp.GetPixel($x, $yTop)
    $cBot = $bmp.GetPixel($x, $yBot)
    
    for ($y = 322; $y -le 356; $y++) {
        $t = ($y - $yTop) / [double]($yBot - $yTop)
        
        # Smooth hermite interpolation to avoid sharp linear creases
        $smoothT = $t * $t * (3.0 - 2.0 * $t)
        
        $r = [int]($cTop.R * (1.0 - $smoothT) + $cBot.R * $smoothT)
        $g = [int]($cTop.G * (1.0 - $smoothT) + $cBot.G * $smoothT)
        $b = [int]($cTop.B * (1.0 - $smoothT) + $cBot.B * $smoothT)
        
        $origA = $bmp.GetPixel($x, $y).A
        $bmp.SetPixel($x, $y, [System.Drawing.Color]::FromArgb($origA, $r, $g, $b))
    }
}

# Apply a 3x3 gaussian-weighted blur on the patched region and its 2px margin
$smoothed = New-Object System.Drawing.Bitmap $bmp
for ($y = 320; $y -le 358; $y++) {
    for ($x = 370; $x -le 420; $x++) {
        $rSum = 0.0; $gSum = 0.0; $bSum = 0.0; $wSum = 0.0
        for ($dy = -1; $dy -le 1; $dy++) {
            for ($dx = -1; $dx -le 1; $dx++) {
                $w = if ($dx -eq 0 -and $dy -eq 0) { 4.0 } elseif ($dx -eq 0 -or $dy -eq 0) { 2.0 } else { 1.0 }
                $nc = $bmp.GetPixel($x + $dx, $y + $dy)
                $rSum += $nc.R * $w
                $gSum += $nc.G * $w
                $bSum += $nc.B * $w
                $wSum += $w
            }
        }
        $origA = $bmp.GetPixel($x, $y).A
        $smoothed.SetPixel($x, $y, [System.Drawing.Color]::FromArgb($origA, [int]($rSum / $wSum), [int]($gSum / $wSum), [int]($bSum / $wSum)))
    }
}

$smoothed.Save($dst, [System.Drawing.Imaging.ImageFormat]::Png)

$smoothed.Dispose()
$bmp.Dispose()
$img.Dispose()
$ms.Dispose()

Write-Host "Precision patched clean_cell_6 successfully."
