/**
 * assets.ts — optional bundled art for Rhythm Tap.
 *
 * DESIGN: the game renders its timing ring and hit-flare as native Skia
 * primitives (Circle / radial burst) so it is fully playable with ZERO bundled
 * images — crisp, scalable, 60fps, and safe to ship before the asset pipeline
 * lands the PNGs. The generated art (tools/assets manifest ids `rhythm-ring`,
 * `rhythm-hit-flare` → src/assets/games/rhythm/*.png) is a pure visual UPGRADE.
 *
 * WHY NOT require() UNCONDITIONALLY: Metro resolves require('./x.png') at build
 * time and hard-errors if the file is absent. The rhythm PNGs are produced
 * asynchronously by `python3 tools/assets/generate.py --only rhythm` and may not
 * exist at bundle time. So the requires below stay COMMENTED until the files are
 * confirmed on disk, mirroring the SFX manifest pattern
 * (src/assets/games/sfx/manifest.ts).
 *
 * TO ENABLE THE ART (once @3x PNGs exist in src/assets/games/rhythm/):
 *   1. Uncomment the matching require() line below.
 *   2. That's it — RhythmField calls useImage() on these and automatically
 *      draws the textured ring/flare instead of the procedural fallback.
 */

/** A require()'d image module, or null when the asset isn't bundled yet. */
export type OptionalImageSource = number | null;

/**
 * Concentric timing-ring texture. manifest id: `rhythm-ring`.
 * Bundled — the @3x lands and Metro picks the right density automatically.
 */
export const RING_IMAGE: OptionalImageSource = require('../../assets/games/rhythm/rhythm-ring.png');

/**
 * Radial perfect-hit burst texture. manifest id: `rhythm-hit-flare`.
 * Bundled. Currently unused by the field (procedural burst is retained for
 * pooled 60fps particles); exported for future flare overlays / other games.
 */
export const HIT_FLARE_IMAGE: OptionalImageSource = require('../../assets/games/rhythm/rhythm-hit-flare.png');
