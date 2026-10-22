Add-Type -AssemblyName System.Drawing

$img = [System.Drawing.Image]::FromFile("d:\IdeaProjects\World-of-308\docs\art\characters\hunter\animation-v4\extracted_cells\far_cell_2.png")
$bmp = New-Object System.Drawing.Bitmap $img

# The strap on the front thigh is at X approx 330-390, Y approx 300-345.
# Let's inspect rows Y=285 (above strap, pure tights) and Y=355 (below strap, pure tights).
Write-Host "Tights color above strap (Y=288):"
for ($x = 330; $x -le 380; $x += 10) {
    $c = $bmp.GetPixel($x, 288)
    Write-Host "  X=$x : R=$($c.R), G=$($c.G), B=$($c.B)"
}

Write-Host "Tights color below strap (Y=352):"
for ($x = 330; $x -le 380; $x += 10) {
    $c = $bmp.GetPixel($x, 352)
    Write-Host "  X=$x : R=$($c.R), G=$($c.G), B=$($c.B)"
}

$bmp.Dispose()
$img.Dispose()
