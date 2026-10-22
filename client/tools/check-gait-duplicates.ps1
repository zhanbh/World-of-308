Add-Type -AssemblyName System.Drawing

$atlas = "d:\IdeaProjects\World-of-308\client\assets\resources\warrior-gait-v2.png"
$bmp = [System.Drawing.Bitmap]::FromFile($atlas)

$cells = @()
for ($i = 0; $i -lt 8; $i++) {
    $col = $i % 4
    $row = [int][Math]::Floor($i / 4)
    $cellBmp = New-Object System.Drawing.Bitmap 416, 416
    $g = [System.Drawing.Graphics]::FromImage($cellBmp)
    $srcRect = New-Object System.Drawing.Rectangle ($col * 416), ($row * 416), 416, 416
    $dstRect = New-Object System.Drawing.Rectangle 0, 0, 416, 416
    $g.DrawImage($bmp, $dstRect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)
    $g.Dispose()
    $cells += $cellBmp
}
$bmp.Dispose()

Write-Host "Comparing all cell pairs in updated warrior-gait-v2.png:"
$duplicatesFound = 0
for ($i = 0; $i -lt 8; $i++) {
    for ($j = $i + 1; $j -lt 8; $j++) {
        $diff = 0
        for ($y = 0; $y -lt 416; $y += 2) {
            for ($x = 0; $x -lt 416; $x += 2) {
                $c1 = $cells[$i].GetPixel($x, $y)
                $c2 = $cells[$j].GetPixel($x, $y)
                if ([Math]::Abs($c1.R - $c2.R) + [Math]::Abs($c1.G - $c2.G) + [Math]::Abs($c1.B - $c2.B) + [Math]::Abs($c1.A - $c2.A) -gt 20) {
                    $diff++
                }
            }
        }
        if ($diff -eq 0) {
            Write-Host ("Cell {0} and Cell {1} are 100% IDENTICAL DUPLICATES!" -f $i, $j)
            $duplicatesFound++
        } elseif ($diff -lt 100) {
            Write-Host ("Cell {0} and Cell {1} are very similar (diff={2})" -f $i, $j, $diff)
        } else {
            Write-Host ("Cell {0} vs Cell {1}: distinct (diff={2})" -f $i, $j, $diff)
        }
    }
}

for ($i = 0; $i -lt 8; $i++) { $cells[$i].Dispose() }

if ($duplicatesFound -eq 0) {
    Write-Host "SUCCESS: All 8 cells are distinct! 0 duplicates found."
} else {
    Write-Host "WARNING: Found $duplicatesFound duplicate pairs."
}
