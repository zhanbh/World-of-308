Add-Type -AssemblyName System.Drawing

$dir = "d:\IdeaProjects\World-of-308\client\tools\warrior_gait_inspect"

function Analyze-Cells($prefix, $count) {
    Write-Host "=== Analyzing $prefix cells ==="
    for ($i = 0; $i -lt $count; $i++) {
        $file = "$dir\${prefix}_cell_${i}.png"
        $bmp = [System.Drawing.Bitmap]::FromFile($file)
        $w = $bmp.Width
        $h = $bmp.Height
        $minX = 9999; $maxX = 0; $minY = 9999; $maxY = 0
        $opaqueCount = 0
        for ($y = 0; $y -lt $h; $y++) {
            for ($x = 0; $x -lt $w; $x++) {
                $p = $bmp.GetPixel($x, $y)
                if ($p.A -gt 180) {
                    $opaqueCount++
                    if ($x -lt $minX) { $minX = $x }
                    if ($x -gt $maxX) { $maxX = $x }
                    if ($y -lt $minY) { $minY = $y }
                    if ($y -gt $maxY) { $maxY = $y }
                }
            }
        }
        $bmp.Dispose()
        Write-Host ("Cell {0}: X in [{1,3}, {2,3}], Y in [{3,3}, {4,3}], Size={5}x{6}, OpaquePixels={7}" -f $i, $minX, $maxX, $minY, $maxY, ($maxX - $minX + 1), ($maxY - $minY + 1), $opaqueCount)
    }
}

Analyze-Cells "src" 8
Analyze-Cells "atlas" 8
