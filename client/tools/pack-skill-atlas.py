"""Package generated 4x3 RGBA sprites into padded runtime cells.
Only nearest-neighbour scale and anchor translation; no generated/painted poses.
Usage: python pack-skill-atlas.py source.png destination.png [--single-blade]
"""
import sys
from pathlib import Path
from PIL import Image, ImageFilter

source = Image.open(sys.argv[1]).convert('RGBA')
assert source.width % 4 == 0 and source.height % 3 == 0
side = source.width // 4
assert source.height // 3 == side
cell_size = 416
out = Image.new('RGBA', (cell_size * 4, cell_size * 3))
mask = source.getchannel('A').point(lambda a: 255 if a > 180 else 0).filter(ImageFilter.MaxFilter(3))
# Components locate intact sprite rectangles even if a blade crosses an approximate
# source grid line. Crop the original RGBA rectangle; never paint/erase source pixels.
data = bytearray(mask.tobytes())
w, h = source.size
components = []
for start in range(len(data)):
    if not data[start]:
        continue
    queue = [start]
    data[start] = 0
    left = right = start % w
    top = bottom = start // w
    count = 0
    while queue:
        p = queue.pop()
        px, py = p % w, p // w
        left, right = min(left, px), max(right, px)
        top, bottom = min(top, py), max(bottom, py)
        count += 1
        for q in (p - w if py else -1, p + w if py + 1 < h else -1,
                  p - 1 if px else -1, p + 1 if px + 1 < w else -1):
            if q >= 0 and data[q]:
                data[q] = 0
                queue.append(q)
    if count > 1000:
        components.append((count, (left, top, right + 1, bottom + 1)))
assert len(components) >= 12, [(n, b) for n, b in components]
boxes = [b for n, b in sorted(components, reverse=True)[:12]]
boxes.sort(key=lambda b: (b[1] + b[3]) / 2)
rectangles = []
for row in range(3):
    rectangles.extend(sorted(boxes[row * 4:row * 4 + 4], key=lambda b: b[0]))

for i, box in enumerate(rectangles):
    cell = source.crop(box)
    cell = cell.resize((round(cell.width * 224 / side), round(cell.height * 224 / side)), Image.Resampling.NEAREST)
    alpha = cell.getchannel('A')
    # First-pass lower-silhouette anchor; manual boot refinement remains possible.
    pixels = [(x, y) for y in range(cell.height * 2 // 3, cell.height) for x in range(cell.width) if alpha.getpixel((x, y)) > 200]
    assert pixels, f'No boot anchor for frame {i}'
    bottom = max(y for x, y in pixels)
    sole = [x for x, y in pixels if y >= bottom - 12]
    center = (min(sole) + max(sole)) / 2
    ox, oy = round(208 - center), 352 - bottom
    assert 0 <= ox and ox + cell.width <= cell_size and 0 <= oy and oy + cell.height <= cell_size, (i, ox, oy)
    out.paste(cell, (i % 4 * cell_size + ox, i // 4 * cell_size + oy))
    print(f'  slot {i}: source {box}, boot ({center},{bottom})')
if '--single-blade' not in sys.argv[3:]:
    guard_file = Path(__file__).resolve().parents[1] / 'assets/resources/warrior-cross-v1.png'
    guard = out.crop((0, 0, 416, 416)) if 'warrior-cross-' in sys.argv[2] else Image.open(guard_file).crop((0, 0, 416, 416))
    for i in (0, 11):
        out.paste(guard, (i % 4 * 416, i // 4 * 416))
out.save(sys.argv[2])
print(f'Packed {sys.argv[2]}: {out.width}x{out.height}, 12 slots, anchor (208,352)')
