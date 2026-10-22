Add-Type -AssemblyName System.Drawing

$src = "d:\IdeaProjects\World-of-308\docs\art\characters\hunter\animation-v4\extracted_cells\far_cell_2.png"
$dst = "d:\IdeaProjects\World-of-308\docs\art\characters\hunter\animation-v7\clean_cells\clean_cell_6.png"

$bytes = [System.IO.File]::ReadAllBytes($src)
$ms = New-Object System.IO.MemoryStream(,$bytes)
$img = [System.Drawing.Image]::FromStream($ms)
$bmp = New-Object System.Drawing.Bitmap $img

$yTop = 318
$yBot = 360

# Function to find the right contour of the thigh for a given Y
# The thigh right contour is the dark pixel (R < 50) before the outer air/arm
function Get-ThighRight($bmp, $y) {
    for ($x = 422; $x -ge 405; $x--) {
        $c = $bmp.GetPixel($x, $y)
        if ($c.R -lt 50 -and $c.A -gt 200) {
            return $x
        }
    }
    return 415
}

# The left side of the thigh patch is at X=368 (skirt/shorts boundary is around 365)
$xLeftTop = 368
$xLeftBot = 368
$xRightTop = Get-ThighRight $bmp $yTop
$xRightBot = Get-ThighRight $bmp $yBot

Write-Host "Top bounds at Y=$($yTop): [$xLeftTop, $xRightTop]"
Write-Host "Bot bounds at Y=$($yBot): [$xLeftBot, $xRightBot]"

# Sample the top profile (u in [0, 1])
$topSamples = @()
$wTop = $xRightTop - $xLeftTop
for ($i = 0; $i -le 100; $i++) {
    $u = $i / 100.0
    $x = [int]($xLeftTop + $u * $wTop)
    $topSamples += $bmp.GetPixel($x, $yTop)
}

# Sample the bottom profile (u in [0, 1])
$botSamples = @()
$wBot = $xRightBot - $xLeftBot
for ($i = 0; $i -le 100; $i++) {
    $u = $i / 100.0
    $x = [int]($xLeftBot + $u * $wBot)
    $botSamples += $bmp.GetPixel($x, $yBot)
}

# Patch rows from Y=322 to Y=356
for ($y = 322; $y -le 356; $y++) {
    $v = ($y - $yTop) / [double]($yBot - $yTop)
    # Hermite curve for smooth vertical transition
    $sv = $v * $v * (3.0 - 2.0 * $v)
    
    $xRight = [int]($xRightTop * (1.0 - $v) + $xRightBot * $v)
    $xLeft = 368
    $w = $xRight - $xLeft
    
    # Don't overwrite the rightmost dark contour pixel (leave xRight untouched)
    for ($x = $xLeft; $x -lt $xRight; $x++) {
        $u = ($x - $xLeft) / [double]$w
        $idx = [Math]::Min(100, [Math]::Max(0, [int]($u * 100)))
        
        $cTop = $topSamples[$idx]
        $cBot = $botSamples[$idx]
        
        $r = [int]($cTop.R * (1.0 - $sv) + $cBot.R * $sv)
        $g = [int]($cTop.G * (1.0 - $sv) + $cBot.G * $sv)
        $b = [int]($cTop.B * (1.0 - $sv) + $cBot.B * $sv)
        
        $origA = $bmp.GetPixel($x, $y).A
        $bmp.SetPixel($x, $y, [System.Drawing.Color]::FromArgb($origA, $r, $g, $b))
    }
}

# Gentle 3x3 gaussian blur only inside the patched box [369, xRight-1] x [321, 357]
$smoothed = New-Object System.Drawing.Bitmap $bmp
for ($y = 321; $y -le 357; $y++) {
    $v = ($y - $yTop) / [double]($yBot - $yTop)
    $xRight = [int]($xRightTop * (1.0 - $v) + $xRightBot * $v)
    for ($x = 369; $x -lt ($xRight - 1); $x++) {
        $rSum = 0.0; $gSum = 0.0; $bSum = 0.0; $wSum = 0.0
        for ($dy = -1; $dy -le 1; $dy++) {
            for ($dx = -1; $dx -le 1; $dx++) {
                $weight = if ($dx -eq 0 -and $dy -eq 0) { 4.0 } elseif ($dx -eq 0 -or $dy -eq 0) { 2.0 } else { 1.0 }
                $nc = $bmp.GetPixel($x + $dx, $y + $dy)
                $rSum += $nc.R * $weight
                $gSum += $nc.G * $weight
                $bSum += $nc.B * $weight
                $wSum += $weight
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

Write-Host "Natural cylindrical patch applied to clean_cell_6 successfully."
