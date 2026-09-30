/**
 * assets.ts: bundled Whack-a-Shark art (Metro needs literal requires).
 *
 * Sources (see /Users/dustinsparage/apps/tps-mg/art/whack/manifest.json):
 *   - Themed Finn peek/pop/dazed: Alex-style costume frames already shipped.
 *   - v2/golden_pop, angler, helmet, rim_<theme>: GPT Image 2.5 pipeline, gate-passed.
 *   - v2/shark_fist_pump, shark_dizzy, pufferfish*, fx_*: shared pipeline art, gate-passed.
 *   - v2/foam_finger, sunglasses: Alex originals (inventory slice37 / slice35), resized only.
 *   - Boss sprites: the app's shipped boss art (WS6-owned, read-only).
 *
 * BOX = content bounding box inside each PNG as [x0, y0, x1, y1] fractions
 * plus the image aspect (w/h), measured from the @3x files. The renderer
 * base-anchors every character on its content box (no floating sprites).
 */

import type { WhackThemeId } from './timeline';

export type WhackTheme = WhackThemeId;
export const THEMES: WhackThemeId[] = ['park', 'pirates', 'mansion', 'space', 'jungle', 'backlot'];

export const THEMED_SHARK_FRAMES = {
  park: [
    require('../../assets/games/whack/themes/park/peek.png'),
    require('../../assets/games/whack/themes/park/pop.png'),
    require('../../assets/games/whack/themes/park/dazed.png'),
  ],
  pirates: [
    require('../../assets/games/whack/themes/pirates/peek.png'),
    require('../../assets/games/whack/themes/pirates/pop.png'),
    require('../../assets/games/whack/themes/pirates/dazed.png'),
  ],
  mansion: [
    require('../../assets/games/whack/themes/mansion/peek.png'),
    require('../../assets/games/whack/themes/mansion/pop.png'),
    require('../../assets/games/whack/themes/mansion/dazed.png'),
  ],
  space: [
    require('../../assets/games/whack/themes/space/peek.png'),
    require('../../assets/games/whack/themes/space/pop.png'),
    require('../../assets/games/whack/themes/space/dazed.png'),
  ],
  jungle: [
    require('../../assets/games/whack/themes/jungle/peek.png'),
    require('../../assets/games/whack/themes/jungle/pop.png'),
    require('../../assets/games/whack/themes/jungle/dazed.png'),
  ],
  backlot: [
    require('../../assets/games/whack/themes/backlot/peek.png'),
    require('../../assets/games/whack/themes/backlot/pop.png'),
    require('../../assets/games/whack/themes/backlot/dazed.png'),
  ],
} as const;

export const RIMS: Record<WhackThemeId, number> = {
  park: require('../../assets/games/whack/v2/rim_park.png'),
  pirates: require('../../assets/games/whack/v2/rim_pirates.png'),
  mansion: require('../../assets/games/whack/v2/rim_mansion.png'),
  space: require('../../assets/games/whack/v2/rim_space.png'),
  jungle: require('../../assets/games/whack/v2/rim_jungle.png'),
  backlot: require('../../assets/games/whack/v2/rim_backlot.png'),
};

/**
 * Rim geometry: image aspect (w/h) and the open mouth ellipse inside the rim
 * image [cx, cy, rx, ry] as fractions of width/height (measured: the
 * transparent opening; the park rim is a front arc, so its mouth is estimated).
 */
export const RIM_GEO: Record<WhackThemeId, { aspect: number; mouth: [number, number, number, number] }> = {
  park: { aspect: 384 / 249, mouth: [0.49, 0.25, 0.25, 0.15] },
  pirates: { aspect: 318 / 293, mouth: [0.507, 0.3, 0.219, 0.062] },
  mansion: { aspect: 284 / 293, mouth: [0.515, 0.378, 0.247, 0.09] },
  space: { aspect: 318 / 261, mouth: [0.497, 0.473, 0.258, 0.132] },
  jungle: { aspect: 364 / 308, mouth: [0.542, 0.398, 0.212, 0.077] },
  backlot: { aspect: 391 / 293, mouth: [0.503, 0.497, 0.28, 0.135] },
};

export const ART = {
  golden: require('../../assets/games/whack/v2/golden_pop.png'),
  angler: require('../../assets/games/whack/v2/angler.png'),
  helmet: require('../../assets/games/whack/v2/helmet.png'),
  // Pipeline art (gate-passed): Bruiser Finn with the gold belt, lure-only angler tell, angry chomp, golden dazed, splats.
  bruiser: require('../../assets/games/whack/v2/bruiser_pop.png'),
  bruiserDazed: require('../../assets/games/whack/v2/bruiser_dazed.png'),
  anglerPeek: require('../../assets/games/whack/v2/angler_peek.png'),
  anglerAngry: require('../../assets/games/whack/v2/angler_angry.png'),
  goldenDazed: require('../../assets/games/whack/v2/golden_dazed.png'),
  splatInk: require('../../assets/games/whack/v2/splat_ink.png'),
  splatCandy: require('../../assets/games/whack/v2/splat_candy.png'),
  puffer: require('../../assets/games/whack/v2/pufferfish.png'),
  pufferPuffed: require('../../assets/games/whack/v2/pufferfish_puffed.png'),
  impactS: require('../../assets/games/whack/v2/fx_impact_s.png'),
  impactM: require('../../assets/games/whack/v2/fx_impact_m.png'),
  impactL: require('../../assets/games/whack/v2/fx_impact_l.png'),
  splashS: require('../../assets/games/whack/v2/fx_splash_s.png'),
  splashM: require('../../assets/games/whack/v2/fx_splash_m.png'),
  splashL: require('../../assets/games/whack/v2/fx_splash_l.png'),
  dizzyStar: require('../../assets/games/whack/v2/fx_small_dizzy_star.png'),
  sweat: require('../../assets/games/whack/v2/fx_small_sweat_drop.png'),
  foamFinger: require('../../assets/games/whack/v2/foam_finger.png'),
  sunglasses: require('../../assets/games/whack/v2/sunglasses.png'),
  playfield: require('../../../assets/images/screens/lineplay/whack-underwater-playfield-v1.png'),
  kraken: require('../../../assets/images/boss/kraken.png'),
  ghostSquid: require('../../../assets/images/boss/ghost_squid.png'),
  robo: require('../../../assets/images/boss/robo_shark-clean-v2.png'),
};

type Box = readonly [number, number, number, number, number];
/** Content boxes [x0, y0, x1, y1, aspect]: frame order peek, pop, dazed. */
export const THEME_BOX: Record<WhackThemeId, readonly [Box, Box, Box]> = {
  park: [[0.029, 0.101, 0.971, 0.903, 1.499], [0.129, 0.046, 0.874, 0.938, 1.0], [0.062, 0.091, 0.938, 0.89, 1.0]],
  pirates: [[0.038, 0.17, 0.962, 0.843, 1.499], [0.126, 0.058, 0.932, 0.94, 1.0], [0.073, 0.111, 0.952, 0.854, 1.0]],
  mansion: [[0.106, 0.089, 0.912, 0.873, 1.499], [0.103, 0.057, 0.935, 0.899, 0.869], [0.033, 0.116, 0.97, 0.877, 0.977]],
  space: [[0.078, 0.069, 0.932, 0.861, 1.499], [0.134, 0.024, 0.906, 0.961, 0.963], [0.047, 0.115, 0.968, 0.873, 0.963]],
  jungle: [[0.065, 0.154, 0.935, 0.868, 1.499], [0.115, 0.068, 0.91, 0.937, 1.0], [0.047, 0.109, 0.955, 0.851, 1.0]],
  backlot: [[0.048, 0.176, 0.952, 0.864, 1.499], [0.042, 0.072, 0.972, 0.903, 0.915], [0.042, 0.07, 0.974, 0.879, 0.915]],
};

export const ART_BOX: Record<'golden' | 'angler' | 'helmet' | 'bruiser' | 'bruiserDazed' | 'puffer' | 'pufferPuffed' | 'foamFinger' | 'sunglasses' | 'anglerPeek' | 'anglerAngry' | 'goldenDazed', Box> = {
  golden: [0.046, 0.036, 0.954, 0.964, 0.788],
  angler: [0.038, 0.04, 0.965, 0.96, 1.047],
  helmet: [0.038, 0.035, 0.962, 0.965, 0.91],
  bruiser: [0.038, 0.036, 0.96, 0.962, 0.955],
  bruiserDazed: [0.042, 0.036, 0.958, 0.962, 0.873],
  anglerPeek: [0.036, 0.065, 0.964, 0.935, 1.778],
  anglerAngry: [0.036, 0.04, 0.964, 0.96, 1.088],
  goldenDazed: [0.043, 0.036, 0.957, 0.964, 0.845],
  puffer: [0.035, 0.041, 0.965, 0.959, 1.176],
  pufferPuffed: [0.035, 0.036, 0.965, 0.961, 1.029],
  foamFinger: [0.043, 0.062, 0.928, 0.938, 0.871],
  sunglasses: [0.047, 0.081, 0.948, 0.919, 1.561],
};

/** Boss art aspect (w/h) for the top-zone set piece. */
export const BOSS_ART = [
  { src: ART.kraken, name: 'THE KRAKEN' },
  { src: ART.ghostSquid, name: 'GHOST SQUID' },
  { src: ART.robo, name: 'ROBO-SHARK' },
];

// Legacy exports (the Line Party BonkBoard and older call sites import these).
export const HOLE_IMAGE = require('../../assets/games/whack/hole.png');
export const SHARK_POP_FRAMES = [
  require('../../assets/games/whack/shark-pop-1.png'),
  require('../../assets/games/whack/shark-pop-2.png'),
  require('../../assets/games/whack/shark-pop-3.png'),
] as const;
export const DECOY_IMAGE = require('../../assets/games/whack/anglerfish-decoy.png');
export const GOLDEN_IMAGE = require('../../assets/games/whack/golden-shark.png');
