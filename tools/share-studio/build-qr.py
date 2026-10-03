#!/usr/bin/env python3
"""Regenerate the per-kind QR codes (assets/images/share/qr/<kind>.png) and src/share/qr.ts.

usage: build-qr.py   (needs `pip install qrcode pillow`)
Each code encodes https://themeparkshark.com/app?c=flex_<kind> (src/share/link.ts).
"""
import pathlib, re, qrcode

root = pathlib.Path(__file__).resolve().parents[2]
kinds = re.findall(r"'([a-z_]+)'", (root / 'src/share/types.ts').read_text().split('export const FLEX_KINDS')[1].split('];')[0].split('= [')[1])
out = root / 'assets/images/share/qr'
out.mkdir(parents=True, exist_ok=True)
lines = []
for kind in kinds:
    q = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=10, border=1)
    q.add_data(f'https://themeparkshark.com/app?c=flex_{kind}')
    q.make(fit=True)
    q.make_image(fill_color=(5, 52, 110), back_color=(255, 255, 255)).convert('RGB').save(out / f'{kind}.png', optimize=True)
    lines.append(f"  {kind}: require('../../assets/images/share/qr/{kind}.png'),")
(root / 'src/share/qr.ts').write_text(
    "/** Per-kind QR codes (tools/share-studio/build-qr.py). Do not edit by hand. */\n"
    "import type { FlexKind } from './types';\n\n"
    "export const QR_BY_KIND: Readonly<Record<FlexKind, number>> = {\n" + '\n'.join(lines) + "\n};\n")
print(len(kinds), 'codes')
