# Queue Kit — Locked Asset Style Guide

Single source of visual truth for every generated game asset. The prompt prefix
below is copied verbatim from `MASTER_PLAN_QUEUE_KIT.md` (Component 4). Do not
edit the prefix without an architect sign-off — it is what keeps 100+ sprites
looking like one coherent set.

## Model + pipeline

- Model: **`openai/gpt-image-2`** (OAuth codex-responses transport, verified).
  Always pin `--model openai/gpt-image-2`. The bare `gpt-image-2` alias resolves
  to `litellm/gpt-image-2` (no key) and the default fallback chain hits an
  unconfigured Google key — both fail. Pin the provider.
- The provider's Codex transport **rejects `--background transparent`**. So we do
  NOT ask the API for transparency. Instead, transparency assets are generated on
  a flat solid chroma-key background and knocked out to alpha in `generate.py`
  via a corner-seeded flood fill (protects interior colors, clean anti-aliased
  edges). Chroma key = pure green `#00FF00`.

## Locked prompt prefix (verbatim from master plan)

> flat vector game asset, bold clean shapes, thick 3px outlines, TPS palette navy
> #09268f blue #00a5f5 gold #fec90e coral accent, subtle cel shading, transparent
> background, no text

Every manifest prompt is `PREFIX + ", " + subject + ", " + category_suffix`.
`generate.py` owns the prefix constant (`STYLE_PREFIX`) so it can never drift
from a hand-edited manifest.

## Palette (locked)

| Role   | Hex       |
|--------|-----------|
| Navy   | `#09268f` |
| Blue   | `#00a5f5` |
| Gold   | `#fec90e` |
| Coral  | coral accent (warm red-orange, used sparingly for pop/danger) |

Outlines are **navy `#09268f`**, not pure black. Cel shading only (2-3 flat tone
steps), never smooth photographic gradients.

## Perspective (locked, all categories)

Consistent **3/4 flat perspective** — a slight top-down tilt, flat lighting from
upper-left, no perspective vanishing lines, no realistic cast shadows. Every
sprite reads at a glance on a phone in bright sun.

## Per-category guidance

### Sprites (`needs_transparency: true`)
particles, shark frames, bananas, bombs, holes, cards, pickups, etc.

- Single centered subject, generous margin, nothing touching the frame edge.
- **NO glow, NO drop shadow, NO gradient halo, NO outer aura.** (Halos blend
  into the chroma key and leave a colored fringe after knockout — this is the #1
  failure mode. State it explicitly in the prompt.)
- Hard, crisp edge between subject and the flat green background.
- Background instruction the script appends automatically:
  `solid flat pure green background color #00FF00 filling all empty space, hard
  edge between subject and background, no blur`.
- Animation frames (e.g. shark swim 1/2/3, shark pop 1/2/3): describe the pose
  delta explicitly and keep everything else identical (same size, same palette,
  same outline weight) so frames line up.

### Backgrounds / parallax layers (`needs_transparency: false` for opaque fills; `true` for foreground layers)
sharky ocean layers, lineplay wait-card art.

- Fill the whole frame, full-bleed, no centered subject margin.
- Parallax layers that sit in front of others still need alpha (only the near
  ocean/foliage layer, sky/back layers are opaque). The manifest sets
  `needs_transparency` per layer.
- Wide sizes (e.g. `1536x1024`) for parallax scroll room.

### UI frames / cards (`needs_transparency: true`)
memory card backs, lore card frames, hit flares, rings.

- Frame/border art with an **empty transparent interior** where the app composits
  live content (card face, lore text, ride photo). Say "empty center", "hollow",
  "just the frame/border".
- Symmetric, tileable-friendly, thick navy outline consistent with sprites.
- Rings/flares: concentric, centered, transparent hole in the middle.

## Negative constraints (every prompt, enforced by `NEGATIVE` suffix)

- **no text, no letters, no numbers, no words** (the model loves to scribble)
- **no watermark, no signature, no logo**
- **no photorealism, no 3D render, no realistic photography** — flat vector only
- **no busy background, no scene** for sprites (isolated subject only)
- consistent 3/4 flat perspective, no dramatic perspective distortion

## Sizing

Base sizes are authored per asset in the manifest at a supported gpt-image-2
geometry (`1024x1024`, `1536x1024`, `1024x1536`). The script then produces the
mobile density set with `sips`:

- `<id>.png`      = @1x (base ÷ 3, rounded)
- `<id>@2x.png`   = @2x (base ÷ 1.5)
- `<id>@3x.png`   = @3x (base, the generated resolution)

React Native picks the right density automatically from the `@2x`/`@3x` suffix.
