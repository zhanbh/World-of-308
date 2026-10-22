Add-Type -AssemblyName System.Drawing

$near = [System.Drawing.Image]::FromFile("d:\IdeaProjects\World-of-308\docs\art\characters\hunter\animation-v4\run-near-source.png")
$far = [System.Drawing.Image]::FromFile("d:\IdeaProjects\World-of-308\docs\art\characters\hunter\animation-v4\run-far-rebuilt.png")

Write-Host "Near image: $($near.Width) x $($near.Height)"
Write-Host "Far image: $($far.Width) x $($far.Height)"

$near.Dispose()
$far.Dispose()
