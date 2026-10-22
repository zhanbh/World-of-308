Add-Type -AssemblyName System.Drawing

$src = "d:\IdeaProjects\World-of-308\docs\art\characters\hunter\animation-v4\extracted_cells\far_cell_2.png"
$bytes = [System.IO.File]::ReadAllBytes($src)
$ms = New-Object System.IO.MemoryStream(,$bytes)
$img = [System.Drawing.Image]::FromStream($ms)
$bmp = New-Object System.Drawing.Bitmap $img

Write-Host "Row 320 colors:"
for ($x = 360; $x -le 435; $x += 5) {
    $c = $bmp.GetPixel($x, 320)
    Write-Host ("X={0:D3}: ({1:D3}, {2:D3}, {3:D3})" -f $x, $c.R, $c.G, $c.B)
}

Write-Host "Row 358 colors:"
for ($x = 360; $x -le 435; $x += 5) {
    $c = $bmp.GetPixel($x, 358)
    Write-Host ("X={0:D3}: ({1:D3}, {2:D3}, {3:D3})" -f $x, $c.R, $c.G, $c.B)
}

$bmp.Dispose()
$img.Dispose()
$ms.Dispose()
