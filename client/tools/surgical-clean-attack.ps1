Add-Type -AssemblyName System.Drawing

$attackPath = "d:\IdeaProjects\World-of-308\client\assets\resources\warrior-basic-attack-v2.png"
$bmp = [System.Drawing.Bitmap]::FromFile($attackPath)

$targets = @(
    @{ Name = "Cell 4 cut slice (frame 4)";   MinX = 1328; MaxX = 1342; MinY = 201; MaxY = 221; Expected = 166 },
    @{ Name = "Cell 5 cut slice (frame 5)";   MinX = 1631; MaxX = 1650; MinY = 208; MaxY = 249; Expected = 512 },
    @{ Name = "Cell 2 noise (frame 2)";       MinX =  657; MaxX =  662; MinY = 261; MaxY = 271; Expected =  20 },
    @{ Name = "Cell 9 cut slice (frame 9)";   MinX =  341; MaxX =  346; MinY = 437; MaxY = 476; Expected = 116 },
    @{ Name = "Cell 11 cut slice (frame 11)"; MinX =  971; MaxX =  986; MinY = 448; MaxY = 539; Expected = 845 },
    @{ Name = "Cell 18 stray (frame 18)";     MinX =  677; MaxX =  688; MinY = 896; MaxY = 912; Expected =  85 },
    @{ Name = "Cell 21 cut slice (frame 21)"; MinX = 1630; MaxX = 1663; MinY = 892; MaxY = 919; Expected = 513 }
)

$totalErased = 0
foreach ($t in $targets) {
    $count = 0
    for ($y = $t.MinY; $y -le $t.MaxY; $y++) {
        for ($x = $t.MinX; $x -le $t.MaxX; $x++) {
            $p = $bmp.GetPixel($x, $y)
            if ($p.A -gt 0) {
                $bmp.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(0, 0, 0, 0))
                $count++
            }
        }
    }
    Write-Host ("{0}: erased {1} pixels (expected ~{2})" -f $t.Name, $count, $t.Expected)
    $totalErased += $count
}

Write-Host "Total pixels erased: $totalErased"

$tmp = "$attackPath.tmp.png"
$bmp.Save($tmp, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
Move-Item -Force $tmp $attackPath
Write-Host "warrior-basic-attack-v2.png updated with surgical precision!"
