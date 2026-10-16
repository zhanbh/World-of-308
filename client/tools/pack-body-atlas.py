"""Deterministic 3x3 body atlas packaging: nearest scale + foot-anchor translation.
No pixel painting, recoloring or source cleanup. Requires existing Pillow.
Usage: python pack-body-atlas.py source.png output.png
"""
import json
import statistics
import sys
from pathlib import Path
from PIL import Image
source=Image.open(sys.argv[1]).convert('RGBA')
cells=[]
for index in range(9):
    col,row=index%3,index//3
    rect=(round(col*source.width/3),round(row*source.height/3),round((col+1)*source.width/3),round((row+1)*source.height/3))
    if index == 8: rect=(rect[0]-16,rect[1],rect[2],rect[3]) # Preserve blade crossing source grid by a few pixels.
    cell=source.crop(rect)
    box=cell.getchannel('A').point(lambda a:255 if a>180 else 0).getbbox()
    if not box:raise ValueError(f'Empty frame {index}')
    cells.append((cell,box))
scale=194/statistics.median(box[3]-box[1] for _,box in cells[:4])
out=Image.new('RGBA',(1248,1248))
report=[]
for index,(cell,box) in enumerate(cells):
    # Retain the complete cell, including antialiasing; only compute anchor from alpha.
    scaled=cell.resize((round(cell.width*scale),round(cell.height*scale)),Image.Resampling.NEAREST)
    alpha=scaled.getchannel('A');mask=alpha.point(lambda a:255 if a>180 else 0)
    b=mask.getbbox();bottom=b[3]-1
    foot_x=[x for y in range(max(b[1],bottom-7),bottom+1) for x in range(b[0],b[2]) if mask.getpixel((x,y))]
    anchor=round((min(foot_x)+max(foot_x))/2)
    # Stable original cell center, not whichever running boot currently touches ground.
    source_pivot=cell.width/2 + (8 if index==8 else 0)
    dx,dy=208-round(source_pivot*scale),352-bottom
    assert dx>=0 and dy>=0 and dx+scaled.width<=416 and dy+scaled.height<=416,(index,dx,dy,scaled.size)
    out.paste(scaled,(index%3*416+dx,index//3*416+dy))
    report.append({'frame':index,'source_bounds':list(box),'scale':scale,'offset':[dx,dy]})
out.save(sys.argv[2])
print(json.dumps({'size':out.size,'frames':report},indent=2))
