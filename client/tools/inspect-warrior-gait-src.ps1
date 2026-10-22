Add-Type -AssemblyName System.Drawing

$src = "d:\IdeaProjects\World-of-308\docs\art\motion-studies\warrior\body\gait-v2\generated-source.png"
$bytes = [System.IO.File]::ReadAllBytes($src)
$ms = New-Object System.IO.MemoryStream(,$bytes)
$img = [System.Drawing.Image]::FromStream($ms)
$bmp = New-Object System.Drawing.Bitmap $img

$w = $img.Width / 4.0
$h = $img.Height / 2.0
Write-Host "Image size: $($img.Width) x $($img.Height), Cell: $w x $h"

for ($row = 0; $row -lt 2; $row++) {
    for ($col = 0; $col -lt 4; $col++) {
        $idx = $row * 4 + $col
        $minX = 9999; $maxX = 0; $minY = 9999; $maxY = 0
        $startX = [int]($col * $w)
        $startY = [int]($row * $h)
        $endX = [int](($col + 1) * $w)
        $endY = [int](($row + 1) * $h)
        
        for ($y = $startY; $y -lt $endY; $y++) {
            for ($x = $startX; $x -lt $endX; $x++) {
                if ($bmp.GetPixel($x, $y).A -gt 100) {
                    $cx = $x - $startX
                    $cy = $y - $startY
                    if ($cx -lt $minX) { $minX = $cx }
                    if ($cx -gt $maxX) { $maxX = $cx }
                    if ($cy -lt $minY) { $minY = $cy }
                    if ($cy -gt $maxY) { $maxY = $cy }
                }
            }
        }
        Write-Host ("Cell {0} (r={1}, c={2}): X in [{3}, {4}], Y in [{5}, {6}], H={7}" -f $idx, $row, $col, $minX, $maxX, $minY, $maxY, ($maxY - $minY + 1))
    }
}

$bmp.Dispose()
$img.Dispose()
$ms.Dispose()
