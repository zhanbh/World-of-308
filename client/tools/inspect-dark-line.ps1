Add-Type -AssemblyName System.Drawing

$src = "d:\IdeaProjects\World-of-308\docs\art\characters\hunter\animation-v4\extracted_cells\far_cell_2.png"
$bytes = [System.IO.File]::ReadAllBytes($src)
$ms = New-Object System.IO.MemoryStream(,$bytes)
$img = [System.Drawing.Image]::FromStream($ms)
$bmp = New-Object System.Drawing.Bitmap $img

for ($y = 315; $y -le 325; $y++) {
    $line = ""
    for ($x = 405; $x -le 425; $x++) {
        $c = $bmp.GetPixel($x, $y)
        $line += ("{0,3} " -f $c.R)
    }
    Write-Host ("Y={0}: {1}" -f $y, $line)
}

$bmp.Dispose()
$img.Dispose()
$ms.Dispose()
