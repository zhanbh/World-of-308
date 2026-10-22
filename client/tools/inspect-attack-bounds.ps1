Add-Type -AssemblyName System.Drawing

$file = "d:\IdeaProjects\World-of-308\client\assets\resources\warrior-basic-attack-v2.png"
$bmp = [System.Drawing.Bitmap]::FromFile($file)
$cw = 320
$ch = 320
$cols = 8
$rows = 3

for ($r = 0; $r -lt $rows; $r++) {
    for ($c = 0; $c -lt $cols; $c++) {
        $idx = $r * $cols + $c
        $startX = $c * $cw
        $startY = $r * $ch
        
        $minX = 999; $maxX = 0; $minY = 999; $maxY = 0
        $count = 0
        for ($y = 0; $y -lt $ch; $y++) {
            for ($x = 0; $x -lt $cw; $x++) {
                $p = $bmp.GetPixel($startX + $x, $startY + $y)
                if ($p.A -gt 30) {
                    $count++
                    if ($x -lt $minX) { $minX = $x }
                    if ($x -gt $maxX) { $maxX = $x }
                    if ($y -lt $minY) { $minY = $y }
                    if ($y -gt $maxY) { $maxY = $y }
                }
            }
        }
        Write-Host ("Cell {0,2} (r={1}, c={2}): X=[{3,3}, {4,3}], Y=[{5,3}, {6,3}], count={7}" -f $idx, $r, $c, $minX, $maxX, $minY, $maxY, $count)
    }
}
$bmp.Dispose()
