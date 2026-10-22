Add-Type -AssemblyName System.Drawing

$file = "d:\IdeaProjects\World-of-308\client\assets\resources\warrior-basic-attack-v2.png"
$bmp = [System.Drawing.Bitmap]::FromFile($file)
$cw = 320
$ch = 320

function Check-Cell-Left($idx, $cropLeft) {
    $r = [int][Math]::Floor($idx / 8)
    $c = $idx % 8
    $startX = $c * $cw
    $startY = $r * $ch
    Write-Host "--- Cell $idx (r=$r, c=$c) check left [0..$cropLeft] ---"
    $minX = 999; $maxX = 0; $minY = 999; $maxY = 0
    $count = 0
    for ($y = 0; $y -lt $ch; $y++) {
        for ($x = 0; $x -lt $cropLeft; $x++) {
            $p = $bmp.GetPixel($startX + $x, $startY + $y)
            if ($p.A -gt 20) {
                $count++
                if ($x -lt $minX) { $minX = $x }
                if ($x -gt $maxX) { $maxX = $x }
                if ($y -lt $minY) { $minY = $y }
                if ($y -gt $maxY) { $maxY = $y }
            }
        }
    }
    Write-Host ("In [0..{0}]: count={1}, X=[{2}, {3}], Y=[{4}, {5}]" -f $cropLeft, $count, $minX, $maxX, $minY, $maxY)
}

Check-Cell-Left 4 70
Check-Cell-Left 5 64
Check-Cell-Left 9 48
Check-Cell-Left 11 40
Check-Cell-Left 2 40

$bmp.Dispose()
