Add-Type -AssemblyName System.Drawing

# 1. Clean warrior-body-v1.png
$bodyPath = "d:\IdeaProjects\World-of-308\client\assets\resources\warrior-body-v1.png"
$bodyBmp = [System.Drawing.Bitmap]::FromFile($bodyPath)
# Backup original
$bodyBackup = "d:\IdeaProjects\World-of-308\client\assets\resources\warrior-body-v1.png.bak"
if (-not (Test-Path $bodyBackup)) { Copy-Item $bodyPath $bodyBackup }

# Erase stray boot fragment in Cell 8 (col 2, row 2): X in [832, 916], Y in [1100, 1200]
# Specifically, in Cell 8, any pixels with cell X < 85 (Atlas X < 917)
$erasedBody = 0
for ($y = 1100; $y -lt 1248; $y++) {
    for ($x = 832; $x -lt 917; $x++) {
        $p = $bodyBmp.GetPixel($x, $y)
        if ($p.A -gt 0) {
            $bodyBmp.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(0, 0, 0, 0))
            $erasedBody++
        }
    }
}
Write-Host "warrior-body-v1.png: erased $erasedBody stray boot pixels in Cell 8"
$bodyTemp = "$bodyPath.tmp.png"
$bodyBmp.Save($bodyTemp, [System.Drawing.Imaging.ImageFormat]::Png)
$bodyBmp.Dispose()
Move-Item -Force $bodyTemp $bodyPath

# 2. Clean warrior-badao-v2.png
$badaoPath = "d:\IdeaProjects\World-of-308\client\assets\resources\warrior-badao-v2.png"
$badaoBmp = [System.Drawing.Bitmap]::FromFile($badaoPath)
$badaoBackup = "d:\IdeaProjects\World-of-308\client\assets\resources\warrior-badao-v2.png.bak"
if (-not (Test-Path $badaoBackup)) { Copy-Item $badaoPath $badaoBackup }

# Component 1 in Cell 5 (col 1, row 1): X in [750, 760], Y in [725, 745]
$erasedBadao1 = 0
for ($y = 725; $y -le 745; $y++) {
    for ($x = 750; $x -le 760; $x++) {
        $p = $badaoBmp.GetPixel($x, $y)
        if ($p.A -gt 0) {
            $badaoBmp.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(0, 0, 0, 0))
            $erasedBadao1++
        }
    }
}

# Component 2 in Cell 6 (col 2, row 1): X in [945, 955], Y in [665, 678]
$erasedBadao2 = 0
for ($y = 665; $y -le 678; $y++) {
    for ($x = 945; $x -le 955; $x++) {
        $p = $badaoBmp.GetPixel($x, $y)
        if ($p.A -gt 0) {
            $badaoBmp.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(0, 0, 0, 0))
            $erasedBadao2++
        }
    }
}
Write-Host "warrior-badao-v2.png: erased $erasedBadao1 pixels at Component 1, $erasedBadao2 pixels at Component 2"

$badaoTemp = "$badaoPath.tmp.png"
$badaoBmp.Save($badaoTemp, [System.Drawing.Imaging.ImageFormat]::Png)
$badaoBmp.Dispose()
Move-Item -Force $badaoTemp $badaoPath

Write-Host "Successfully cleaned warrior-body-v1.png and warrior-badao-v2.png"
