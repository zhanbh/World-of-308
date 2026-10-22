Add-Type -AssemblyName System.Drawing

$src = "d:\IdeaProjects\World-of-308\docs\art\characters\hunter\animation-v4\extracted_cells\far_cell_2.png"
$bytes = [System.IO.File]::ReadAllBytes($src)
$ms = New-Object System.IO.MemoryStream(,$bytes)
$img = [System.Drawing.Image]::FromStream($ms)
$bmp = New-Object System.Drawing.Bitmap $img

Write-Host "Sampling column X=395 from Y=300 to Y=370:"
for ($y = 300; $y -le 370; $y += 2) {
    $c = $bmp.GetPixel(395, $y)
    Write-Host ("Y={0:D3}: R={1:D3}, G={2:D3}, B={3:D3}, A={4:D3}" -f $y, $c.R, $c.G, $c.B, $c.A)
}

$bmp.Dispose()
$img.Dispose()
$ms.Dispose()
