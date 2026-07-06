/**
 * assets.ts — bundled Sharky Swim art.
 *
 * Metro requires LITERAL require() paths (no dynamic keys), and it auto-picks
 * the @2x/@3x variant for the device density, so we only reference the @1x
 * base name here. All assets ship in the binary → offline-first (quality bar).
 */

/** The 3-frame swim flipbook, in cycle order. */
export const SHARK_FRAMES = [
  require('../../assets/games/sharky/shark-swim-1.png'),
  require('../../assets/games/sharky/shark-swim-2.png'),
  require('../../assets/games/sharky/shark-swim-3.png'),
] as const;

/** Golden bonus ring. */
export const RING_IMAGE = require('../../assets/games/sharky/shark-ring.png');

/** Parallax ocean layers, far → near. */
export const OCEAN_BACK = require('../../assets/games/sharky/ocean-layer-back.png');
export const OCEAN_MID = require('../../assets/games/sharky/ocean-layer-mid.png');
export const OCEAN_FRONT = require('../../assets/games/sharky/ocean-layer-front.png');
