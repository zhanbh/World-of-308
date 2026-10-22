Add-Type -AssemblyName System.Drawing

$file = "d:\IdeaProjects\World-of-308\client\assets\resources\warrior-basic-attack-v2.png"
$bmp = [System.Drawing.Bitmap]::FromFile($file)
$cw = 320
$ch = 320
$cols = 8
$rows = 3

Write-Host "Image size: $($bmp.Width) x $($bmp.Height)"

for ($r = 0; $r -lt $rows; $r++) {
    for ($c = 0; $c -lt $cols; $c++) {
        $idx = $r * $cols + $c
        $startX = $c * $cw
        $startY = $r * $ch
        
        # Check left edge (x = 0..15 inside cell) for isolated opaque pixels
        $leftBleed = 0
        for ($y = 0; $y -lt $ch; $y++) {
            for ($x = 0; $x -lt 25; $x++) {
                if ($bmp.GetPixel($startX + $x, $startY + $y).A -gt 30) {
                    $leftBleed++
                }
            }
        }
        
        # Check right edge (x = 300..319 inside cell)
        $rightBleed = 0
        for ($y = 0; $y -lt $ch; $y++) {
            for ($x = 295; $x -lt $cw; $x++) {
                if ($bmp.GetPixel($startX + $x, $startY + $y).A -gt 30) {
                    $rightBleed++
                }
            }
        }
        
        if ($leftBleed -gt 0 -or $rightBleed -gt 0) {
            Write-Host ("Cell {0,2} (row {1}, col {2}): LeftEdgePixels={3,4}, RightEdgePixels={4,4}" -f $idx, $r, $c, $leftBleed, $rightBleed)
        }
    }
}
$bmp.Dispose()
