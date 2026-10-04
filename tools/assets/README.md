# Queue Kit asset pipeline

Generates every minigame sprite/background/frame from `manifest.json` using
`openclaw infer image generate` (model `openai/gpt-image-2`), knocks the
chroma-key background out to alpha, and emits `@1x/@2x/@3x` PNGs into
`src/assets/games/<game>/`. Style is locked in `STYLE.md`.

```bash
python3 tools/assets/generate.py                # all batches, skips existing
python3 tools/assets/generate.py --only sharky  # one batch (gamekit|sharky|banana-basket|whack|rhythm|memory|lineplay)
python3 tools/assets/generate.py --only whack --force   # regenerate existing
python3 tools/assets/generate.py --dry-run      # print prompts+plan, no API calls
```

Idempotent (skips assets whose 3 density PNGs exist unless `--force`). Raw
green-key generations go to `.raw/` (gitignored); only the alpha density PNGs are
committed. Run timestamps land in `generated-manifest.json`. Exits nonzero if any
asset fails. Deps: python3 stdlib + Pillow + `sips` + `openclaw` (all present).

## Prep items (Home Hunt collectibles): `prep_items/`

The 200 live prep items (Churro Collection, Pretzel Collection, Night Lights,
Rain Parade, Camera Crew; 40 each) are bundled by `variant_slug` in
`src/helpers/prepItemImages.ts`. They are made with the art pipeline in
`tps-prime-time-audit/art-pilot/PIPELINE.md`, not `generate.py`: Codex GPT Image
via `tools/codex-image.sh`, Alex's hand-drawn references in `prep_items/refs/`,
the approved item-icon template, 2 variants per item.

```bash
python3 tools/assets/prep_items/run.py --only churros            # generate (3 Codex jobs at a time, skips existing)
python3 tools/assets/prep_items/run.py --slugs churro_07 --tag r2 --extra "tighter subject"   # re-roll one item
python3 tools/assets/prep_items/process.py gate churros         # PIPELINE gate sheets (128/40 px, cream + blue, beside Alex refs)
python3 tools/assets/prep_items/process.py compact churros      # dense pick sheet
python3 tools/assets/prep_items/finalize.py write               # picks.json -> assets/images/prep-items/<set>/<slug>.png (384 px, pngquant)
python3 tools/assets/prep_items/finalize.py sheets              # old vs new contact sheets
```

`subjects.py` holds every item's subject line (names and rarities mirror the
backend seeders) plus the locked per-set pose. Raw variants, picks and review
sheets live in `$ITEM_ART_OUT` (default `tps-prime-time-audit/next-wave/item-art-v2`).
`tools/tests/prep-item-art.test.cjs` fails if an item loses its art, drifts off
384 px, outgrows the OTA weight budget, or two items in a set share one silhouette
(the old palette-swap art).
