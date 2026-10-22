Add-Type -AssemblyName System.Drawing

$img = [System.Drawing.Image]::FromFile("d:\IdeaProjects\World-of-308\docs\art\characters\hunter\animation-v4\run-atlas.png")
$bmp = New-Object System.Drawing.Bitmap $img

for ($row = 0; $row -lt 2; $row++) {
    for ($col = 0; $col -lt 4; $col++) {
        $cellIndex = $row * 4 + $col
        $minX = 416; $maxX = 0; $minY = 416; $maxY = 0
        $count = 0
        for ($cy = 0; $cy -lt 416; $cy++) {
            for ($cx = 0; $cx -lt 416; $cx++) {
                $x = $col * 416 + $cx
                $y = $row * 416 + $cy
                if ($bmp.GetPixel($x, $y).A -gt 40) {
                    $count++
                    if ($cx -lt $minX) { $minX = $cx }
                    if ($cx -gt $maxX) { $maxX = $cx }
                    if ($cy -lt $minY) { $minY = $cy }
                    if ($cy -gt $maxY) { $maxY = $cy }
                }
            }
        }
        if ($count -gt 0) {
            Write-Host ("Frame {0}: X in [{1}, {2}], Y in [{3}, {4}], H={5}, W={6}" -f $cellIndex, $minX, $maxX, $minY, $maxY, ($maxY - $minY + 1), ($maxX - $minX + 1))
        } else {
            Write-Host ("Frame {0}: EMPTY" -f $cellIndex)
        }
    }
}

$bmp.Dispose()
$img.Dispose()
