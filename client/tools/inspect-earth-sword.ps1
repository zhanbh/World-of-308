Add-Type -AssemblyName System.Drawing

$file = "d:\IdeaProjects\World-of-308\client\assets\resources\warrior-earth-v1.png"
$bmp = [System.Drawing.Bitmap]::FromFile($file)
$cw = 416; $ch = 416

# Frame 7: col = 3, row = 1
$startX = 3 * $cw
$startY = 1 * $ch

$xs = @()
$ys = @()
for ($y = $ch - 1; $y -ge 0; $y--) {
    for ($x = 0; $x -lt $cw; $x++) {
        if ($bmp.GetPixel($startX + $x, $startY + $y).A -gt 100) {
            $xs += $x
            $ys += $y
        }
    }
    if ($xs.Count -gt 100) { break }
}

$minX = ($xs | Measure-Object -Minimum).Minimum
$maxX = ($xs | Measure-Object -Maximum).Maximum
$maxY = ($ys | Measure-Object -Maximum).Maximum
Write-Host ("Frame 7 lowest pixels: X=[{0}, {1}], Y={2}, CenterX={3}" -f $minX, $maxX, $maxY, (($minX + $maxX)/2))

# Find the sword tip specifically (in front of the boots)
# Boots are usually around X=150..220. Let's find maxX in the entire frame
$allXs = @()
$allYs = @()
for ($y = 0; $y -lt $ch; $y++) {
    for ($x = 0; $x -lt $cw; $x++) {
        if ($bmp.GetPixel($startX + $x, $startY + $y).A -gt 100) {
            $allXs += $x
            $allYs += $y
        }
    }
}
$frameMinX = ($allXs | Measure-Object -Minimum).Minimum
$frameMaxX = ($allXs | Measure-Object -Maximum).Maximum
$frameMinY = ($allYs | Measure-Object -Minimum).Minimum
$frameMaxY = ($allYs | Measure-Object -Maximum).Maximum
Write-Host ("Frame 7 full bounding box: X=[{0}, {1}], Y=[{2}, {3}]" -f $frameMinX, $frameMaxX, $frameMinY, $frameMaxY)
Write-Host ("Anchor is (208, 352). Front edge extends to X={0} (+{1}px in front of anchor)" -f $frameMaxX, ($frameMaxX - 208))

$bmp.Dispose()
