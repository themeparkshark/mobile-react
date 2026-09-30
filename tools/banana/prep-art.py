#!/usr/bin/env python3
"""Banana Basket v2 art prep (no generation, no restyling).

Copies the gate-passed studio art and Alex's originals into the app, resized
per PIPELINE.md post-processing (sprites 384 px long side, characters 576).
The only transform is the palette tint the design allows on generated
sprites: the AI-generated pufferfish's orange body hues are rotated to
teal-lime so hazards never read like bananas (design 4.3). Alex's own art is
copied untouched (resize only).

  python3 tools/banana/prep-art.py
"""
import colorsys
import os
from PIL import Image

ART = '/Users/dustinsparage/apps/tps-mg/art'
ALEX = '/Users/dustinsparage/apps/tps-prime-time-audit/references/alex'
WS0 = '/Users/dustinsparage/apps/tps-prime-time-audit/art-ws0/final'
PILOT = '/Users/dustinsparage/apps/tps-prime-time-audit/art-pilot-v2'
OUT = os.path.join(os.path.dirname(__file__), '../../src/assets/games/banana-basket/v2')

SRC = {
    'shark_hold': (f'{ART}/banana/shark_basket_hold.png', 576),
    'shark_cheer': (f'{ART}/shared/shark_cheer.png', 576),
    'shark_dizzy': (f'{ART}/shared/shark_dizzy.png', 576),
    'shark_bonked': (f'{ART}/shared/shark_bonked.png', 576),
    'shark_fist': (f'{ART}/shared/shark_fist_pump.png', 576),
    'basket': (f'{ART}/banana/picnic_basket.png', 384),
    'banana': (f'{ART}/banana/banana.png', 256),
    'bunch': (f'{ART}/banana/banana_bunch.png', 256),
    'heart': (f'{ART}/banana/heart_life.png', 128),
    'ball': (f'{ART}/boss/prop_beach_ball.png', 192),
    'coin': (f'{ALEX}/v2_2/slice87.png', 192),
    'gift': (f'{ALEX}/v2_2/slice41.png', 192),
    'finger': (f'{ALEX}/inventory/slice37.png', 192),
    'timer': (f'{WS0}/timer.png', 128),
    'rush': (f'{WS0}/rush.png', 128),
    'crown': (f'{WS0}/crown.png', 128),
    'streak': (f'{PILOT}/streak-v1.png', 128),
}


def fit(im, long_side):
    im = im.convert('RGBA')
    bbox = im.getbbox()
    if bbox:
        im = im.crop(bbox)
    w, h = im.size
    k = long_side / max(w, h)
    if k < 1:
        im = im.resize((max(1, round(w * k)), max(1, round(h * k))), Image.LANCZOS)
    return im


def teal(im):
    """Rotate saturated red/orange/yellow body hues to teal-lime; soft pinks (cheeks) stay."""
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            hh, ss, vv = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            deg = hh * 360
            if deg > 340 and ss > 0.62:
                deg -= 360
            pinkish = deg < 8 and ss < 0.8
            if -20 <= deg <= 64 and ss > 0.62 and not pinkish:
                # warm red/orange -> teal, warm yellow highlights -> lime
                t = (max(deg, 0)) / 64
                nd = 186 - t * 92
                nr, ng, nb = colorsys.hsv_to_rgb(nd / 360, min(1, ss * 0.78), min(1, vv * 0.93))
                px[x, y] = (round(nr * 255), round(ng * 255), round(nb * 255), a)
    return im


def main():
    os.makedirs(OUT, exist_ok=True)
    for name, (path, side) in SRC.items():
        im = fit(Image.open(path), side)
        im.save(os.path.join(OUT, f'{name}.png'), optimize=True)
    for name, src in (('puffer', 'pufferfish'), ('puffer_full', 'pufferfish_puffed')):
        im = teal(fit(Image.open(f'{ART}/shared/{src}.png'), 256))
        im.save(os.path.join(OUT, f'{name}.png'), optimize=True)
    print('wrote', sorted(os.listdir(OUT)))


if __name__ == '__main__':
    main()
