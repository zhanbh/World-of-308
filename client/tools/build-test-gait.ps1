Add-Type -AssemblyName System.Drawing

$atlasFile = "d:\IdeaProjects\World-of-308\client\assets\resources\warrior-gait-v2.png"
$atlas = [System.Drawing.Bitmap]::FromFile($atlasFile)
$cw = 416
$ch = 416

# Extract all 8 cells from current atlas
$cells = @()
for ($i = 0; $i -lt 8; $i++) {
    $c = $i % 4
    $r = [int][Math]::Floor($i / 4)
    $rect = New-Object System.Drawing.Rectangle ($c * $cw), ($r * $ch), $cw, $ch
    $bmp = New-Object System.Drawing.Bitmap $cw, $ch
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.DrawImage($atlas, (New-Object System.Drawing.Rectangle(0, 0, $cw, $ch)), $rect, [System.Drawing.GraphicsUnit]::Pixel)
    $g.Dispose()
    $cells += $bmp
}
$atlas.Dispose()

# Create Cell 3 (Far Flight / Extension) based on Cell 4 (Far Contact):
# 1. Shift entire body up by 6px (airborne)
# 2. In Cell 4, the far foot touches ground at Y=352. Lifted by 6px it is at Y=346 (airborne!).
# 3. For the trailing rear leg, toe is in mid-air.
$cell3 = New-Object System.Drawing.Bitmap $cw, $ch
$g3 = [System.Drawing.Graphics]::FromImage($cell3)

# Draw cell 4 shifted up by 6 pixels
$srcR = New-Object System.Drawing.Rectangle 0, 0, $cw, $ch
$dstR = New-Object System.Drawing.Rectangle 0, -6, $cw, $ch
$g3.DrawImage($cells[4], $dstR, $srcR, [System.Drawing.GraphicsUnit]::Pixel)

# Now refine the far foot so it reaches forward in the air
# Far foot is at X in [270, 316], Y in [336, 348] (after shift)
# Toe tip can extend 2px further forward and heel angle up slightly
$g3.Dispose()

$cells[3].Dispose()
$cells[3] = $cell3

# Assemble test atlas
$testAtlas = New-Object System.Drawing.Bitmap (4 * $cw), (2 * $ch)
$gAtlas = [System.Drawing.Graphics]::FromImage($testAtlas)
for ($i = 0; $i -lt 8; $i++) {
    $c = $i % 4
    $r = [int][Math]::Floor($i / 4)
    $gAtlas.DrawImage($cells[$i], ($c * $cw), ($r * $ch))
}
$gAtlas.Dispose()

$outAtlas = "d:\IdeaProjects\World-of-308\client\tools\warrior_gait_inspect\test-warrior-gait.png"
$testAtlas.Save($outAtlas, [System.Drawing.Imaging.ImageFormat]::Png)
$testAtlas.Dispose()

for ($i = 0; $i -lt 8; $i++) { $cells[$i].Dispose() }

Write-Host "Created test atlas at $outAtlas"
