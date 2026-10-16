"""Pack generated 8x3 artwork into padded cells; preserve RGBA pixels.
Only translates each sprite to a shared boot baseline. No painting or synthesis.
Usage: python3 pack-attack-atlas.py source.png destination.png (requires Pillow).
"""
import sys
from PIL import Image

source = Image.open(sys.argv[1]).convert('RGBA')
assert source.size == (2048, 768), source.size
out = Image.new('RGBA', (2560, 960))
for index in range(24):
    x, y = index % 8 * 256, index // 8 * 256
    cell = source.crop((x, y, x + 256, y + 256))
    alpha = cell.getchannel('A')
    # The lowest opaque pixels belong to the boots (not the sword trails).
    bottom = max(py for py in range(220, 256) for px in range(35, 230) if alpha.getpixel((px, py)) > 180)
    sole = [px for py in range(bottom - 12, bottom + 1) for px in range(35, 230) if alpha.getpixel((px, py)) > 180]
    center = (min(sole) + max(sole)) / 2
    offset_x, offset_y = round(160 - center), 290 - bottom
    assert offset_x >= 0 and offset_x + 256 <= 320, (index, offset_x)
    assert offset_y >= 0 and offset_y + 256 <= 320, (index, offset_y)
    out.paste(cell, (index % 8 * 320 + offset_x, index // 8 * 320 + offset_y))
# Shared transition poses eliminate one-frame discontinuities between beats.
# Select source rising pose A8, overhead B8, guard A1 as the shared endpoints.
for source_index, target_index in [(7, 8), (15, 16), (0, 23)]:
    x, y = source_index % 8 * 320, source_index // 8 * 320
    out.paste(out.crop((x, y, x + 320, y + 320)), (target_index % 8 * 320, target_index // 8 * 320))
out.save(sys.argv[2])
print(f'Packed {out.width}x{out.height}; 24 cells, boot anchor (160,290)')
