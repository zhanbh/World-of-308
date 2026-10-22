Add-Type -AssemblyName System.Drawing

$file = "d:\IdeaProjects\World-of-308\client\assets\resources\warrior-body-v1.png"
$bmp = [System.Drawing.Bitmap]::FromFile($file)
$cw = 416
$ch = 416
$cols = 3
$rows = 3

Write-Host "warrior-body-v1.png size: $($bmp.Width) x $($bmp.Height)"

# Inspect cell 8 (row 2, col 2)
$r = 2
$c = 2
$startX = $c * $cw
$startY = $r * $ch

$minX = 999; $maxX = 0; $minY = 999; $maxY = 0
$leftCount = 0
for ($y = 0; $y -lt $ch; $y++) {
    for ($x = 0; $x -lt 85; $x++) {
        $p = $bmp.GetPixel($startX + $x, $startY + $y)
        if ($p.A -gt 20) {
            $leftCount++
            if ($x -lt $minX) { $minX = $x }
            if ($x -gt $maxX) { $maxX = $x }
            if ($y -lt $minY) { $minY = $y }
            if ($y -gt $maxY) { $maxY = $y }
        }
    }
}
Write-Host ("Cell 8 left region [0..85]: count={0}, X=[{1}, {2}], Y=[{3}, {4}]" -f $leftCount, $minX, $maxX, $minY, $maxY)

$bmp.Dispose()
