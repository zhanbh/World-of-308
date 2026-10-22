Add-Type -AssemblyName System.Drawing

$srcPath = "d:\IdeaProjects\World-of-308\docs\art\characters\hunter\animation-v4\extracted_cells\far_cell_2.png"
$dstPath = "d:\IdeaProjects\World-of-308\docs\art\characters\hunter\animation-v7\clean_cells\clean_cell_6.png"

$img = [System.Drawing.Image]::FromFile($srcPath)
$bmp = New-Object System.Drawing.Bitmap $img

# Front thigh strap region: X 330 to 405, Y 292 to 348
# For each column X, find top sample (Y ~ 290) and bottom sample (Y ~ 348)
for ($x = 325; $x -le 405; $x++) {
    $topY = 290
    $botY = 348
    
    $cTop = $bmp.GetPixel($x, $topY)
    $cBot = $bmp.GetPixel($x, $botY)
    
    for ($y = 292; $y -le 346; $y++) {
        $c = $bmp.GetPixel($x, $y)
        if ($c.A -lt 50) { continue }
        
        # Check if it is strap / gold / jade / highlight
        $isGold = ($c.R -gt 130 -and $c.G -gt 100 -and $c.B -lt 80)
        $isJade = ($c.G -gt 85 -and $c.G -gt ($c.R * 1.15))
        $isLeather = ($c.R -gt 60 -and $c.R -lt 140 -and $c.G -gt 35 -and $c.G -lt 90 -and $c.B -lt 65)
        $isStrapShadow = ($c.R -lt 50 -and $c.G -lt 45 -and $c.B -lt 45 -and $y -gt 295 -and $y -lt 340)
        
        if ($isGold -or $isJade -or $isLeather -or ($y -ge 296 -and $y -le 338 -and $c.R -gt 55)) {
            $t = ($y - $topY) / ($botY - $topY)
            $r = [Math]::Min(255, [Math]::Max(0, [int]($cTop.R * (1 - $t) + $cBot.R * $t)))
            $g = [Math]::Min(255, [Math]::Max(0, [int]($cTop.G * (1 - $t) + $cBot.G * $t)))
            $b = [Math]::Min(255, [Math]::Max(0, [int]($cTop.B * (1 - $t) + $cBot.B * $t)))
            $newColor = [System.Drawing.Color]::FromArgb($c.A, $r, $g, $b)
            $bmp.SetPixel($x, $y, $newColor)
        }
    }
}

$bmp.Save($dstPath, [System.Drawing.Imaging.ImageFormat]::Png)

$bmp.Dispose()
$img.Dispose()

Write-Host "Repaired far_cell_2 -> clean_cell_6 at $dstPath"
