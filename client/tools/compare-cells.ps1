Add-Type -AssemblyName System.Drawing

$s3 = [System.Drawing.Bitmap]::FromFile("d:\IdeaProjects\World-of-308\client\tools\warrior_gait_inspect\src_cell_3.png")
$s4 = [System.Drawing.Bitmap]::FromFile("d:\IdeaProjects\World-of-308\client\tools\warrior_gait_inspect\src_cell_4.png")

$w = $s3.Width
$h = $s3.Height

# Create a side-by-side comparison image
$combo = New-Object System.Drawing.Bitmap ($w * 2), $h
$g = [System.Drawing.Graphics]::FromImage($combo)
$g.DrawImage($s3, 0, 0)
$g.DrawImage($s4, $w, 0)
$g.Dispose()

$comboPath = "d:\IdeaProjects\World-of-308\client\tools\warrior_gait_inspect\compare_3_4.png"
$combo.Save($comboPath, [System.Drawing.Imaging.ImageFormat]::Png)
$combo.Dispose()
$s3.Dispose()
$s4.Dispose()
Write-Host "Saved side-by-side comparison to $comboPath"
