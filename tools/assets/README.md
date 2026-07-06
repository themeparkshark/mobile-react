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
