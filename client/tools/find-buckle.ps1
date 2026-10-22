Add-Type -AssemblyName System.Drawing

$img = [System.Drawing.Image]::FromFile("d:\IdeaProjects\World-of-308\docs\art\characters\hunter\animation-v4\extracted_cells\near_cell_1.png")
$bmp = New-Object System.Drawing.Bitmap $img

# Look for golden pixels (high R & G, lower B) in the thigh region (approx y between 300 and 420, x between 300 and 420)
$goldPixels = @()
for ($y = 300; $y -lt 450; $y++) {
    for ($x = 300; $x -lt 450; $x++) {
        $c = $bmp.GetPixel($x, $y)
        # Gold buckle typically has high R > 160, G > 140, B < 80
        if ($c.R -gt 160 -and $c.G -gt 130 -and $c.B -lt 80 -and $c.A -gt 200) {
            $goldPixels += [PSCustomObject]@{ X = $x; Y = $y; Color = $c }
        }
    }
}

Write-Host "Found $($goldPixels.Count) gold pixels in near_cell_1"
if ($goldPixels.Count -gt 0) {
    $minX = ($goldPixels | Measure-Object -Property X -Minimum).Minimum
    $maxX = ($goldPixels | Measure-Object -Property X -Maximum).Maximum
    $minY = ($goldPixels | Measure-Object -Property Y -Minimum).Minimum
    $maxY = ($goldPixels | Measure-Object -Property Y -Maximum).Maximum
    Write-Host "Gold buckle region: X [$minX, $maxX], Y [$minY, $maxY]"
}

$bmp.Dispose()
$img.Dispose()
