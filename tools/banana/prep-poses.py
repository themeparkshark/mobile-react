#!/usr/bin/env python3
"""Normalize the gated shark hold poses onto one shared 480 x 600 canvas so
pose swaps never jump: each pose is cropped to its alpha bbox, scaled to the
master's opaque area (same character scale), centred on the body
column (the widest opaque rows' centre, ignoring motion lines) and bottom
aligned on the tail. Output: src/assets/games/banana-basket/v2/pose_*.png.
No pixels are repainted (only crop, scale and place)."""
import os
from PIL import Image
ART = '/Users/dustinsparage/apps/tps-mg/art/banana'
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'src/assets/games/banana-basket/v2')
W, H, BODY = 640, 600, 560
# Rev 8 (Rig B, 7.1): the master plus whole-sprite key holds; bb_hold_lean and the
# original flinch are retired (lean is a runtime rotation about the tail base).
poses = {'idle': ('shark_basket_hold.png', 1.0), 'hop': ('bb_hold_hop.png', 0.86),
         'chomp': ('bb_hold_chomp.png', 1.0), 'flinch': ('bb_hold_flinch_v2.png', 1.0),
         'cheer': ('bb_hold_cheer.png', 1.0)}
ref_area = 0
for name, (src, hk) in poses.items():
    im = Image.open(os.path.join(ART, src)).convert('RGBA')
    a = im.split()[3].point(lambda v: 255 if v > 40 else 0)
    im = im.crop(a.getbbox()); a = a.crop(a.getbbox())
    # Same character scale in every pose: match the master's opaque area.
    area = sum(1 for v in a.getdata() if v)
    if name == 'idle':
        ref_area = area * (BODY / im.height) ** 2
        k = BODY / im.height
    else:
        k = (ref_area / area) ** 0.5
    im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
    a = a.resize(im.size)
    # body column: mean x of opaque pixels in the middle band (40-80% height)
    px = a.load(); xs = []; 
    for y in range(int(im.height * 0.4), int(im.height * 0.8), 4):
        row = [x for x in range(0, im.width, 2) if px[x, y]]
        if row: xs.append((row[0] + row[-1]) / 2)
    cx = sum(xs) / len(xs)
    canvas = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    canvas.alpha_composite(im, (round(W / 2 - cx), max(0, H - im.height - 8)))
    canvas.save(os.path.join(OUT, f'pose_{name}.png'))
    print(name, im.size, round(cx))
