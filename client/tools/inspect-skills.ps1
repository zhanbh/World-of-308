Add-Type -AssemblyName System.Drawing

function Check-Skill-Atlas($name, $file) {
    Write-Host "=== Checking $name ($file) ==="
    $bmp = [System.Drawing.Bitmap]::FromFile($file)
    $cw = 416; $ch = 416
    $cols = 4; $rows = 3
    for ($r = 0; $r -lt $rows; $r++) {
        for ($c = 0; $c -lt $cols; $c++) {
            $idx = $r * $cols + $c
            $startX = $c * $cw
            $startY = $r * $ch
            
            # Check for isolated pixels near the edges or floating
            # Find bounding box
            $minX = 999; $maxX = 0; $minY = 999; $maxY = 0
            $total = 0
            for ($y = 0; $y -lt $ch; $y++) {
                for ($x = 0; $x -lt $cw; $x++) {
                    $p = $bmp.GetPixel($startX + $x, $startY + $y)
                    if ($p.A -gt 20) {
                        $total++
                        if ($x -lt $minX) { $minX = $x }
                        if ($x -gt $maxX) { $maxX = $x }
                        if ($y -lt $minY) { $minY = $y }
                        if ($y -gt $maxY) { $maxY = $y }
                    }
                }
            }
            # Check if there are pixels very far from main cluster or on edges
            if ($minX -lt 30 -or $maxX -gt 385 -or $minY -lt 20) {
                Write-Host ("  Cell {0,2} (r={1}, c={2}): X=[{3,3}, {4,3}], Y=[{5,3}, {6,3}], count={7}" -f $idx, $r, $c, $minX, $maxX, $minY, $maxY, $total)
            }
        }
    }
    $bmp.Dispose()
}

Check-Skill-Atlas "badao-v2" "d:\IdeaProjects\World-of-308\client\assets\resources\warrior-badao-v2.png"
Check-Skill-Atlas "bengshan-v1" "d:\IdeaProjects\World-of-308\client\assets\resources\warrior-bengshan-v1.png"
Check-Skill-Atlas "cross-v1" "d:\IdeaProjects\World-of-308\client\assets\resources\warrior-cross-v1.png"
Check-Skill-Atlas "earth-v1" "d:\IdeaProjects\World-of-308\client\assets\resources\warrior-earth-v1.png"
