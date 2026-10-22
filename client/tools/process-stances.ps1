Add-Type -AssemblyName System.Drawing

$srcPath = "C:\Users\bohan.zhan\.gemini\antigravity-ide\brain\409c9562-dfaf-402d-9c1f-4f4e01b16984\warrior_stances_comparison_v1_1792582283120.jpg"
$destFull = "d:\IdeaProjects\World-of-308\docs\art\warrior-stances-comparison-v1.png"
$destMockup = "d:\IdeaProjects\World-of-308\docs\design\ui-mockups\14-character-stances-town-vs-combat.png"

# Copy full comparison image
$fullBmp = [System.Drawing.Bitmap]::FromFile($srcPath)
$fullBmp.Save($destFull, [System.Drawing.Imaging.ImageFormat]::Png)
$fullBmp.Save($destMockup, [System.Drawing.Imaging.ImageFormat]::Png)
Write-Host "Saved full comparison: $($fullBmp.Width)x$($fullBmp.Height)"

$W = $fullBmp.Width
$H = $fullBmp.Height

# Left side is Town Stance, Right side is Combat Stance
# In 1792x1024 or similar resolution:
# Let's crop warrior character in Town Stance: X roughly 80 to 650, Y 80 to 860
# Let's crop warrior character in Combat Stance: X roughly 850 to 1650, Y 150 to 860

$cropTownRect = [System.Drawing.Rectangle]::FromLTRB(
    [int]($W * 0.08),
    [int]($H * 0.08),
    [int]($W * 0.42),
    [int]($H * 0.85)
)

$cropCombatRect = [System.Drawing.Rectangle]::FromLTRB(
    [int]($W * 0.48),
    [int]($H * 0.16),
    [int]($W * 0.94),
    [int]($H * 0.85)
)

# Crop Town
$bmpTown = new-object System.Drawing.Bitmap($cropTownRect.Width, $cropTownRect.Height)
$gTown = [System.Drawing.Graphics]::FromImage($bmpTown)
$gTown.DrawImage($fullBmp, 0, 0, $cropTownRect, [System.Drawing.GraphicsUnit]::Pixel)
$gTown.Dispose()

$townFile1 = "d:\IdeaProjects\World-of-308\docs\art\warrior-stance-town.png"
$townFile2 = "d:\IdeaProjects\World-of-308\client\assets\resources\warrior-stance-town.png"
$bmpTown.Save($townFile1, [System.Drawing.Imaging.ImageFormat]::Png)
$bmpTown.Save($townFile2, [System.Drawing.Imaging.ImageFormat]::Png)
$bmpTown.Dispose()

# Crop Combat
$bmpCombat = new-object System.Drawing.Bitmap($cropCombatRect.Width, $cropCombatRect.Height)
$gCombat = [System.Drawing.Graphics]::FromImage($bmpCombat)
$gCombat.DrawImage($fullBmp, 0, 0, $cropCombatRect, [System.Drawing.GraphicsUnit]::Pixel)
$gCombat.Dispose()

$combatFile1 = "d:\IdeaProjects\World-of-308\docs\art\warrior-stance-combat.png"
$combatFile2 = "d:\IdeaProjects\World-of-308\client\assets\resources\warrior-stance-combat.png"
$bmpCombat.Save($combatFile1, [System.Drawing.Imaging.ImageFormat]::Png)
$bmpCombat.Save($combatFile2, [System.Drawing.Imaging.ImageFormat]::Png)
$bmpCombat.Dispose()

$fullBmp.Dispose()
Write-Host "Successfully processed Town Stance and Combat Stance assets!"
