Add-Type -AssemblyName System.Drawing

$src = "d:\IdeaProjects\World-of-308\docs\art\characters\hunter\animation-v4\extracted_cells\far_cell_2.png"
$bytes = [System.IO.File]::ReadAllBytes($src)
$ms = New-Object System.IO.MemoryStream(,$bytes)
$img = [System.Drawing.Image]::FromStream($ms)
$bmp = New-Object System.Drawing.Bitmap $img

$minX = 999; $maxX = 0; $minY = 999; $maxY = 0

for ($y = 280; $y -le 380; $y++) {
    for ($x = 350; $x -le 450; $x++) {
        $c = $bmp.GetPixel($x, $y)
        # Gold buckle or jade or strap:
        $isGold = ($c.R -gt 150 -and $c.G -gt 110 -and $c.B -lt 80)
        $isJade = ($c.G -gt 80 -and $c.G -gt ($c.R * 1.15) -and $c.B -lt 100)
        if ($isGold -or $isJade) {
            if ($x -lt $minX) { $minX = $x }
            if ($x -gt $maxX) { $maxX = $x }
            if ($y -lt $minY) { $minY = $y }
            if ($y -gt $maxY) { $maxY = $y }
        }
    }
}

Write-Host "Buckle/Jade range: X=[$minX, $maxX], Y=[$minY, $maxY]"

# Also find the dark leather strap band:
$strapMinX = 999; $strapMaxX = 0; $strapMinY = 999; $strapMaxY = 0
for ($y = 310; $y -le 355; $y++) {
    for ($x = 360; $x -le 435; $x++) {
        $c = $bmp.GetPixel($x, $y)
        # dark leather strap or dark border
        if ($c.R -lt 45 -and $c.G -lt 40 -and $c.B -lt 40 -and $c.A -gt 200) {
            if ($x -lt $strapMinX) { $strapMinX = $x }
            if ($x -gt $strapMaxX) { $strapMaxX = $x }
            if ($y -lt $strapMinY) { $strapMinY = $y }
            if ($y -gt $strapMaxY) { $strapMaxY = $y }
        }
    }
}
Write-Host "Dark band range: X=[$strapMinX, $strapMaxX], Y=[$strapMinY, $strapMaxY]"

$bmp.Dispose()
$img.Dispose()
$ms.Dispose()
