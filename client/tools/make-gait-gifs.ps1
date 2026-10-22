Add-Type -AssemblyName System.Drawing

function Make-Gait-Gif($atlasFile, $gifPath, $delayMs) {
    $bmp = [System.Drawing.Bitmap]::FromFile($atlasFile)
    $cw = 416; $ch = 416
    $frames = @()
    for ($i = 0; $i -lt 8; $i++) {
        $c = $i % 4
        $r = [int][Math]::Floor($i / 4)
        $rect = New-Object System.Drawing.Rectangle ($c * $cw), ($r * $ch), $cw, $ch
        $frame = New-Object System.Drawing.Bitmap $cw, $ch
        $g = [System.Drawing.Graphics]::FromImage($frame)
        $g.Clear([System.Drawing.Color]::FromArgb(16, 26, 34)) # background matching game
        $g.DrawImage($bmp, (New-Object System.Drawing.Rectangle(0, 0, $cw, $ch)), $rect, [System.Drawing.GraphicsUnit]::Pixel)
        $g.Dispose()
        $frames += $frame
    }
    $bmp.Dispose()

    # Encode animated GIF using System.Drawing
    # Set GIF delay header: property 0x5100
    $gifCodec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/gif' }
    $encoderParams = New-Object System.Drawing.Imaging.EncoderParameters(1)
    
    # Save first frame with MultiFrame parameter
    $encoderParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::SaveFlag, [long][System.Drawing.Imaging.EncoderValue]::MultiFrame)
    
    # Set delay property (delay in 1/100 s)
    $delayItem = [System.Runtime.Serialization.FormatterServices]::GetUninitializedObject([System.Drawing.Imaging.PropertyItem])
    $delayItem.Id = 0x5100
    $delayItem.Type = 3 # SHORT
    $delayItem.Len = 4
    $delayVal = [uint16]($delayMs / 10)
    $delayBytes = [System.BitConverter]::GetBytes($delayVal)
    $delayBytes4 = @($delayBytes[0], $delayBytes[1], 0, 0)
    $delayItem.Value = $delayBytes4
    $frames[0].SetPropertyItem($delayItem)
    
    # Set loop forever property (0x5101)
    $loopItem = [System.Runtime.Serialization.FormatterServices]::GetUninitializedObject([System.Drawing.Imaging.PropertyItem])
    $loopItem.Id = 0x5101
    $loopItem.Type = 3
    $loopItem.Len = 4
    $loopItem.Value = @(0, 0, 0, 0)
    $frames[0].SetPropertyItem($loopItem)

    $frames[0].Save($gifPath, $gifCodec, $encoderParams)

    $encoderParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::SaveFlag, [long][System.Drawing.Imaging.EncoderValue]::FrameDimensionTime)
    for ($i = 1; $i -lt 8; $i++) {
        $frames[$i].SetPropertyItem($delayItem)
        $frames[0].SaveAdd($frames[$i], $encoderParams)
    }

    $encoderParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::SaveFlag, [long][System.Drawing.Imaging.EncoderValue]::Flush)
    $frames[0].SaveAdd($encoderParams)

    for ($i = 0; $i -lt 8; $i++) { $frames[$i].Dispose() }
    Write-Host "Created animated GIF: $gifPath"
}

Make-Gait-Gif "d:\IdeaProjects\World-of-308\client\assets\resources\warrior-gait-v2.png" "d:\IdeaProjects\World-of-308\client\tools\warrior_gait_inspect\gait_old.gif" 50
Make-Gait-Gif "d:\IdeaProjects\World-of-308\client\tools\warrior_gait_inspect\test-warrior-gait.png" "d:\IdeaProjects\World-of-308\client\tools\warrior_gait_inspect\gait_test.gif" 50
