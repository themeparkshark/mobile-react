#!/usr/bin/env python3
"""Generate prep-item art via Codex GPT Image (free ChatGPT plan route).

Follows tps-prime-time-audit/art-pilot/PIPELINE.md: the approved item-icon
template (only {SUBJECT} changes), Alex's hand-drawn references attached as
local files, 2 variants per item, at most 3 Codex jobs at a time.

usage: run.py [--only churros,pretzels] [--slugs churro_01,...] [--tag v1] [--extra "text"] [--workers 3]
Raw variants land in $ITEM_ART_OUT/gen/<slug>[-<tag>]/<slug>-1.png, -2.png.
"""
import argparse, os, subprocess, sys, concurrent.futures as cf
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import subjects as S

TOOL = '/Users/dustinsparage/apps/tps-prime-time-audit/tools/codex-image.sh'
OUT = os.environ.get('ITEM_ART_OUT', os.path.expanduser('~/apps/tps-prime-time-audit/next-wave/item-art-v2'))
REFS = [os.path.join(HERE, 'refs', f) for f in ('alex_gift.png', 'alex_foam_finger.png', 'alex_sunglasses.png')]

ICON = ("A single game item icon of a {SUBJECT}, drawn by the same illustrator as the attached reference icons so it fits in the "
        "same hand-drawn Club Penguin style set: thick dark charcoal outline of even weight around the silhouette and main shapes, "
        "bold flat colour fills with the same soft single-direction shading as the gift box reference, a couple of crisp white highlight "
        "shapes, at most one small crisp sparkle, slightly chunky playful proportions, clean readable silhouette. Modernized a notch: "
        "crisper line work, richer more vibrant colour and a little more depth than the references, while staying clearly the same "
        "hand-drawn cartoon style. Not glossy plastic, not a generic mobile-game render, no glow, no heavy gradients. Centered single "
        "object filling about 85% of the frame, no text, no numbers, no background, no white sticker border, no drop shadow, transparent background.")


def prompt_for(name, subj):
    body = ICON.replace('{SUBJECT}', subj)
    refs = ', '.join(os.path.basename(r) for r in REFS)
    return f"""Use your image generation tool (GPT Image) to create TWO separate images (two independent generations of the same prompt, not one image with two versions).
Settings for each: size 1024x1024, quality high, background transparent, output format png.
Attach and use these reference images that are in the current directory as style references (they are the original artist's hand-drawn art): {refs}. Use them ONLY for drawing style (outline weight, fills, shading); do not copy their objects: no gift box, no foam finger, no sunglasses in the result.
Image prompt (use it exactly):
\"\"\"{body}\"\"\"
When both images are done, copy the generated PNG files into the current directory as {name}-1.png and {name}-2.png. Do not edit, crop or post-process them. Do not create any other files. Reply with just the two file names."""


def job(setkey, item, tag, extra):
    slug = item[0]
    name = slug if not tag else f'{slug}-{tag}'
    out = os.path.join(OUT, 'gen', name)
    if all(os.path.exists(f'{out}/{name}-{i}.png') for i in (1, 2)):
        return f'{name} SKIP'
    os.makedirs(out, exist_ok=True)
    subj = S.subject(setkey, item) + (f'; {extra}' if extra else '')
    pf = f'{out}/prompt.txt'
    open(pf, 'w').write(prompt_for(name, subj))
    for attempt in (1, 2):
        r = subprocess.run([TOOL, out, pf, *REFS], capture_output=True, text=True)
        open(f'{out}/codex-{attempt}.log', 'w').write(r.stdout + r.stderr)
        if all(os.path.exists(f'{out}/{name}-{i}.png') for i in (1, 2)):
            return f'{name} OK (attempt {attempt})'
    return f'{name} FAIL'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--only')
    ap.add_argument('--slugs')
    ap.add_argument('--tag', default='')
    ap.add_argument('--extra', default='')
    ap.add_argument('--workers', type=int, default=3)
    a = ap.parse_args()
    items = list(S.all_items())
    if a.only:
        keep = set(a.only.split(','))
        items = [x for x in items if x[0] in keep]
    if a.slugs:
        keep = set(a.slugs.split(','))
        items = [x for x in items if x[1][0] in keep]
    with cf.ThreadPoolExecutor(a.workers) as ex:
        for res in ex.map(lambda x: job(x[0], x[1], a.tag, a.extra), items):
            print(res, flush=True)


if __name__ == '__main__':
    main()
