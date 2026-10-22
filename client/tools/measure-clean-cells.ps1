Add-Type -AssemblyName System.Drawing

$results = @()
for ($i = 0; $i -le 7; $i++) {
    $path = "d:\IdeaProjects\World-of-308\docs\art\characters\hunter\animation-v7\clean_cells\clean_cell_$i.png"
    $bytes = [System.IO.File]::ReadAllBytes($path)
    $ms = New-Object System.IO.MemoryStream(,$bytes)
    $bmp = New-Object System.Drawing.Bitmap $ms
    $minX = 627; $maxX = 0; $minY = 627; $maxY = 0
    for ($y = 0; $y -lt 627; $y++) {
        for ($x = 0; $x -lt 627; $x++) {
            if ($bmp.GetPixel($x, $y).A -gt 40) {
                if ($x -lt $minX) { $minX = $x }
                if ($x -gt $maxX) { $maxX = $x }
                if ($y -lt $minY) { $minY = $y }
                if ($y -gt $maxY) { $maxY = $y }
            }
        }
    }
    $results += [PSCustomObject]@{
        Cell = "cell_$i"
        MinX = $minX; MaxX = $maxX; MinY = $minY; MaxY = $maxY
        W = ($maxX - $minX + 1); H = ($maxY - $minY + 1)
    }
    $bmp.Dispose()
    $ms.Dispose()
}

$results | Format-Table -AutoSize
