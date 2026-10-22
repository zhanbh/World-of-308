Add-Type -AssemblyName System.Drawing

$srcPath = "d:\IdeaProjects\World-of-308\docs\art\characters\hunter\animation-v4\extracted_cells\far_cell_2.png"
$dstPath = "d:\IdeaProjects\World-of-308\docs\art\characters\hunter\animation-v7\clean_cells\clean_cell_6.png"

$bytes = [System.IO.File]::ReadAllBytes($srcPath)
$ms = New-Object System.IO.MemoryStream(,$bytes)
$img = [System.Drawing.Image]::FromStream($ms)
$bmp = New-Object System.Drawing.Bitmap $img

# Upper clean anchor Y0 = 304 (just below black shorts hem)
# Lower clean anchor Y1 = 360 (just above knee curve)
$y0 = 305
$y1 = 360

# We want to replace only the stocking area on the thigh (X between 366 and 432)
for ($x = 366; $x -le 434; $x++) {
    $c0 = $bmp.GetPixel($x, $y0)
    $c1 = $bmp.GetPixel($x, $y1)
    
    # If the anchors are valid stocking pixels
    for ($y = $y0 + 1; $y -lt $y1; $y++) {
        $orig = $bmp.GetPixel($x, $y)
        if ($orig.A -lt 100) { continue }
        
        # Don't overwrite the outer dark contour if x is at the extreme edge
        $t = ($y - $y0) / [double]($y1 - $y0)
        
        $r = [int]($c0.R * (1.0 - $t) + $c1.R * $t)
        $g = [int]($c0.G * (1.0 - $t) + $c1.G * $t)
        $b = [int]($c0.B * (1.0 - $t) + $c1.B * $t)
        
        $bmp.SetPixel($x, $y, [System.Drawing.Color]::FromArgb($orig.A, $r, $g, $b))
    }
}

# Apply a gentle 3x3 smoothing over the patch boundary
$smoothed = New-Object System.Drawing.Bitmap $bmp
for ($y = $y0; $y -le $y1; $y++) {
    for ($x = 365; $x -le 435; $x++) {
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

Write-Host "Seamlessly interpolated clean_cell_6 at $dstPath"
