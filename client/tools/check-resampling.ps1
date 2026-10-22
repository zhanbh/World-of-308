Add-Type -AssemblyName System.Drawing

$src = "d:\IdeaProjects\World-of-308\docs\art\characters\hunter\animation-v4\extracted_cells\near_cell_0.png"
$v4Atlas = "d:\IdeaProjects\World-of-308\docs\art\characters\hunter\animation-v4\run-atlas.png"

$bytes = [System.IO.File]::ReadAllBytes($v4Atlas)
$ms = New-Object System.IO.MemoryStream(,$bytes)
$imgAtlas = [System.Drawing.Image]::FromStream($ms)
$bmpAtlas = New-Object System.Drawing.Bitmap $imgAtlas

# Check alpha values along edge of frame 0 in v4 atlas
$hasAntialias = $false
for ($y = 150; $y -le 355; $y++) {
    for ($x = 120; $x -le 305; $x++) {
        $a = $bmpAtlas.GetPixel($x, $y).A
        if ($a -gt 10 -and $a -lt 240) {
            $hasAntialias = $true
            break
        }
    }
    if ($hasAntialias) { break }
}
Write-Host "v4 atlas frame 0 has antialiasing: $hasAntialias"

$bmpAtlas.Dispose()
$imgAtlas.Dispose()
$ms.Dispose()
