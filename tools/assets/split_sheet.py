"""Split a transparent sprite sheet (rows x cols grid) into trimmed PNGs.
usage: split_sheet.py sheet.png rows cols outdir name1,name2,... [maxpx]"""
import sys, os
from PIL import Image
src, rows, cols, out, names = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), sys.argv[4], sys.argv[5].split(',')
maxpx = int(sys.argv[6]) if len(sys.argv) > 6 else 300
im = Image.open(src).convert('RGBA')
W, H = im.size
os.makedirs(out, exist_ok=True)
for i, name in enumerate(names):
    if not name:
        continue
    r, c = divmod(i, cols)
    cell = im.crop((c * W // cols, r * H // rows, (c + 1) * W // cols, (r + 1) * H // rows))
    # drop faint halo pixels, then trim to content
    a = cell.getchannel('A').point(lambda v: 0 if v < 12 else v)
    cell.putalpha(a)
    bb = a.getbbox()
    if not bb:
        print('empty', name); continue
    sp = cell.crop(bb)
    sp.thumbnail((maxpx, maxpx), Image.LANCZOS)
    sp.save(os.path.join(out, f'{name}@3x.png'))
    print(name, sp.size)
