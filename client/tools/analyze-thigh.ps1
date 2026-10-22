Add-Type -AssemblyName System.Drawing

$src = "d:\IdeaProjects\World-of-308\docs\art\characters\hunter\animation-v4\extracted_cells\far_cell_2.png"
$img = [System.Drawing.Image]::FromFile($src)
$bmp = New-Object System.Drawing.Bitmap $img

# Look for the gold buckle and jade tassel coordinates
$bucklePixels = @()
$jadePixels = @()

for ($y = 280; $y -le 380; $y++) {
    for ($x = 350; $x -le 450; $x++) {
        $c = $bmp.GetPixel($x, $y)
        # Gold buckle: high R, G, low B (yellow/gold)
        if ($c.R -gt 160 -and $c.G -gt 120 -and $c.B -lt 80) {
            $bucklePixels += @{ X = $x; Y = $y; R = $c.R; G = $c.G; B = $c.B }
        }
        # Jade tassel: green
        if ($c.G -gt 80 -and $c.G -gt ($c.R * 1.2) -and $c.B -lt 100) {
            $jadePixels += @{ X = $x; Y = $y; R = $c.R; G = $c.G; B = $c.B }
        }
    }
}

if ($bucklePixels.Count -gt 0) {
    $minX = ($bucklePixels | Measure-Object -Property X -Minimum).Minimum
    $maxX = ($bucklePixels | Measure-Object -Property X -Maximum).Maximum
    $minY = ($bucklePixels | Measure-Object -Property Y -Minimum).Minimum
    $maxY = ($bucklePixels | Measure-Object -Property Y -Maximum).Maximum
    Write-Host "Buckle bounding box: X=[$minX, $maxX], Y=[$minY, $maxY], Count=$($bucklePixels.Count)"
} else {
    Write-Host "No buckle pixels found"
}

if ($jadePixels.Count -gt 0) {
    $minX = ($jadePixels | Measure-Object -Property X -Minimum).Minimum
    $maxX = ($jadePixels | Measure-Object -Property X -Maximum).Maximum
    $minY = ($jadePixels | Measure-Object -Property Y -Minimum).Minimum
    $maxY = ($jadePixels | Measure-Object -Property Y -Maximum).Maximum
    Write-Host "Jade bounding box: X=[$minX, $maxX], Y=[$minY, $maxY], Count=$($jadePixels.Count)"
} else {
    Write-Host "No jade pixels found"
}

$bmp.Dispose()
$img.Dispose()
