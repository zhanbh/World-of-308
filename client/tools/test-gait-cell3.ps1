Add-Type -AssemblyName System.Drawing

$s3 = [System.Drawing.Bitmap]::FromFile("d:\IdeaProjects\World-of-308\client\tools\warrior_gait_inspect\src_cell_3.png")
$s4 = [System.Drawing.Bitmap]::FromFile("d:\IdeaProjects\World-of-308\client\tools\warrior_gait_inspect\src_cell_4.png")

# Let's see what pixels differ between s3 and s4 in the torso/sash area
# Torso area X in [180, 320], Y in [150, 310]
$diffCount = 0
for ($y = 150; $y -lt 310; $y++) {
    for ($x = 180; $x -lt 320; $x++) {
        $p3 = $s3.GetPixel($x, $y)
        $p4 = $s4.GetPixel($x, $y)
        if ([Math]::Abs($p3.R - $p4.R) + [Math]::Abs($p3.G - $p4.G) + [Math]::Abs($p3.B - $p4.B) -gt 60) {
            $diffCount++
        }
    }
}
Write-Host "Torso/sash color differences: $diffCount pixels"

$s3.Dispose()
$s4.Dispose()
