Add-Type -AssemblyName System.Drawing

function Find-Isolated-Pixels($file) {
    Write-Host "=== Finding isolated components in $file ==="
    $bmp = [System.Drawing.Bitmap]::FromFile($file)
    $w = $bmp.Width
    $h = $bmp.Height
    $visited = New-Object 'bool[,]' $w, $h
    
    $components = @()
    for ($y = 0; $y -lt $h; $y++) {
        for ($x = 0; $x -lt $w; $x++) {
            if (-not $visited[$x, $y] -and $bmp.GetPixel($x, $y).A -gt 20) {
                # BFS
                $queue = New-Object System.Collections.Generic.Queue[System.Drawing.Point]
                $queue.Enqueue((New-Object System.Drawing.Point $x, $y))
                $visited[$x, $y] = $true
                $count = 0
                $minX = $x; $maxX = $x; $minY = $y; $maxY = $y
                
                while ($queue.Count -gt 0) {
                    $pt = $queue.Dequeue()
                    $count++
                    if ($pt.X -lt $minX) { $minX = $pt.X }
                    if ($pt.X -gt $maxX) { $maxX = $pt.X }
                    if ($pt.Y -lt $minY) { $minY = $pt.Y }
                    if ($pt.Y -gt $maxY) { $maxY = $pt.Y }
                    
                    foreach ($d in @((-1,0), (1,0), (0,-1), (0,1), (-1,-1), (1,-1), (-1,1), (1,1))) {
                        $nx = $pt.X + $d[0]
                        $ny = $pt.Y + $d[1]
                        if ($nx -ge 0 -and $nx -lt $w -and $ny -ge 0 -and $ny -lt $h) {
                            if (-not $visited[$nx, $ny] -and $bmp.GetPixel($nx, $ny).A -gt 20) {
                                $visited[$nx, $ny] = $true
                                $queue.Enqueue((New-Object System.Drawing.Point $nx, $ny))
                            }
                        }
                    }
                }
                
                if ($count -lt 500) {
                    $col = [int][Math]::Floor($minX / 416)
                    $row = [int][Math]::Floor($minY / 416)
                    Write-Host ("  Small component: pixels={0,4}, X=[{1,4}, {2,4}], Y=[{3,4}, {4,4}] (col={5}, row={6})" -f $count, $minX, $maxX, $minY, $maxY, $col, $row)
                }
            }
        }
    }
    $bmp.Dispose()
}

Find-Isolated-Pixels "d:\IdeaProjects\World-of-308\client\assets\resources\warrior-badao-v2.png"
Find-Isolated-Pixels "d:\IdeaProjects\World-of-308\client\assets\resources\warrior-body-v1.png"
