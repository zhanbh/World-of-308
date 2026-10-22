Add-Type -AssemblyName System.Drawing

$attackPath = "d:\IdeaProjects\World-of-308\client\assets\resources\warrior-basic-attack-v2.png"
$bmp = [System.Drawing.Bitmap]::FromFile($attackPath)
$backup = "d:\IdeaProjects\World-of-308\client\assets\resources\warrior-basic-attack-v2.png.bak"
if (-not (Test-Path $backup)) { Copy-Item $attackPath $backup }

$cw = 320; $ch = 320

function Erase-Box($name, $minX, $maxX, $minY, $maxY) {
    $count = 0
    for ($y = $minY; $y -le $maxY; $y++) {
        for ($x = $minX; $x -le $maxX; $x++) {
            $p = $bmp.GetPixel($x, $y)
            if ($p.A -gt 0) {
                $bmp.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(0, 0, 0, 0))
                $count++
            }
        }
    }
    Write-Host ("  Erased {0,4} pixels in {1} at X=[{2}, {3}], Y=[{4}, {5}]" -f $count, $name, $minX, $maxX, $minY, $maxY)
}

Write-Host "Cleaning warrior-basic-attack-v2.png..."

# Row 0:
# Cell 2: stray noise at lower left
Erase-Box "Cell 2 stray noise" 650 670 255 275
# Cell 4: cut-edge blade slice from frame 3
Erase-Box "Cell 4 cut-edge slice" 1320 1350 195 225
Erase-Box "Cell 4 speck" 1445 1455 155 165
# Cell 5: cut-edge blade slice from frame 4
Erase-Box "Cell 5 cut-edge slice" 1630 1655 205 252
Erase-Box "Cell 5 specks" 1805 1830 110 120
Erase-Box "Cell 5 speck2" 1730 1745 150 160
# Cell 0 & 7 specks
Erase-Box "Cell 0 specks" 180 190 205 215
Erase-Box "Cell 7 specks" 2350 2365 145 160

# Row 1:
# Cell 9: cut-edge slice from frame 8
Erase-Box "Cell 9 cut-edge slice" 335 355 430 480
Erase-Box "Cell 9 specks" 415 495 495 565
# Cell 11: cut-edge slice from frame 10
Erase-Box "Cell 11 cut-edge slice" 965 990 440 545
Erase-Box "Cell 11 specks" 1100 1205 480 550
# Cell 10 specks
Erase-Box "Cell 10 specks" 870 905 430 550
# Cell 8 & 13 & 15 specks
Erase-Box "Cell 8 specks" 110 125 465 480
Erase-Box "Cell 13 specks" 1790 1805 430 445
Erase-Box "Cell 15 specks" 2345 2355 488 498

# Row 2:
# Cell 18: stray piece at lower left
Erase-Box "Cell 18 stray piece" 670 695 890 918
Erase-Box "Cell 18 specks" 805 940 740 850
# Cell 21: cut-edge blade slice
Erase-Box "Cell 21 cut-edge slice" 1625 1670 885 925
Erase-Box "Cell 21 speck" 1735 1745 840 850
# Cell 19 & 16 & 20 & 23 specks
Erase-Box "Cell 19 specks" 1190 1250 835 910
Erase-Box "Cell 16 specks" 105 115 808 818
Erase-Box "Cell 20 specks" 1415 1430 795 805
Erase-Box "Cell 23 specks" 2420 2430 840 855

$tmp = "$attackPath.tmp.png"
$bmp.Save($tmp, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
Move-Item -Force $tmp $attackPath

Write-Host "warrior-basic-attack-v2.png cleaned successfully!"
