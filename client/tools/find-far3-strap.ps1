Add-Type -AssemblyName System.Drawing

$img = [System.Drawing.Image]::FromFile("d:\IdeaProjects\World-of-308\docs\art\characters\hunter\animation-v4\extracted_cells\far_cell_3.png")
$bmp = New-Object System.Drawing.Bitmap $img

$strapPixels = @()
for ($y = 280; $y -lt 380; $y++) {
    for ($x = 230; $x -lt 330; $x++) {
        $c = $bmp.GetPixel($x, $y)
        # Gold buckle or brown leather strap or green jade
        $isGold = ($c.R -gt 150 -and $c.G -gt 120 -and $c.B -lt 80)
        $isJade = ($c.G -gt 90 -and $c.G -gt ($c.R * 1.2) -and $c.R -lt 100)
        $isLeather = ($c.R -gt 70 -and $c.R -lt 130 -and $c.G -gt 40 -and $c.G -lt 80 -and $c.B -lt 60)
        if (($isGold -or $isJade -or $isLeather) -and $c.A -gt 200) {
            $strapPixels += [PSCustomObject]@{ X = $x; Y = $y; Color = $c }
        }
    }
}

Write-Host "Found $($strapPixels.Count) strap/buckle pixels in far_cell_3"
$minX = ($strapPixels | Measure-Object -Property X -Minimum).Minimum
$maxX = ($strapPixels | Measure-Object -Property X -Maximum).Maximum
$minY = ($strapPixels | Measure-Object -Property Y -Minimum).Minimum
$maxY = ($strapPixels | Measure-Object -Property Y -Maximum).Maximum
Write-Host "Region: X [$minX, $maxX], Y [$minY, $maxY]"

$bmp.Dispose()
$img.Dispose()
