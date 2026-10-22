Add-Type -AssemblyName System.Drawing

$src = "d:\IdeaProjects\World-of-308\docs\art\characters\hunter\animation-v4\extracted_cells\far_cell_2.png"
$bytes = [System.IO.File]::ReadAllBytes($src)
$ms = New-Object System.IO.MemoryStream(,$bytes)
$img = [System.Drawing.Image]::FromStream($ms)
$bmp = New-Object System.Drawing.Bitmap $img

for ($y = 323; $y -le 355; $y += 2) {
    # Find min and max X where pixel is part of the thigh
    # The thigh is between the skirt on the left and contour on right
    $xs = @()
    for ($x = 360; $x -le 435; $x++) {
        $c = $bmp.GetPixel($x, $y)
        # Check if part of the thigh (A > 200)
        if ($c.A -gt 200) {
            $xs += $x
        }
    }
    if ($xs.Count -gt 0) {
        $min = ($xs | Measure-Object -Minimum).Minimum
        $max = ($xs | Measure-Object -Maximum).Maximum
        Write-Host ("Y={0}: X in [{1}, {2}], width={3}" -f $y, $min, $max, ($max - $min + 1))
    }
}

$bmp.Dispose()
$img.Dispose()
$ms.Dispose()
