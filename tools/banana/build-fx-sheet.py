#!/usr/bin/env python3
"""Banana Basket FX sheet: the studio FX atlas grid (8 x 4 cells of 128 px,
indices = gamekit core/particles FX_SPRITE) filled with gated Alex-style art
from tps-mg/art (banana particle sheet, plop burst, shared fx_*), so every
particle in Banana is an outlined sprite in Alex's line weight (design D-3).
Only rings and speed lines are drawn here (white with the 3 px charcoal ink).

  python3 tools/banana/build-fx-sheet.py
"""
import os
from PIL import Image, ImageDraw

ART = '/Users/dustinsparage/apps/tps-mg/art'
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'src/assets/games/banana-basket/v2/fx_sheet.png')
CELL, COLS, PAD = 128, 8, 8
INK = (35, 38, 58, 255)

def art(p):
    return Image.open(os.path.join(ART, p)).convert('RGBA')

def fit(im, scale_x=1.0):
    bb = im.getbbox()
    if bb: im = im.crop(bb)
    m = CELL - PAD * 2
    k = min(m / im.width, m / im.height)
    w, h = max(1, int(im.width * k * scale_x)), max(1, int(im.height * k))
    return im.resize((w, h), Image.LANCZOS)

sheet = Image.new('RGBA', (CELL * COLS, CELL * 4), (0, 0, 0, 0))

def put(i, im, scale_x=1.0):
    im = fit(im, scale_x)
    x0, y0 = (i % COLS) * CELL, (i // COLS) * CELL
    sheet.alpha_composite(im, (x0 + (CELL - im.width) // 2, y0 + (CELL - im.height) // 2))

def ring():
    im = Image.new('RGBA', (CELL * 4, CELL * 4), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    c, r = CELL * 2, CELL * 2 - 40
    d.ellipse([c - r - 12, c - r - 12, c + r + 12, c + r + 12], outline=INK, width=48)
    d.ellipse([c - r, c - r, c + r, c + r], outline=(255, 255, 255, 255), width=24)
    return im.resize((CELL, CELL), Image.LANCZOS)

def streak():
    im = Image.new('RGBA', (CELL * 4, CELL * 4), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    c = CELL * 2
    pts = [(40, c), (CELL * 4 - 30, c - 60), (CELL * 4 - 30, c + 60)]
    d.polygon(pts, fill=INK)
    inner = [(70, c), (CELL * 4 - 60, c - 34), (CELL * 4 - 60, c + 34)]
    d.polygon(inner, fill=(255, 255, 255, 255))
    return im.resize((CELL, CELL), Image.LANCZOS)

P = lambda n: art(f'banana/bb_particle_0{n}.png')
coin = Image.open(os.path.join(ROOT, 'src/assets/games/banana-basket/v2/coin.png')).convert('RGBA')
cells = {
    0: P(4), 1: art('shared/fx_small_puff.png'), 2: ring(), 3: streak(), 4: P(2),
    5: art('shared/fx_small_sparkle.png'), 6: art('banana/bb_plop_f1.png'), 7: art('shared/fx_small_dizzy_star.png'),
    8: art('banana/bb_plop_f2.png'), 9: coin, 10: art('shared/fx_small_bubble.png'), 11: P(3), 12: P(3),
    13: art('shared/fx_small_puff.png'), 14: P(0), 15: art('banana/heart_life.png'),
    16: art('shared/fx_confetti_rect.png'), 17: art('shared/fx_confetti_triangle.png'),
    18: art('shared/fx_confetti_circle.png'), 19: art('shared/fx_confetti_squiggle.png'),
    20: art('shared/fx_confetti_ribbon.png'), 21: art('shared/fx_confetti_star.png'), 22: P(6), 23: P(7),
    28: art('shared/fx_small_sparkle.png'), 29: art('banana/bb_plop_f2.png'), 30: streak(), 31: P(5),
}
for i, im in cells.items():
    put(i, im)
for k, sx in enumerate([1, 0.7, 0.36, 0.12]):
    put(24 + k, coin, sx)
sheet.save(OUT)
print('wrote', OUT)
