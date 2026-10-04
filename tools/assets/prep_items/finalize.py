#!/usr/bin/env python3
"""Write picked variants into the app as drop-in replacements + build contact sheets.

picks.json: {"churro_01": "gen/churro_01/churro_01-2.png", ...} (paths relative to $ITEM_ART_OUT)
  finalize.py write     -> assets/images/prep-items/<set>/<slug>.png (384px square, pngquant)
  finalize.py sheets    -> contact-<set>.png (old | new per item) + CONTACT_SHEET.png
"""
import json, os, subprocess, sys
from PIL import Image, ImageDraw
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import subjects as S
from process import clean
OUT = os.environ.get('ITEM_ART_OUT', os.path.expanduser('~/apps/tps-prime-time-audit/next-wave/item-art-v2'))
REPO = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
ASSETS = os.path.join(REPO, 'assets', 'images', 'prep-items')
OLD = os.path.join(OUT, 'old-art')  # snapshot of the pre-v2 PNGs for the contact sheet
RCOL = {'common': (154, 164, 178), 'uncommon': (59, 196, 106), 'rare': (47, 139, 255), 'epic': (165, 75, 255), 'legendary': (255, 184, 0)}


def picks():
    return json.load(open(os.path.join(OUT, 'picks.json')))


def write():
    P = picks()
    n = 0
    for setkey, items in S.SETS.items():
        for slug, *_ in items:
            if slug not in P:
                continue
            dst = os.path.join(ASSETS, setkey, f'{slug}.png')
            clean(os.path.join(OUT, P[slug]), 384).save(dst)
            subprocess.run(['pngquant', '--force', '--skip-if-larger', '--quality', '75-95', '--ext', '.png', dst], check=False)
            n += 1
    print('wrote', n)


def sheets():
    P = picks()
    cell, lab = 112, 26
    allrows = []
    for setkey, items in S.SETS.items():
        cols = 10
        rows = 4
        sheet = Image.new('RGB', (cols * cell * 2 + 8, 34 + rows * (cell + lab)), (255, 248, 228))
        d = ImageDraw.Draw(sheet)
        d.text((8, 10), f'{S.SET_NAMES[setkey]}: old (left) vs new (right), ring = rarity', fill=(9, 38, 143))
        for i, (slug, name, rarity, _) in enumerate(items):
            r, c = divmod(i, cols)
            x, y = 4 + c * cell * 2, 34 + r * (cell + lab)
            d.rectangle([x + 1, y + 1, x + cell * 2 - 2, y + cell + lab - 2], outline=RCOL[rarity], width=3)
            old = Image.open(os.path.join(OLD, setkey, f'{slug}.png')).convert('RGBA'); old.thumbnail((cell - 16, cell - 16))
            sheet.paste(old, (x + (cell - old.width) // 2, y + (cell - old.height) // 2), old)
            if slug in P:
                new = clean(os.path.join(OUT, P[slug]), 384); new.thumbnail((cell - 10, cell - 10))
                sheet.paste(new, (x + cell + (cell - new.width) // 2, y + (cell - new.height) // 2), new)
            d.text((x + 6, y + cell), name[:30], fill=(30, 30, 30))
        p = os.path.join(OUT, f'contact-{setkey}.png'); sheet.save(p); allrows.append(sheet); print(p)
    W = max(s.width for s in allrows); H = sum(s.height for s in allrows)
    big = Image.new('RGB', (W, H), (255, 248, 228)); y = 0
    for s in allrows:
        big.paste(s, (0, y)); y += s.height
    big.save(os.path.join(OUT, 'CONTACT_SHEET.png')); print(os.path.join(OUT, 'CONTACT_SHEET.png'))


if __name__ == '__main__':
    {'write': write, 'sheets': sheets}[sys.argv[1]]()
