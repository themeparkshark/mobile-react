#!/usr/bin/env python3
"""Post-process + quality-gate sheets for prep-item art (PIPELINE.md steps).

  process.py gate <slug|set> [...]   -> review/gate-<name>.png (variants at 128/40 on cream and blue beside Alex refs)
  process.py clean <raw.png> <out.png>

clean(): alpha>=250 -> 255, drop faint halo (<12), trim with ~4% pad, centre on a
square canvas so every item in a set shares one frame, long side 384px.
"""
import os, sys, glob
from PIL import Image, ImageDraw
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import subjects as S
OUT = os.environ.get('ITEM_ART_OUT', os.path.expanduser('~/apps/tps-prime-time-audit/next-wave/item-art-v2'))
CREAM, BLUE = (255, 248, 228, 255), (7, 104, 185, 255)
REFS = ['alex_gift.png', 'alex_compass.png', 'alex_foam_finger.png', 'alex_shark_classic.png']


def clean(src, size=384, pad=0.04):
    im = Image.open(src).convert('RGBA')
    a = im.getchannel('A').point(lambda v: 255 if v >= 250 else (0 if v < 12 else v))
    im.putalpha(a)
    bb = a.getbbox()
    if not bb:
        raise ValueError(f'empty image {src}')
    im = im.crop(bb)
    w, h = im.size
    side = int(max(w, h) * (1 + 2 * pad))
    canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    canvas.alpha_composite(im, ((side - w) // 2, (side - h) // 2))
    return canvas.resize((size, size), Image.LANCZOS)


def fit(im, px):
    im = im.copy(); im.thumbnail((px, px), Image.LANCZOS); return im


def tile(imgs, labels=None):
    """Each column: image at 128 on cream, 128 on blue, 40 on cream, 40 on blue."""
    col = 140
    H = 128 + 128 + 52 + 20 + 30
    sheet = Image.new('RGBA', (col * len(imgs), H), (235, 235, 235, 255))
    d = ImageDraw.Draw(sheet)
    for i, im in enumerate(imgs):
        x = i * col
        sheet.paste(CREAM, (x, 0, x + col, 134)); sheet.paste(BLUE, (x, 134, x + col, 268))
        sheet.paste(CREAM, (x, 268, x + col // 2, 320)); sheet.paste(BLUE, (x + col // 2, 268, x + col, 320))
        a = fit(im, 128); sheet.alpha_composite(a, (x + (col - a.width) // 2, 3 + (128 - a.height) // 2))
        sheet.alpha_composite(a, (x + (col - a.width) // 2, 137 + (128 - a.height) // 2))
        b = fit(im, 40)
        sheet.alpha_composite(b, (x + (col // 2 - b.width) // 2, 274))
        sheet.alpha_composite(b, (x + col // 2 + (col // 2 - b.width) // 2, 274))
        if labels:
            d.text((x + 4, 324), labels[i][:22], fill=(0, 0, 0, 255))
    return sheet


def ref_imgs():
    return [Image.open(os.path.join(HERE, 'refs', r)).convert('RGBA') for r in REFS]


def gate(slugs, name, tag=''):
    rows = []
    for slug in slugs:
        n = slug if not tag else f'{slug}-{tag}'
        vs = sorted(glob.glob(f'{OUT}/gen/{n}/{n}-[0-9].png'))
        if not vs:
            continue
        ims = [clean(v) for v in vs]
        rows.append(tile(ref_imgs() + ims, ['alex gift', 'alex compass', 'alex finger', 'alex shark'] + [os.path.basename(v)[:-4] for v in vs]))
    if not rows:
        return None
    W = max(r.width for r in rows); H = sum(r.height + 6 for r in rows)
    sheet = Image.new('RGBA', (W, H), (90, 90, 90, 255)); y = 0
    for r in rows:
        sheet.alpha_composite(r, (0, y)); y += r.height + 6
    os.makedirs(f'{OUT}/review', exist_ok=True)
    p = f'{OUT}/review/gate-{name}.png'; sheet.convert('RGB').save(p); return p


def compact(slugs, name, tag='', cols=8):
    """Dense review: per item both variants at 128 on cream, label underneath."""
    cell = 132
    items = []
    for slug in slugs:
        n = slug if not tag else f'{slug}-{tag}'
        for v in sorted(glob.glob(f'{OUT}/gen/{n}/{n}-[0-9].png')):
            items.append((os.path.basename(v)[:-4], clean(v)))
    if not items:
        return None
    rows = (len(items) + cols - 1) // cols
    sheet = Image.new('RGBA', (cols * cell, rows * (cell + 14)), CREAM); d = ImageDraw.Draw(sheet)
    for i, (lab, im) in enumerate(items):
        r, c = divmod(i, cols); x, y = c * cell, r * (cell + 14)
        a = fit(im, 124); sheet.alpha_composite(a, (x + (cell - a.width) // 2, y + 2))
        d.text((x + 3, y + cell), lab, fill=(0, 0, 0, 255))
    os.makedirs(f'{OUT}/review', exist_ok=True)
    p = f'{OUT}/review/{name}.png'; sheet.convert('RGB').save(p); return p


if __name__ == '__main__':
    cmd = sys.argv[1]
    if cmd == 'gate':
        for arg in sys.argv[2:]:
            if arg in S.SETS:
                slugs = [it[0] for it in S.SETS[arg]]
                for i in range(0, len(slugs), 8):
                    print(gate(slugs[i:i + 8], f'{arg}-{i // 8 + 1}'))
            else:
                print(gate([arg], arg))
    elif cmd == 'compact':
        setkey = sys.argv[2]; tag = sys.argv[3] if len(sys.argv) > 3 else ''
        slugs = [it[0] for it in S.SETS[setkey]]
        for i in range(0, len(slugs), 20):
            print(compact(slugs[i:i + 20], f'compact-{setkey}-{i // 20 + 1}', tag))
    elif cmd == 'clean':
        clean(sys.argv[2]).save(sys.argv[3])
