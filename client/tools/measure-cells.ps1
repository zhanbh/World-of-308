Add-Type -AssemblyName System.Drawing

$cells = @("near_cell_0", "near_cell_1", "near_cell_2", "near_cell_3", "far_cell_0", "far_cell_1", "far_cell_2", "far_cell_3")

$results = @()
foreach ($name in $cells) {
    $path = "d:\IdeaProjects\World-of-308\docs\art\characters\hunter\animation-v4\extracted_cells\$name.png"
    $img = [System.Drawing.Image]::FromFile($path)
    $bmp = New-Object System.Drawing.Bitmap $img
    
    $minX = 627; $maxX = 0; $minY = 627; $maxY = 0
    $solePixels = @()
    
    for ($y = 0; $y -lt 627; $y++) {
        for ($x = 0; $x -lt 627; $x++) {
            $a = $bmp.GetPixel($x, $y).A
            if ($a -gt 40) {
                if ($x -lt $minX) { $minX = $x }
                if ($x -gt $maxX) { $maxX = $x }
                if ($y -lt $minY) { $minY = $y }
                if ($y -gt $maxY) { $maxY = $y }
            }
        }
    }
    
    # Measure lowest boot pixels (within 10 pixels of maxY)
    for ($y = $maxY - 10; $y -le $maxY; $y++) {
        for ($x = $minX; $x -le $maxX; $x++) {
            if ($bmp.GetPixel($x, $y).A -gt 100) {
                $solePixels += $x
            }
        }
    }
    $soleCenter = if ($solePixels.Count -gt 0) { [Math]::Round(($solePixels | Measure-Object -Average).Average) } else { 0 }
    
    $results += [PSCustomObject]@{
        Name = $name
        MinX = $minX
        MaxX = $maxX
        MinY = $minY
        MaxY = $maxY # This is the exact baseline foot bottom!
        Width = $maxX - $minX + 1
        Height = $maxY - $minY + 1
        SoleCenter = $soleCenter
    }
    
    $bmp.Dispose()
    $img.Dispose()
}

$results | Format-Table -AutoSize
