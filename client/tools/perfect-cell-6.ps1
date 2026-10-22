Add-Type -AssemblyName System.Drawing

$dstPath = "d:\IdeaProjects\World-of-308\docs\art\characters\hunter\animation-v7\clean_cells\clean_cell_6.png"
$bytes = [System.IO.File]::ReadAllBytes($dstPath)
$ms = New-Object System.IO.MemoryStream(,$bytes)
$img = [System.Drawing.Image]::FromStream($ms)
$bmp = New-Object System.Drawing.Bitmap $img

# The remaining strap mark on the front thigh is at X 360 to 425, Y 300 to 360.
# On sheer black tights over skin:
# The highlight curve follows the thigh bone: center of thigh is warmer/lighter (R ~ 90-120, G ~ 65-90, B ~ 50-70),
# while edges are darker (R ~ 30-50, G ~ 25-45, B ~ 20-35).
for ($y = 300; $y -le 360; $y++) {
    for ($x = 360; $x -le 430; $x++) {
        $c = $bmp.GetPixel($x, $y)
        if ($c.A -lt 100) { continue }
        
        # If it's part of the front thigh (avoiding skirt at left and bow at right)
        # Left boundary of thigh at this Y is around X ~ 360-375
        # Right boundary of thigh is around X ~ 420-435
        # Check if pixel has leftover strap/buckle color:
        # Leather brown or gold/jade residue
        $isBuckleOrStrap = ($c.R -gt 130 -and $c.G -gt 100 -and $c.B -lt 70) -or `
                           ($c.G -gt 70 -and $c.G -gt ($c.R * 1.1)) -or `
                           ($c.R -gt 55 -and $c.R -lt 120 -and $c.G -gt 35 -and $c.G -lt 80 -and $c.B -lt 65) -or `
                           ($c.R -lt 40 -and $c.G -lt 35 -and $c.B -lt 35 -and $x -gt 375 -and $x -lt 415 -and $y -gt 310 -and $y -lt 345)
                           
        if ($isBuckleOrStrap) {
            # Target natural tights color:
            # Vertical gradient: Y=300 is near shorts (R 45, G 38, B 35); Y=360 is near knee highlight (R 110, G 85, B 70)
            $ty = ($y - 300) / 60.0
            $baseR = 45 + $ty * 65
            $baseG = 38 + $ty * 47
            $baseB = 35 + $ty * 35
            
            # Horizontal curve: center of thigh has slight sheen (X ~ 395)
            $distFromCenter = [Math]::Abs($x - 395) / 30.0
            $distFactor = [Math]::Max(0.0, 1.0 - $distFromCenter * $distFromCenter)
            $sheen = 20 * $distFactor
            
            $finalR = [Math]::Min(255, [int]($baseR + $sheen))
            $finalG = [Math]::Min(255, [int]($baseG + $sheen * 0.8))
            $finalB = [Math]::Min(255, [int]($baseB + $sheen * 0.7))
            
            $bmp.SetPixel($x, $y, [System.Drawing.Color]::FromArgb($c.A, $finalR, $finalG, $finalB))
        }
    }
}

# Smooth 3x3 filter on patched area
$smoothed = New-Object System.Drawing.Bitmap $bmp
for ($y = 302; $y -le 358; $y++) {
    for ($x = 362; $x -le 428; $x++) {
        $rSum = 0; $gSum = 0; $bSum = 0; $count = 0
        for ($dy = -1; $dy -le 1; $dy++) {
            for ($dx = -1; $dx -le 1; $dx++) {
                $nc = $bmp.GetPixel($x + $dx, $y + $dy)
                if ($nc.A -gt 100) {
                    $rSum += $nc.R; $gSum += $nc.G; $bSum += $nc.B; $count++
                }
            }
        }
        if ($count -ge 5) {
            $origA = $bmp.GetPixel($x, $y).A
            $smoothed.SetPixel($x, $y, [System.Drawing.Color]::FromArgb($origA, [int]($rSum/$count), [int]($gSum/$count), [int]($bSum/$count)))
        }
    }
}

$smoothed.Save($dstPath, [System.Drawing.Imaging.ImageFormat]::Png)
$smoothed.Dispose()
$bmp.Dispose()
$img.Dispose()
$ms.Dispose()

Write-Host "Perfected clean_cell_6 at $dstPath"
