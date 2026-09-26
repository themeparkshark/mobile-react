/**
 * SFX manifest — semantic sound name → bundled audio asset.
 *
 * HOW TO ADD A SOUND
 * ------------------
 * 1. Drop the audio file next to this manifest, e.g.
 *    src/assets/games/sfx/tap.mp3
 * 2. Uncomment (or add) the matching line below with a static require():
 *    tap: require('./tap.mp3'),
 *
 * The require() MUST be a literal path — Metro resolves these at build time,
 * so dynamic keys will not work. Every name that is NOT present here resolves
 * to a silent no-op at runtime (see SFX.ts), so the whole system is safe to
 * ship before any audio assets land.
 *
 * Keep this list in sync with SfxName below — the type is the contract games
 * code against; the map is what actually exists on disk today.
 */

/** Every semantic sound a game may request. Stable API surface. */
export type SfxName =
  | 'tap'
  | 'hit'
  | 'combo'
  | 'fail'
  | 'tick'
  | 'win'
  | 'lose'
  | 'star'
  | 'countdown'
  | 'go'
  | 'whoosh'
  | 'coin';

/**
 * A require()'d audio module. expo-av accepts `number` (the Metro asset id)
 * as the source for Audio.Sound.createAsync.
 */
export type SfxAsset = number;

/**
 * Present sounds only. Missing names fall back to silence.
 *
 * Reuse the app's verified bundled clips until dedicated GameKit cues land.
 * Keep the metronome and tap sounds short so rapid play stays crisp.
 */
export const SFX_MANIFEST: Partial<Record<SfxName, SfxAsset>> = {
  tap: require('../../../../assets/sounds/tap.mp3'),
  hit: require('../../../../assets/sounds/inventory_item_tap.mp3'),
  combo: require('../../../../assets/sounds/reveal.mp3'),
  fail: require('../../../../assets/sounds/nope.mp3'),
  tick: require('../../../../assets/sounds/button_press.mp3'),
  win: require('../../../../assets/sounds/reward.mp3'),
  lose: require('../../../../assets/sounds/nope.mp3'),
  star: require('../../../../assets/sounds/reveal.mp3'),
  countdown: require('../../../../assets/sounds/pin_swap_select_pin.mp3'),
  go: require('../../../../assets/sounds/whoosh.mp3'),
  whoosh: require('../../../../assets/sounds/whoosh.mp3'),
  coin: require('../../../../assets/sounds/inventory_item_tap.mp3'),
};
