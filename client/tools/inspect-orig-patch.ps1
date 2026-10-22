Add-Type -AssemblyName System.Drawing

$src = "d:\IdeaProjects\World-of-308\docs\art\characters\hunter\animation-v4\extracted_cells\far_cell_2.png"
$bytes = [System.IO.File]::ReadAllBytes($src)
$ms = New-Object System.IO.MemoryStream(,$bytes)
$img = [System.Drawing.Image]::FromStream($ms)
$bmp = New-Object System.Drawing.Bitmap $img

Write-Host "far_cell_2 original pixels at Y=340..355, X=370..385:"
for ($y = 340; $y -le 355; $y += 3) {
    $line = ""
    for ($x = 370; $x -le 385; $x += 2) {
        $c = $bmp.GetPixel($x, $y)
        $line += ("{0,3} " -f $c.R)
    }
    Write-Host ("Y={0}: {1}" -f $y, $line)
}

$bmp.Dispose()
$img.Dispose()
$ms.Dispose()
