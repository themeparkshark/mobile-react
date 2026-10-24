#!/usr/bin/env python3
"""
Measure how far each outfit paper's paint reaches across the shark's 1353x1530 canvas, for
src/share/lookBounds.ts (the share cards keep the prize readable under a wide costume).

Input: a TSV of `slot<TAB>item id<TAB>asset path` rows, one per catalog outfit paper, for example
from the scratch database:

  psql -h 127.0.0.1 -d tps_polish_1023 -AtF $'\\t' -c "select lower(t.name), i.id, a.path from items i
    join item_types t on t.id = i.item_type_id join assets a on a.id = i.paper_id
    where lower(t.name) in ('head','face','neck','body','hand') order by 1, 2" > papers.tsv

Usage: python3 tools/share-studio/measure-look-bounds.py papers.tsv CACHE_DIR [--check src/share/lookBounds.ts]

Papers are read from CACHE_DIR (downloaded from the public asset CDN when missing). A column counts
as painted when any pixel in it has alpha above ALPHA. A paper is "wide" when its paint starts left of
the bare body's 0.18 front or ends right of its 0.82 tail (BODY_EXTENT, with a 0.01 tolerance).

Prints the WIDE_PAPERS rows and the NARROW_PAPERS key prefixes. With --check it exits 1 when the
table in lookBounds.ts is missing a paper or disagrees with a measurement (so a new costume can
never ship without its bounds).
"""
import json
import os
import re
import sys
import urllib.request

from PIL import Image

CDN = 'https://assets.themeparkshark.com/mobile/production/'
ALPHA = 24
BODY = (0.18, 0.82)
TOL = 0.01
PREFIX = 10


def measure(path):
    im = Image.open(path).convert('RGBA')
    alpha = im.getchannel('A').point(lambda a: 255 if a > ALPHA else 0)
    box = alpha.getbbox()
    if not box:
        return None
    w = im.width
    return round(box[0] / w, 3), round(box[2] / w, 3)


def main(argv):
    if len(argv) < 3:
        print(__doc__)
        return 2
    tsv, cache = argv[1], argv[2]
    check = argv[argv.index('--check') + 1] if '--check' in argv else None
    os.makedirs(cache, exist_ok=True)
    wide, narrow, rows = {}, [], []
    for line in open(tsv, encoding='utf-8'):
        parts = line.rstrip('\n').split('\t')
        if len(parts) < 3 or not parts[2]:
            continue
        slot, item, path = parts[0], parts[1], parts[2]
        key = os.path.splitext(os.path.basename(path))[0]
        local = os.path.join(cache, os.path.basename(path))
        if not os.path.exists(local):
            req = urllib.request.Request(CDN + path, headers={'User-Agent': 'tps-share-studio/1'})
            with urllib.request.urlopen(req) as res, open(local, 'wb') as out:
                out.write(res.read())
        ext = measure(local)
        if ext is None:
            continue
        rows.append({'slot': slot, 'item': int(item), 'key': key, 'left': ext[0], 'right': ext[1]})
        if ext[0] < BODY[0] - TOL or ext[1] > BODY[1] + TOL:
            wide[key] = (ext, slot, item)
        else:
            narrow.append(key[:PREFIX])
    for key in sorted(wide):
        (l, r), slot, item = wide[key]
        print(f"  '{key}': [{l}, {r}], // {slot} {item}")
    print(f"NARROW ({len(narrow)}): {' '.join(sorted(set(narrow)))}")
    print(json.dumps({'papers': len(rows), 'wide': len(wide), 'narrow': len(set(narrow))}))
    if not check:
        return 0
    src = open(check, encoding='utf-8').read()
    table = {m[0]: (float(m[1]), float(m[2])) for m in re.findall(r"'([A-Za-z0-9]{40})': \[([\d.]+), ([\d.]+)\]", src)}
    narrow_src = re.search(r"NARROW_PAPERS = '([^']*)'", src)
    narrow_keys = set(narrow_src.group(1).split()) if narrow_src else set()
    bad = []
    for key, ((l, r), slot, item) in wide.items():
        got = table.get(key)
        if not got or abs(got[0] - l) > 0.02 or abs(got[1] - r) > 0.02:
            bad.append(f'wide {slot} {item} {key}: measured [{l}, {r}], table {got}')
    for key in narrow:
        if key not in narrow_keys and not any(k.startswith(key) for k in table):
            bad.append(f'narrow paper missing from NARROW_PAPERS: {key}')
    for b in bad:
        print('MISMATCH', b)
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
