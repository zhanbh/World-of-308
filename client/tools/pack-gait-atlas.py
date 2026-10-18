"""Uniformly pack 4x2 generated locomotion poses; never paint or warp limbs.
Keeps one pivot/scale/baseline for all poses so airborne feet are not pinned down.
Requires Pillow. Usage: python3 pack-gait-atlas.py source.png output.png
"""
import json
import statistics
import sys
from PIL import Image

source = Image.open(sys.argv[1]).convert('RGBA')
assert source.width == source.height * 2, source.size
width, height = source.width / 4, source.height / 2
cells = [source.crop(tuple(round(v) for v in (i % 4 * width, i // 4 * height, (i % 4 + 1) * width, (i // 4 + 1) * height))) for i in range(8)]
bounds = [cell.getchannel('A').point(lambda a: 255 if a > 180 else 0).getbbox() for cell in cells]
assert all(bounds), 'Empty gait pose'
scale = 194 / statistics.median(b[3] - b[1] for b in bounds)
# The two opposing contact poses define the common floor, not each lifted foot.
baselines = [bounds[0][3] - 1, bounds[4][3] - 1]
out = Image.new('RGBA', (1664, 832))
# Source pose 4 reverted to the old leading leg; use the verified far-contact
# pose for slots 4/5 instead. Seven distinct poses, eight timing slots.
cells[3] = cells[4]
for i, cell in enumerate(cells):
    baseline = baselines[1 if i == 3 else i // 4]
    offset = (round(208 - width / 2 * scale), round(352 - baseline * scale))
    scaled = cell.resize((round(cell.width * scale), round(cell.height * scale)), Image.Resampling.NEAREST)
    box = scaled.getchannel('A').point(lambda a: 255 if a > 180 else 0).getbbox()
    assert box and min(offset[0]+box[0], offset[1]+box[1]) >= 0
    assert offset[0]+box[2] <= 416 and offset[1]+box[3] <= 416, (i,box,offset)
    out.paste(scaled, (i % 4 * 416 + offset[0], i // 4 * 416 + offset[1]))
out.save(sys.argv[2])
print(json.dumps(dict(size=out.size, source_size=source.size, scale=scale, baselines=baselines, source_bounds=bounds), indent=2))
