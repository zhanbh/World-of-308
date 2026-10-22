$gaitPath = "d:\IdeaProjects\World-of-308\client\assets\resources\warrior-gait-v2.png"
$backup = "d:\IdeaProjects\World-of-308\client\assets\resources\warrior-gait-v2.png.bak"
if (-not (Test-Path $backup)) { Copy-Item $gaitPath $backup }

$testAtlas = "d:\IdeaProjects\World-of-308\client\tools\warrior_gait_inspect\test-warrior-gait.png"
Copy-Item -Force $testAtlas $gaitPath
Write-Host "Updated warrior-gait-v2.png with distinct 8-frame symmetrical cycle!"
