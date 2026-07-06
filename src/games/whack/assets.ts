/**
 * assets.ts — bundled Whack-a-Shark art.
 *
 * Metro requires LITERAL require() paths (no dynamic keys), and it auto-picks
 * the @2x/@3x variant for the device density, so we only reference the @1x
 * base name here. All assets ship in the binary → offline-first (quality bar).
 */

/** The hole plate every target pops out of. */
export const HOLE_IMAGE = require('../../assets/games/whack/hole.png');

/**
 * Shark pop flipbook, in cycle order:
 *   0 = anticipation grin (wind-up)
 *   1 = tall overshoot (fully popped)
 *   2 = dazed squash (whacked)
 * All three are ONE character (base_frame edit-derived from pop-1).
 */
export const SHARK_POP_FRAMES = [
  require('../../assets/games/whack/shark-pop-1.png'),
  require('../../assets/games/whack/shark-pop-2.png'),
  require('../../assets/games/whack/shark-pop-3.png'),
] as const;

/** Decoy anglerfish — tapping this is a penalty. */
export const DECOY_IMAGE = require('../../assets/games/whack/anglerfish-decoy.png');

/** Golden shark — x5 points + triggers fever mode. */
export const GOLDEN_IMAGE = require('../../assets/games/whack/golden-shark.png');
