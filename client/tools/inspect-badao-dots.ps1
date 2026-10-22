Add-Type -AssemblyName System.Drawing

$file = "d:\IdeaProjects\World-of-308\client\assets\resources\warrior-badao-v2.png"
$bmp = [System.Drawing.Bitmap]::FromFile($file)

function Inspect-Point($x, $y) {
    Write-Host "--- Inspecting area around ($x, $y) ---"
    for ($dy = -5; $dy -le 5; $dy++) {
        $line = ""
        for ($dx = -5; $dx -le 5; $dx++) {
            $px = $x + $dx
            $py = $y + $dy
            $p = $bmp.GetPixel($px, $py)
            if ($p.A -gt 20) {
                $line += ("[{0,3},{1,3},{2,3}] " -f $p.R, $p.G, $p.B)
            } else {
                $line += "    .     "
            }
        }
        Write-Host $line
    }
}

Inspect-Point 827 243
Inspect-Point 848 222

$bmp.Dispose()
