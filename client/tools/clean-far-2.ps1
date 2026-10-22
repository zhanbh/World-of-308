Add-Type -AssemblyName System.Drawing

$srcPath = "d:\IdeaProjects\World-of-308\docs\art\characters\hunter\animation-v4\extracted_cells\far_cell_2.png"
$dstPath = "d:\IdeaProjects\World-of-308\docs\art\characters\hunter\animation-v7\clean_cells\clean_cell_6.png"

$img = [System.Drawing.Image]::FromFile($srcPath)
$bmp = New-Object System.Drawing.Bitmap $img

# The strap on the front thigh is between X 365 and 435, Y 310 and 365.
# Let's check pixel colors to detect strap/buckle/charm
for ($y = 310; $y -le 365; $y++) {
    for ($x = 365; $x -le 435; $x++) {
        $c = $bmp.GetPixel($x, $y)
        if ($c.A -lt 50) { continue }
        
        # Detect gold buckle, jade charm, or brown leather strap
        $isGold = ($c.R -gt 140 -and $c.G -gt 100 -and $c.B -lt 80)
        $isJade = ($c.G -gt 80 -and $c.G -gt ($c.R * 1.15) -and $c.R -lt 120)
        $isLeather = ($c.R -gt 60 -and $c.R -lt 140 -and $c.G -gt 35 -and $c.G -lt 85 -and $c.B -lt 65)
        
        if ($isGold -or $isJade -or $isLeather) {
            # Find clean stocking color above (Y - 16) and below (Y + 16)
            $sampleTop = $bmp.GetPixel($x, [Math]::Max(0, $y - 18))
            $sampleBot = $bmp.GetPixel($x, [Math]::Min(626, $y + 18))
            
            # Blend
            $r = [int](($sampleTop.R + $sampleBot.R) / 2)
            $g = [int](($sampleTop.G + $sampleBot.G) / 2)
            $b = [int](($sampleTop.B + $sampleBot.B) / 2)
            $bmp.SetPixel($x, $y, [System.Drawing.Color]::FromArgb($c.A, $r, $g, $b))
        }
    }
}

# Optional second pass: 3x3 median filter on the patched region to smooth out any edges
$patched = New-Object System.Drawing.Bitmap $bmp
for ($y = 312; $y -le 363; $y++) {
    for ($x = 367; $x -le 433; $x++) {
        $neighborsR = @(); $neighborsG = @(); $neighborsB = @()
        for ($dy = -1; $dy -le 1; $dy++) {
            for ($dx = -1; $dx -le 1; $dx++) {
                $nc = $bmp.GetPixel($x + $dx, $y + $dy)
                if ($nc.A -gt 50) {
                    $neighborsR += $nc.R
                    $neighborsG += $nc.G
                    $neighborsB += $nc.B
                }
            }
        }
        if ($neighborsR.Count -ge 5) {
            $medR = ($neighborsR | Measure-Object -Average).Average
            $medG = ($neighborsG | Measure-Object -Average).Average
            $medB = ($neighborsB | Measure-Object -Average).Average
            $origA = $bmp.GetPixel($x, $y).A
            $patched.SetPixel($x, $y, [System.Drawing.Color]::FromArgb($origA, [int]$medR, [int]$medG, [int]$medB))
        }
    }
}

$patched.Save($dstPath, [System.Drawing.Imaging.ImageFormat]::Png)
$patched.Dispose()
$bmp.Dispose()
$img.Dispose()

Write-Host "Cleanly patched clean_cell_6 at $dstPath"
