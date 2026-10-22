Add-Type -AssemblyName System.Drawing

$cells = @("near_cell_0", "near_cell_1", "near_cell_2", "near_cell_3", "far_cell_0", "far_cell_1", "far_cell_2", "far_cell_3")

foreach ($name in $cells) {
    $path = "d:\IdeaProjects\World-of-308\docs\art\characters\hunter\animation-v4\extracted_cells\$name.png"
    $img = [System.Drawing.Image]::FromFile($path)
    $bmp = New-Object System.Drawing.Bitmap $img
    
    $jade = @()
    for ($y = 300; $y -lt 480; $y++) {
        for ($x = 200; $x -lt 450; $x++) {
            $c = $bmp.GetPixel($x, $y)
            # Emerald green jade: G > 110, G > R * 1.3, G > B * 1.1
            if ($c.G -gt 100 -and $c.G -gt ($c.R * 1.25) -and $c.G -gt ($c.B * 0.9) -and $c.R -lt 100 -and $c.A -gt 200) {
                $jade += [PSCustomObject]@{ X = $x; Y = $y; Color = $c }
            }
        }
    }
    
    if ($jade.Count -gt 0) {
        $avgX = [Math]::Round(($jade | Measure-Object -Property X -Average).Average)
        $avgY = [Math]::Round(($jade | Measure-Object -Property Y -Average).Average)
        Write-Host "$name : Jade charm at ($avgX, $avgY), count: $($jade.Count)"
    } else {
        Write-Host "$name : No jade charm found!"
    }
    
    $bmp.Dispose()
    $img.Dispose()
}
