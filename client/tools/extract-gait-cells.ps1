Add-Type -AssemblyName System.Drawing

$atlasPath = "d:\IdeaProjects\World-of-308\client\assets\resources\warrior-gait-v2.png"
$outDir = "d:\IdeaProjects\World-of-308\client\tools\gait_cells"
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir -Force }

$bytes = [System.IO.File]::ReadAllBytes($atlasPath)
$ms = New-Object System.IO.MemoryStream(,$bytes)
$bmp = New-Object System.Drawing.Bitmap $ms

for ($i = 0; $i -lt 8; $i++) {
    $c = [int]($i % 4)
    $r = [int][Math]::Floor($i / 4)
    $x = $c * 416
    $y = $r * 416
    $rect = New-Object System.Drawing.Rectangle($x, $y, 416, 416)
    $cell = $bmp.Clone($rect, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $cell.Save("$outDir\gait_$i.png", [System.Drawing.Imaging.ImageFormat]::Png)
    $cell.Dispose()
}

$bmp.Dispose()
$ms.Dispose()
Write-Host "Extracted 8 gait cells to $outDir successfully"
