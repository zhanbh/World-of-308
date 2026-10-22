Add-Type -AssemblyName System.Drawing

$srcDir = "d:\IdeaProjects\World-of-308\docs\art\characters\hunter\animation-v4\extracted_cells"
$outDir = "d:\IdeaProjects\World-of-308\docs\art\characters\hunter\animation-v7\clean_cells"
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir -Force }

# Copy cells 0-5 as they already have the strap on the left leg
for ($i = 0; $i -le 3; $i++) {
    Copy-Item "$srcDir\near_cell_$i.png" "$outDir\clean_cell_$i.png" -Force
}
Copy-Item "$srcDir\far_cell_0.png" "$outDir\clean_cell_4.png" -Force
Copy-Item "$srcDir\far_cell_1.png" "$outDir\clean_cell_5.png" -Force

Write-Host "Copied base frames 0-5. Now patching frames 6 and 7..."
