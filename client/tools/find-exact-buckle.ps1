Add-Type -AssemblyName System.Drawing

$img = [System.Drawing.Image]::FromFile("d:\IdeaProjects\World-of-308\docs\art\characters\hunter\animation-v4\extracted_cells\far_cell_2.png")
$bmp = New-Object System.Drawing.Bitmap $img

$pixels = @()
for ($y = 0; $y -lt 627; $y++) {
    for ($x = 0; $x -lt 627; $x++) {
        $c = $bmp.GetPixel($x, $y)
        # Gold buckle
        if ($c.R -gt 160 -and $c.G -gt 130 -and $c.B -lt 80 -and $y -gt 280 -and $y -lt 400 -and $x -gt 350 -and $x -lt 450) {
            $pixels += [PSCustomObject]@{ X = $x; Y = $y }
        }
    }
}

Write-Host "Found $($pixels.Count) gold buckle pixels"
if ($pixels.Count -gt 0) {
    $minX = ($pixels | Measure-Object -Property X -Minimum).Minimum
    $maxX = ($pixels | Measure-Object -Property X -Maximum).Maximum
    $minY = ($pixels | Measure-Object -Property Y -Minimum).Minimum
    $maxY = ($pixels | Measure-Object -Property Y -Maximum).Maximum
    Write-Host "Gold buckle is exactly at: X [$minX, $maxX], Y [$minY, $maxY]"
}

$bmp.Dispose()
$img.Dispose()
